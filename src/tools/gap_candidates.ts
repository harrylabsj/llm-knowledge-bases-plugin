import fs from "node:fs/promises";
import path from "node:path";

import type {
  DerivedNoteKind,
  GapCandidate,
  GapCandidateCategory,
  GapCandidateDraft,
  GapCandidatePriority,
  KnowledgeBasePluginConfig,
} from "../types.js";
import {
  DERIVED_NOTE_REQUIRED_HEADINGS,
  parseDerivedNoteMarkdown,
  parseOutputNoteMarkdown,
  parseSourceNoteMarkdown,
} from "../core/frontmatter.js";
import {
  extractExcerpt,
  extractWikiLinks,
} from "../core/note-analysis.js";
import { listMarkdownFiles } from "../core/notes.js";
import { buildDerivedNoteId, buildDerivedNotePath } from "../core/naming.js";
import { getVaultPaths, resolveVaultPath } from "../core/paths.js";
import { slugify } from "../core/slug.js";

type ParsedWikiNote = {
  path: string;
  type: "source" | "output" | DerivedNoteKind;
  id: string;
  title: string;
  aliases: string[];
  body: string;
  sourceRefs: string[];
  excerpt: string;
};

type CandidateAccumulator = Omit<GapCandidate, "reason" | "priority" | "next_action" | "draft"> & {
  reasons: Set<string>;
  sourceTitles: Set<string>;
  evidenceSummary: Set<string>;
};

export type GapCandidateCollection = {
  scannedNoteCount: number;
  candidates: GapCandidate[];
};

function normalizeLookupKey(value: string): string {
  return slugify(
    value
      .replace(/\.md$/i, "")
      .replace(/^.*\//, "")
      .trim(),
  );
}

function buildDerivedPathForKind(config: KnowledgeBasePluginConfig, kind: DerivedNoteKind, noteId: string): string {
  const paths = getVaultPaths(config);

  switch (kind) {
    case "concept":
      return buildDerivedNotePath(paths.concepts, noteId);
    case "entity":
      return buildDerivedNotePath(paths.entities, noteId);
    case "synthesis":
      return buildDerivedNotePath(paths.syntheses, noteId);
  }
}

function unionUnique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort();
}

function priorityFromScore(score: number): GapCandidatePriority {
  if (score >= 8) {
    return "high";
  }
  if (score >= 6) {
    return "medium";
  }
  return "low";
}

function renderYamlList(values: string[]): string {
  return values.map((value) => `  - ${value}`).join("\n");
}

function buildDraftMarkdown(input: {
  kind: DerivedNoteKind;
  noteId: string;
  title: string;
  sourceRefs: string[];
  suggestedOpening: string;
  evidenceSummary: string[];
}): GapCandidateDraft {
  const headings = [...DERIVED_NOTE_REQUIRED_HEADINGS[input.kind]];
  const timestamp = new Date().toISOString();
  const sections = headings
    .map((heading) => {
      if (heading === "Summary") {
        return `# Summary\n\n${input.suggestedOpening}`;
      }
      if (heading === "Evidence" || heading === "Supporting Evidence") {
        const bullets = input.evidenceSummary.length
          ? input.evidenceSummary.map((item) => `- ${item}`).join("\n")
          : "- _TODO: Summarize the strongest evidence from the cited sources._";
        return `# ${heading}\n\n${bullets}`;
      }
      return `# ${heading}\n\n_TODO: Fill this section from the cited sources._`;
    })
    .join("\n\n");

  return {
    use_tool: "kb_upsert_derived_note",
    required_headings: headings,
    suggested_opening: input.suggestedOpening,
    evidence_summary: input.evidenceSummary,
    markdown: `---
id: ${input.noteId}
type: ${input.kind}
title: ${input.title}
aliases: []
source_refs:
${renderYamlList(input.sourceRefs)}
tags: []
created_at: ${timestamp}
updated_at: ${timestamp}
status: draft
---

${sections}
`,
  };
}

function isQuestionLike(title: string): boolean {
  return /[?]$/.test(title.trim()) || /^(what|why|how|when|where|which)\b/i.test(title.trim());
}

function isEntityLikeTitle(title: string): boolean {
  const words = title.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 6) {
    return false;
  }
  if (/[?]/.test(title) || /[:;()]/.test(title)) {
    return false;
  }

  return words.some((word) => /[A-Z0-9]/.test(word)) && !/^(the|a|an)\b/i.test(title);
}

function classifyMissingLinkKind(target: string, label: string): DerivedNoteKind {
  const candidate = `${target} ${label}`.toLowerCase();
  if (target.startsWith("entity-")) {
    return "entity";
  }
  if (target.startsWith("synthesis-")) {
    return "synthesis";
  }
  if (target.startsWith("concept-")) {
    return "concept";
  }
  if (/(vs\b|tradeoff|comparison|compare|landscape|taxonomy|overview|architecture|design)/.test(candidate)) {
    return "synthesis";
  }
  if (isEntityLikeTitle(label || target)) {
    return "entity";
  }
  return "concept";
}

function accumulateCandidate(
  acc: Map<string, CandidateAccumulator>,
  candidate: {
    category: GapCandidateCategory;
    kind: DerivedNoteKind;
    title: string;
    sourceRefs: string[];
    evidencePaths: string[];
    score: number;
    reason: string;
  },
  config: KnowledgeBasePluginConfig,
): void {
  const suggestedNoteId = buildDerivedNoteId(candidate.kind, candidate.title);
  const key = `${candidate.kind}:${suggestedNoteId}`;
  const existing = acc.get(key);

  if (existing) {
    existing.source_refs = unionUnique([...existing.source_refs, ...candidate.sourceRefs]);
    existing.evidence_paths = unionUnique([...existing.evidence_paths, ...candidate.evidencePaths]);
    existing.score = Math.max(existing.score, candidate.score);
    existing.reasons.add(candidate.reason);
    return;
  }

  acc.set(key, {
    category: candidate.category,
    kind: candidate.kind,
    title: candidate.title,
    suggested_note_id: suggestedNoteId,
    suggested_note_path: buildDerivedPathForKind(config, candidate.kind, suggestedNoteId),
    source_refs: unionUnique(candidate.sourceRefs),
    evidence_paths: unionUnique(candidate.evidencePaths),
    score: candidate.score,
    reasons: new Set([candidate.reason]),
    sourceTitles: new Set(),
    evidenceSummary: new Set(),
  });
}

async function loadWikiNotes(config: KnowledgeBasePluginConfig): Promise<ParsedWikiNote[]> {
  const paths = getVaultPaths(config);
  const filePaths = (
    await Promise.all([
      listMarkdownFiles(config, paths.sources),
      listMarkdownFiles(config, paths.outputs),
      listMarkdownFiles(config, paths.concepts),
      listMarkdownFiles(config, paths.entities),
      listMarkdownFiles(config, paths.syntheses),
    ])
  ).flat();

  const notes: ParsedWikiNote[] = [];

  for (const notePath of filePaths) {
    const content = await fs.readFile(await resolveVaultPath(config, notePath), "utf8");

    if (notePath.startsWith(`${paths.sources}/`)) {
      const { frontmatter, body } = parseSourceNoteMarkdown(content);
      notes.push({
        path: notePath,
        type: "source",
        id: frontmatter.id,
        title: frontmatter.title,
        aliases: [],
        body,
        sourceRefs: [frontmatter.id],
        excerpt: extractExcerpt(body),
      });
      continue;
    }

    if (notePath.startsWith(`${paths.outputs}/`)) {
      const { frontmatter, body } = parseOutputNoteMarkdown(content);
      notes.push({
        path: notePath,
        type: "output",
        id: frontmatter.id,
        title: frontmatter.title,
        aliases: [],
        body,
        sourceRefs: frontmatter.source_refs,
        excerpt: extractExcerpt(body),
      });
      continue;
    }

    const { frontmatter, body } = parseDerivedNoteMarkdown(content);
    notes.push({
      path: notePath,
      type: frontmatter.type,
      id: frontmatter.id,
      title: frontmatter.title,
      aliases: frontmatter.aliases,
      body,
      sourceRefs: frontmatter.source_refs,
      excerpt: extractExcerpt(body),
    });
  }

  return notes;
}

function hasEquivalentDerivedNote(
  derivedNotes: ParsedWikiNote[],
  kind: DerivedNoteKind,
  title: string,
  sourceRefs: string[],
): boolean {
  const titleKey = normalizeLookupKey(title);
  const sourceKey = unionUnique(sourceRefs).join(",");

  return derivedNotes.some((note) => {
    if (note.type !== kind) {
      return false;
    }
    const noteTitleKey = normalizeLookupKey(note.title);
    const noteSourceKey = unionUnique(note.sourceRefs).join(",");
    return noteTitleKey === titleKey || (sourceKey.length > 0 && noteSourceKey === sourceKey);
  });
}

function buildSuggestedOpening(input: {
  kind: DerivedNoteKind;
  title: string;
  sourceTitles: string[];
  sourceRefs: string[];
}): string {
  const joinedSources = input.sourceTitles.slice(0, 3).join(", ");
  const sourceClause =
    joinedSources.length > 0
      ? ` It should stay grounded in ${joinedSources}${input.sourceTitles.length > 3 ? ", and related sources" : ""}.`
      : input.sourceRefs.length > 0
        ? ` It should stay grounded in ${input.sourceRefs.length} cited source note(s).`
        : "";

  switch (input.kind) {
    case "concept":
      return `${input.title} is a recurring concept in this wiki and deserves a dedicated page so the same reasoning does not keep getting rewritten in outputs or ad hoc notes.${sourceClause}`;
    case "entity":
      return `${input.title} appears often enough in the current corpus to deserve its own entity page, capturing what it is, why it matters here, and the core facts the wiki keeps reusing.${sourceClause}`;
    case "synthesis":
      return `${input.title} deserves a dedicated synthesis page because the current wiki already combines multiple notes around this theme but has not yet promoted the result into a reusable thesis page.${sourceClause}`;
  }
}

function buildEvidenceSummary(input: {
  evidencePaths: string[];
  evidenceNoteByPath: Map<string, ParsedWikiNote>;
  sourceRefs: string[];
  sourceNoteById: Map<string, ParsedWikiNote>;
}): string[] {
  const summaries: string[] = [];

  for (const notePath of input.evidencePaths) {
    const note = input.evidenceNoteByPath.get(notePath);
    if (!note || !note.excerpt) {
      continue;
    }
    summaries.push(`${note.title}: ${note.excerpt}`);
  }

  for (const sourceRef of input.sourceRefs) {
    const note = input.sourceNoteById.get(sourceRef);
    if (!note || !note.excerpt) {
      continue;
    }
    summaries.push(`${note.title}: ${note.excerpt}`);
  }

  return unionUnique(summaries).slice(0, 5);
}

function buildGapCandidateReport(
  candidates: Map<string, CandidateAccumulator>,
  noteByPath: Map<string, ParsedWikiNote>,
  sourceNoteById: Map<string, ParsedWikiNote>,
): GapCandidate[] {
  return [...candidates.values()]
    .map((candidate) => {
      const sourceTitles = unionUnique([...candidate.sourceTitles]);
      const evidenceSummary = buildEvidenceSummary({
        evidencePaths: candidate.evidence_paths,
        evidenceNoteByPath: noteByPath,
        sourceRefs: candidate.source_refs,
        sourceNoteById,
      });
      const suggestedOpening = buildSuggestedOpening({
        kind: candidate.kind,
        title: candidate.title,
        sourceTitles,
        sourceRefs: candidate.source_refs,
      });

      return {
        ...candidate,
        reason: Array.from(candidate.reasons).sort().join(" "),
        priority: priorityFromScore(candidate.score),
        next_action: "draft_and_upsert" as const,
        draft: buildDraftMarkdown({
          kind: candidate.kind,
          noteId: candidate.suggested_note_id,
          title: candidate.title,
          sourceRefs: candidate.source_refs,
          suggestedOpening,
          evidenceSummary: evidenceSummary.length > 0 ? evidenceSummary : [...candidate.evidenceSummary],
        }),
      };
    })
    .sort(
      (left, right) =>
        right.score - left.score ||
        left.title.localeCompare(right.title) ||
        left.kind.localeCompare(right.kind),
    );
}

export async function collectGapCandidates(config: KnowledgeBasePluginConfig): Promise<GapCandidateCollection> {
  const notes = await loadWikiNotes(config);
  const derivedNotes = notes.filter(
    (note): note is ParsedWikiNote & { type: DerivedNoteKind } =>
      note.type === "concept" || note.type === "entity" || note.type === "synthesis",
  );
  const outputs = notes.filter((note) => note.type === "output");
  const sources = notes.filter((note) => note.type === "source");
  const sourceNoteById = new Map(sources.map((note) => [note.id, note]));
  const noteByPath = new Map(notes.map((note) => [note.path, note]));

  const existingLookup = new Set<string>();
  for (const note of notes) {
    existingLookup.add(normalizeLookupKey(note.id));
    existingLookup.add(normalizeLookupKey(note.title));
    existingLookup.add(normalizeLookupKey(path.posix.basename(note.path)));
    for (const alias of note.aliases) {
      existingLookup.add(normalizeLookupKey(alias));
    }
  }

  const candidates = new Map<string, CandidateAccumulator>();

  for (const note of notes) {
    for (const link of extractWikiLinks(note.body)) {
      const targetKey = normalizeLookupKey(link.target);
      if (existingLookup.has(targetKey)) {
        continue;
      }

      const title = link.label.replace(/[-_]+/g, " ").trim();
      if (!title) {
        continue;
      }

      const kind = classifyMissingLinkKind(link.target, link.label);
      accumulateCandidate(
        candidates,
        {
          category: "missing_link",
          kind,
          title,
          sourceRefs: note.sourceRefs,
          evidencePaths: [note.path],
          score: 5 + note.sourceRefs.length,
          reason: `Linked from ${note.path} but no matching ${kind} page exists for [[${link.target}]].`,
        },
        config,
      );
      const key = `${kind}:${buildDerivedNoteId(kind, title)}`;
      const current = candidates.get(key);
      if (current) {
        note.sourceRefs
          .map((sourceRef) => sourceNoteById.get(sourceRef)?.title)
          .filter((value): value is string => Boolean(value))
          .forEach((value) => current.sourceTitles.add(value));
        if (note.excerpt) {
          current.evidenceSummary.add(`${note.title}: ${note.excerpt}`);
        }
      }
    }
  }

  for (const output of outputs) {
    if (output.sourceRefs.length < 2 || isQuestionLike(output.title)) {
      continue;
    }

    if (hasEquivalentDerivedNote(derivedNotes, "synthesis", output.title, output.sourceRefs)) {
      continue;
    }

    accumulateCandidate(
      candidates,
      {
        category: "unpromoted_output",
        kind: "synthesis",
        title: output.title,
        sourceRefs: output.sourceRefs,
        evidencePaths: [output.path],
        score: 7 + output.sourceRefs.length,
        reason: `Output ${output.path} draws on multiple sources but no synthesis page covers the same title or source set.`,
      },
      config,
    );
    const key = `synthesis:${buildDerivedNoteId("synthesis", output.title)}`;
    const current = candidates.get(key);
    if (current) {
      output.sourceRefs
        .map((sourceRef) => sourceNoteById.get(sourceRef)?.title)
        .filter((value): value is string => Boolean(value))
        .forEach((value) => current.sourceTitles.add(value));
      if (output.excerpt) {
        current.evidenceSummary.add(`${output.title}: ${output.excerpt}`);
      }
    }
  }

  for (const source of sources) {
    if (!isEntityLikeTitle(source.title)) {
      continue;
    }

    const referencingNotes = notes.filter(
      (note) => note.type !== "source" && note.sourceRefs.includes(source.id),
    );

    if (referencingNotes.length < 2) {
      continue;
    }

    if (hasEquivalentDerivedNote(derivedNotes, "entity", source.title, [source.id])) {
      continue;
    }

    accumulateCandidate(
      candidates,
      {
        category: "unpromoted_entity",
        kind: "entity",
        title: source.title,
        sourceRefs: [source.id],
        evidencePaths: referencingNotes.map((note) => note.path),
        score: 6 + referencingNotes.length,
        reason: `Source ${source.id} appears in ${referencingNotes.length} downstream notes without a dedicated entity page.`,
      },
      config,
    );
    const key = `entity:${buildDerivedNoteId("entity", source.title)}`;
    const current = candidates.get(key);
    if (current) {
      current.sourceTitles.add(source.title);
      if (source.excerpt) {
        current.evidenceSummary.add(`${source.title}: ${source.excerpt}`);
      }
      for (const note of referencingNotes) {
        if (note.excerpt) {
          current.evidenceSummary.add(`${note.title}: ${note.excerpt}`);
        }
      }
    }
  }

  return {
    scannedNoteCount: notes.length,
    candidates: buildGapCandidateReport(candidates, noteByPath, sourceNoteById),
  };
}
