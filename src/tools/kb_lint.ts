import fs from "node:fs/promises";
import path from "node:path";

import type {
  DerivedNoteKind,
  KnowledgeBasePluginConfig,
  LintIssue,
  ManifestFile,
} from "../types.js";
import type {
  DerivedNoteFrontmatter,
  OutputNoteFrontmatter,
  SourceNoteFrontmatter,
} from "../core/frontmatter.js";
import {
  DERIVED_NOTE_REQUIRED_HEADINGS,
  OUTPUT_REQUIRED_HEADINGS,
  SOURCE_REQUIRED_HEADINGS,
  parseDerivedNoteMarkdown,
  parseOutputNoteMarkdown,
  parseSourceNoteMarkdown,
} from "../core/frontmatter.js";
import { hashFile } from "../core/hash.js";
import { loadManifest } from "../core/manifest.js";
import { extractSection, extractWikiLinks, stripMarkdown } from "../core/note-analysis.js";
import { buildDerivedNotePath, buildOutputPathFromId } from "../core/naming.js";
import { listMarkdownFiles } from "../core/notes.js";
import { getVaultPaths, resolveVaultPath } from "../core/paths.js";
import { listRawFiles } from "../core/scan.js";
import { slugify } from "../core/slug.js";
import { requireHeadings, validateRuntimeConfig } from "../core/validate.js";
import { collectGapCandidates } from "./gap_candidates.js";

type ValidNoteRecord = {
  path: string;
  id: string;
  type: "source" | "output" | DerivedNoteKind;
  title: string;
  aliases: string[];
  body: string;
  sourceRefs: string[];
  updatedAt: string;
  frontmatter: SourceNoteFrontmatter | OutputNoteFrontmatter | DerivedNoteFrontmatter;
};

function pushIssue(issues: LintIssue[], issue: LintIssue): void {
  issues.push(issue);
}

function canonicalSourcePath(config: KnowledgeBasePluginConfig, docId: string): string {
  return `${getVaultPaths(config).sources}/${docId}.md`;
}

function normalizeLookupKey(value: string): string {
  return slugify(
    value
      .replace(/\.md$/i, "")
      .replace(/^.*\//, "")
      .trim(),
  );
}

function canonicalDerivedPath(
  config: KnowledgeBasePluginConfig,
  type: DerivedNoteKind,
  noteId: string,
): string {
  const paths = getVaultPaths(config);

  switch (type) {
    case "concept":
      return buildDerivedNotePath(paths.concepts, noteId);
    case "entity":
      return buildDerivedNotePath(paths.entities, noteId);
    case "synthesis":
      return buildDerivedNotePath(paths.syntheses, noteId);
  }
}

async function sourceRefExists(
  config: KnowledgeBasePluginConfig,
  _manifest: ManifestFile,
  knownSourceIds: Set<string>,
  sourceRef: string,
): Promise<boolean> {
  if (knownSourceIds.has(sourceRef)) {
    return true;
  }

  try {
    await fs.stat(await resolveVaultPath(config, `${getVaultPaths(config).sources}/${sourceRef}.md`));
    return true;
  } catch {
    return false;
  }
}

async function lintSourceNotes(
  config: KnowledgeBasePluginConfig,
  manifest: ManifestFile,
  issues: LintIssue[],
): Promise<ValidNoteRecord[]> {
  const paths = getVaultPaths(config);
  const sourcePaths = await listMarkdownFiles(config, paths.sources);
  const validNotes: ValidNoteRecord[] = [];

  for (const notePath of sourcePaths) {
    const absolutePath = await resolveVaultPath(config, notePath);
    const content = await fs.readFile(absolutePath, "utf8");

    try {
      const { frontmatter, body } = parseSourceNoteMarkdown(content);
      requireHeadings(body, [...SOURCE_REQUIRED_HEADINGS]);
      validNotes.push({
        path: notePath,
        id: frontmatter.id,
        type: "source",
        title: frontmatter.title,
        aliases: [],
        body,
        sourceRefs: [frontmatter.id],
        updatedAt: frontmatter.updated_at,
        frontmatter,
      });

      const expectedPath = canonicalSourcePath(config, frontmatter.id);
      if (notePath !== expectedPath || path.posix.parse(notePath).name !== frontmatter.id) {
        pushIssue(issues, {
          code: "illegal_write_location",
          severity: "error",
          path: notePath,
          message: `source note path must be ${expectedPath}`,
        });
      }

      if (!frontmatter.raw_path.startsWith(`${config.rawDir}/`)) {
        pushIssue(issues, {
          code: "validation_error",
          severity: "error",
          path: notePath,
          message: "source note raw_path must stay under raw/",
        });
        continue;
      }

      try {
        const currentRawHash = await hashFile(await resolveVaultPath(config, frontmatter.raw_path));
        if (frontmatter.raw_hash !== currentRawHash) {
          pushIssue(issues, {
            code: "hash_mismatch",
            severity: "error",
            path: notePath,
            message: "source note raw_hash does not match the current raw file",
          });
        }
      } catch {
        pushIssue(issues, {
          code: "missing_raw",
          severity: "error",
          path: frontmatter.raw_path,
          message: "source note references a raw file that does not exist",
        });
      }

      const manifestEntry = manifest.sources[frontmatter.raw_path];
      if (manifestEntry && manifestEntry.source_note_path !== expectedPath) {
        pushIssue(issues, {
          code: "illegal_write_location",
          severity: "error",
          path: notePath,
          message: `manifest source_note_path must be ${expectedPath}`,
        });
      }
    } catch (error) {
      pushIssue(issues, {
        code: "validation_error",
        severity: "error",
        path: notePath,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return validNotes;
}

async function lintOutputNotes(
  config: KnowledgeBasePluginConfig,
  manifest: ManifestFile,
  knownSourceIds: Set<string>,
  issues: LintIssue[],
): Promise<ValidNoteRecord[]> {
  const paths = getVaultPaths(config);
  const outputPaths = await listMarkdownFiles(config, paths.outputs);
  const validNotes: ValidNoteRecord[] = [];

  for (const notePath of outputPaths) {
    const absolutePath = await resolveVaultPath(config, notePath);
    const content = await fs.readFile(absolutePath, "utf8");

    try {
      const { frontmatter, body } = parseOutputNoteMarkdown(content);
      requireHeadings(body, [...OUTPUT_REQUIRED_HEADINGS]);
      validNotes.push({
        path: notePath,
        id: frontmatter.id,
        type: "output",
        title: frontmatter.title,
        aliases: [],
        body,
        sourceRefs: frontmatter.source_refs,
        updatedAt: frontmatter.updated_at,
        frontmatter,
      });

      const expectedPath = buildOutputPathFromId(paths.outputs, frontmatter.id);
      if (notePath !== expectedPath) {
        pushIssue(issues, {
          code: "illegal_write_location",
          severity: "error",
          path: notePath,
          message: `output note path must be ${expectedPath}`,
        });
      }

      for (const sourceRef of frontmatter.source_refs) {
        if (!(await sourceRefExists(config, manifest, knownSourceIds, sourceRef))) {
          pushIssue(issues, {
            code: "invalid_source_ref",
            severity: "error",
            path: notePath,
            message: `output note source_refs references missing source "${sourceRef}"`,
          });
        }
      }
    } catch (error) {
      pushIssue(issues, {
        code: "validation_error",
        severity: "error",
        path: notePath,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return validNotes;
}

async function lintDerivedNotes(
  config: KnowledgeBasePluginConfig,
  manifest: ManifestFile,
  knownSourceIds: Set<string>,
  issues: LintIssue[],
): Promise<ValidNoteRecord[]> {
  const paths = getVaultPaths(config);
  const derivedPaths = (
    await Promise.all([
      listMarkdownFiles(config, paths.concepts),
      listMarkdownFiles(config, paths.entities),
      listMarkdownFiles(config, paths.syntheses),
    ])
  ).flat();
  const validNotes: ValidNoteRecord[] = [];

  for (const notePath of derivedPaths) {
    const absolutePath = await resolveVaultPath(config, notePath);
    const content = await fs.readFile(absolutePath, "utf8");

    try {
      const { frontmatter, body } = parseDerivedNoteMarkdown(content);
      requireHeadings(body, [...DERIVED_NOTE_REQUIRED_HEADINGS[frontmatter.type]]);
      validNotes.push({
        path: notePath,
        id: frontmatter.id,
        type: frontmatter.type,
        title: frontmatter.title,
        aliases: frontmatter.aliases,
        body,
        sourceRefs: frontmatter.source_refs,
        updatedAt: frontmatter.updated_at,
        frontmatter,
      });

      const expectedPath = canonicalDerivedPath(config, frontmatter.type, frontmatter.id);
      if (notePath !== expectedPath || path.posix.parse(notePath).name !== frontmatter.id) {
        pushIssue(issues, {
          code: "illegal_write_location",
          severity: "error",
          path: notePath,
          message: `derived note path must be ${expectedPath}`,
        });
      }

      for (const sourceRef of frontmatter.source_refs) {
        if (!(await sourceRefExists(config, manifest, knownSourceIds, sourceRef))) {
          pushIssue(issues, {
            code: "invalid_source_ref",
            severity: "error",
            path: notePath,
            message: `derived note source_refs references missing source "${sourceRef}"`,
          });
        }
      }
    } catch (error) {
      pushIssue(issues, {
        code: "validation_error",
        severity: "error",
        path: notePath,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return validNotes;
}

function lintDuplicateIds(notes: ValidNoteRecord[], issues: LintIssue[]): void {
  const byId = new Map<string, ValidNoteRecord[]>();

  for (const note of notes) {
    const group = byId.get(note.id) ?? [];
    group.push(note);
    byId.set(note.id, group);
  }

  for (const [id, group] of byId.entries()) {
    if (group.length < 2) {
      continue;
    }

    for (const note of group) {
      pushIssue(issues, {
        code: "duplicate_id",
        severity: "error",
        path: note.path,
        message: `duplicate id "${id}" detected`,
      });
    }
  }
}

function buildNotePathIndex(notes: ValidNoteRecord[]): Map<string, Set<string>> {
  const index = new Map<string, Set<string>>();

  for (const note of notes) {
    const keys = [
      note.id,
      note.title,
      path.posix.basename(note.path),
      note.path,
      ...note.aliases,
    ];

    for (const key of keys) {
      const normalized = normalizeLookupKey(key);
      if (!normalized) {
        continue;
      }
      const existing = index.get(normalized) ?? new Set<string>();
      existing.add(note.path);
      index.set(normalized, existing);
    }
  }

  return index;
}

function resolveWikiLinkedPaths(
  note: ValidNoteRecord,
  notePathIndex: Map<string, Set<string>>,
): string[] {
  const linkedPaths = new Set<string>();

  for (const link of extractWikiLinks(note.body)) {
    for (const candidateKey of [link.target, link.label]) {
      const normalized = normalizeLookupKey(candidateKey);
      if (!normalized) {
        continue;
      }
      const matches = notePathIndex.get(normalized);
      if (!matches) {
        continue;
      }
      for (const match of matches) {
        if (match !== note.path) {
          linkedPaths.add(match);
        }
      }
    }
  }

  return [...linkedPaths];
}

function lintDraftPlaceholders(notes: ValidNoteRecord[], issues: LintIssue[]): void {
  for (const note of notes) {
    if (!/(^|\W)_?TODO:/im.test(note.body)) {
      continue;
    }

    pushIssue(issues, {
      code: "draft_placeholder",
      severity: "warning",
      path: note.path,
      message: "note still contains TODO placeholder text and likely needs refinement",
    });
  }
}

function lintCrossLinkHealth(notes: ValidNoteRecord[], issues: LintIssue[]): void {
  const notePathIndex = buildNotePathIndex(notes);
  const inboundLinkCounts = new Map<string, number>();
  const outboundLinkCounts = new Map<string, number>();

  for (const note of notes) {
    const linkedPaths = resolveWikiLinkedPaths(note, notePathIndex);
    outboundLinkCounts.set(note.path, linkedPaths.length);

    for (const linkedPath of linkedPaths) {
      inboundLinkCounts.set(linkedPath, (inboundLinkCounts.get(linkedPath) ?? 0) + 1);
    }
  }

  for (const note of notes) {
    const outboundCount = outboundLinkCounts.get(note.path) ?? 0;
    const inboundCount = inboundLinkCounts.get(note.path) ?? 0;

    if (note.type !== "source" && note.sourceRefs.length > 1 && outboundCount === 0) {
      pushIssue(issues, {
        code: "missing_cross_links",
        severity: "warning",
        path: note.path,
        message: "multi-source note has no wiki links to related notes, so its connections stay hard to navigate",
      });
    }

    if ((note.type === "concept" || note.type === "entity" || note.type === "synthesis") && inboundCount === 0 && outboundCount === 0) {
      pushIssue(issues, {
        code: "orphan_note",
        severity: "warning",
        path: note.path,
        message: "derived note is isolated: no inbound wiki links and no outbound related-note links were found",
      });
    }
  }
}

function parseEpochMillis(value: string): number | null {
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function lintSourceCoverageFreshness(notes: ValidNoteRecord[], issues: LintIssue[]): void {
  const sourceUpdatedAtById = new Map(
    notes
      .filter((note) => note.type === "source")
      .map((note) => [note.id, note.updatedAt]),
  );

  for (const note of notes) {
    if (note.type === "source" || note.sourceRefs.length === 0) {
      continue;
    }

    const noteUpdatedAt = parseEpochMillis(note.updatedAt);
    if (noteUpdatedAt === null) {
      continue;
    }

    const newerSources = note.sourceRefs.filter((sourceRef) => {
      const sourceUpdatedAt = sourceUpdatedAtById.get(sourceRef);
      const sourceUpdatedEpoch = sourceUpdatedAt ? parseEpochMillis(sourceUpdatedAt) : null;
      return sourceUpdatedEpoch !== null && sourceUpdatedEpoch > noteUpdatedAt;
    });

    if (newerSources.length === 0) {
      continue;
    }

    const sample = newerSources.slice(0, 2).join(", ");
    pushIssue(issues, {
      code: "stale_source_coverage",
      severity: "warning",
      path: note.path,
      message:
        newerSources.length === 1
          ? `supporting source ${sample} was updated after this note; review it for stale claims or missing refreshes`
          : `${newerSources.length} supporting sources, including ${sample}, were updated after this note; review it for stale claims or missing refreshes`,
    });
  }
}

function extractQuestionBullets(note: ValidNoteRecord): string[] {
  const heading = note.type === "output" ? "Follow-up Questions" : "Open Questions";
  const section = extractSection(note.body, heading);

  return section
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.replace(/^- /, "").trim())
    .filter(Boolean)
    .filter((line) => !/^(_?todo:|none yet\.?|n\/a\.?|no open questions\.?)/i.test(line));
}

function lintResearchGaps(notes: ValidNoteRecord[], issues: LintIssue[]): void {
  for (const note of notes) {
    if (note.type === "source") {
      continue;
    }

    const questions = extractQuestionBullets(note);
    const threshold = note.type === "synthesis" ? 1 : 2;

    if (questions.length < threshold) {
      continue;
    }

    pushIssue(issues, {
      code: "research_gap",
      severity: "warning",
      path: note.path,
      message:
        questions.length === 1
          ? `note still carries an unresolved research question ("${questions[0]}"); consider a targeted web search or another source`
          : `note still carries ${questions.length} unresolved research questions; consider a targeted web search or more sources`,
    });
  }
}

function isPlaceholderLike(value: string): boolean {
  const plain = stripMarkdown(value).toLowerCase();
  return (
    plain.length === 0 ||
    /^todo:/.test(plain) ||
    /^tbd\b/.test(plain) ||
    /^none yet\b/.test(plain) ||
    /^n\/a\b/.test(plain) ||
    /^no direct evidence\b/.test(plain) ||
    /^no supporting evidence\b/.test(plain)
  );
}

function isSubstantiveSection(value: string): boolean {
  const plain = stripMarkdown(value);
  return !isPlaceholderLike(value) && plain.split(/\s+/).filter(Boolean).length >= 8;
}

function evidenceHeadingForNote(note: ValidNoteRecord): string | null {
  switch (note.type) {
    case "concept":
    case "entity":
      return "Evidence";
    case "synthesis":
      return "Supporting Evidence";
    default:
      return null;
  }
}

function claimHeadingsForNote(note: ValidNoteRecord): string[] {
  switch (note.type) {
    case "concept":
      return ["Summary", "Definition", "Key Points"];
    case "entity":
      return ["Summary", "Who or What", "Key Facts"];
    case "synthesis":
      return ["Summary", "Thesis"];
    case "output":
      return ["Answer"];
    default:
      return [];
  }
}

function lintUnsupportedClaims(notes: ValidNoteRecord[], issues: LintIssue[]): void {
  for (const note of notes) {
    const evidenceHeading = evidenceHeadingForNote(note);
    if (!evidenceHeading) {
      continue;
    }

    const hasSubstantiveClaim = claimHeadingsForNote(note)
      .map((heading) => extractSection(note.body, heading))
      .some((section) => isSubstantiveSection(section));

    if (!hasSubstantiveClaim) {
      continue;
    }

    const evidenceSection = extractSection(note.body, evidenceHeading);
    if (isSubstantiveSection(evidenceSection)) {
      continue;
    }

    pushIssue(issues, {
      code: "unsupported_claim",
      severity: "warning",
      path: note.path,
      message: `note makes substantive claims but its ${evidenceHeading} section is still empty or placeholder-like`,
    });
  }
}

const NEGATION_TOKENS = new Set([
  "no",
  "not",
  "never",
  "without",
  "cannot",
  "cant",
  "isnt",
  "arent",
  "wasnt",
  "werent",
  "doesnt",
  "dont",
  "didnt",
  "wont",
  "shouldnt",
  "couldnt",
  "wouldnt",
]);

const STOP_TOKENS = new Set([
  "a",
  "an",
  "and",
  "are",
  "as",
  "at",
  "be",
  "by",
  "for",
  "from",
  "in",
  "is",
  "it",
  "of",
  "on",
  "or",
  "that",
  "the",
  "their",
  "this",
  "to",
  "with",
]);

type ClaimSignature = {
  raw: string;
  key: string;
  negated: boolean;
};

function tokenizeClaim(value: string): string[] {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function buildClaimSignatures(note: ValidNoteRecord): ClaimSignature[] {
  if (note.type !== "output" && note.type !== "synthesis") {
    return [];
  }

  const sections = claimHeadingsForNote(note)
    .map((heading) => extractSection(note.body, heading))
    .filter(Boolean)
    .map((section) => stripMarkdown(section));

  const sentences = sections
    .flatMap((section) => section.split(/[.!?]+/))
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.split(/\s+/).filter(Boolean).length >= 6);

  const signatures: ClaimSignature[] = [];

  for (const sentence of sentences.slice(0, 3)) {
    const tokens = tokenizeClaim(sentence);
    const negated = tokens.some((token) => NEGATION_TOKENS.has(token));
    const key = tokens
      .filter((token) => !STOP_TOKENS.has(token) && !NEGATION_TOKENS.has(token))
      .join(" ");

    if (key.split(/\s+/).filter(Boolean).length < 4) {
      continue;
    }

    signatures.push({
      raw: sentence,
      key,
      negated,
    });
  }

  return signatures;
}

function sharesSupportingSource(left: ValidNoteRecord, right: ValidNoteRecord): boolean {
  const rightRefs = new Set(right.sourceRefs);
  return left.sourceRefs.some((sourceRef) => rightRefs.has(sourceRef));
}

function lintContradictionCandidates(notes: ValidNoteRecord[], issues: LintIssue[]): void {
  const eligibleNotes = notes.filter((note) => note.type === "output" || note.type === "synthesis");
  const signaturesByPath = new Map(eligibleNotes.map((note) => [note.path, buildClaimSignatures(note)]));
  const seenPairs = new Set<string>();

  for (let leftIndex = 0; leftIndex < eligibleNotes.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < eligibleNotes.length; rightIndex += 1) {
      const left = eligibleNotes[leftIndex];
      const right = eligibleNotes[rightIndex];

      if (!sharesSupportingSource(left, right)) {
        continue;
      }

      const leftSignatures = signaturesByPath.get(left.path) ?? [];
      const rightSignatures = signaturesByPath.get(right.path) ?? [];

      const contradictoryPair = leftSignatures.find((leftSignature) =>
        rightSignatures.some(
          (rightSignature) =>
            leftSignature.key === rightSignature.key && leftSignature.negated !== rightSignature.negated,
        ),
      );

      if (!contradictoryPair) {
        continue;
      }

      const pairKey = [left.path, right.path].sort().join("::");
      if (seenPairs.has(pairKey)) {
        continue;
      }
      seenPairs.add(pairKey);

      pushIssue(issues, {
        code: "contradiction_candidate",
        severity: "warning",
        path: left.path,
        message: `possible contradiction with ${right.path}: overlapping sources support claims that differ mainly by negation ("${contradictoryPair.raw}")`,
      });
      pushIssue(issues, {
        code: "contradiction_candidate",
        severity: "warning",
        path: right.path,
        message: `possible contradiction with ${left.path}: overlapping sources support claims that differ mainly by negation`,
      });
    }
  }
}

async function lintKnowledgeGaps(
  config: KnowledgeBasePluginConfig,
  issues: LintIssue[],
): Promise<void> {
  const { candidates } = await collectGapCandidates(config);
  const actionableCandidates = candidates
    .filter((candidate) => candidate.priority === "high" || candidate.priority === "medium")
    .slice(0, 5);

  for (const candidate of actionableCandidates) {
    pushIssue(issues, {
      code: "knowledge_gap",
      severity: "warning",
      path: candidate.evidence_paths[0] ?? candidate.suggested_note_path,
      message: `${candidate.kind} page "${candidate.title}" is still missing from the wiki; consider promoting ${candidate.suggested_note_id} (${candidate.category})`,
    });
  }
}

async function lintIndexFiles(config: KnowledgeBasePluginConfig, issues: LintIssue[]): Promise<void> {
  const paths = getVaultPaths(config);
  for (const indexPath of [
    `${paths.indexes}/sources.md`,
    `${paths.indexes}/outputs.md`,
    `${paths.indexes}/concepts.md`,
    `${paths.indexes}/entities.md`,
    `${paths.indexes}/syntheses.md`,
    paths.index,
    paths.log,
  ]) {
    try {
      await fs.stat(await resolveVaultPath(config, indexPath));
    } catch {
      pushIssue(issues, {
        code: "missing_index",
        severity: "error",
        path: indexPath,
        message: "index file is missing",
      });
    }
  }
}

export async function kbLint(config: KnowledgeBasePluginConfig) {
  await validateRuntimeConfig(config);

  const issues: LintIssue[] = [];
  const manifest = await loadManifest(config);
  const rawItems = await listRawFiles(config);
  const rawPathSet = new Set(rawItems.map((item) => item.raw_path));

  for (const rawItem of rawItems) {
    if (!manifest.sources[rawItem.raw_path]) {
      pushIssue(issues, {
        code: "missing_manifest_record",
        severity: "error",
        path: rawItem.raw_path,
        message: "raw file exists but manifest record is missing",
      });
      continue;
    }

    if (rawItem.status === "missing_source_note") {
      pushIssue(issues, {
        code: "missing_source_note",
        severity: "error",
        path: rawItem.raw_path,
        message: "raw file exists but source note is missing",
      });
    }
  }

  for (const [rawPath, entry] of Object.entries(manifest.sources)) {
    if (!rawPathSet.has(rawPath)) {
      pushIssue(issues, {
        code: "missing_raw",
        severity: "error",
        path: rawPath,
        message: "manifest record exists but raw file is missing",
      });
    }

    const expectedSourcePath = canonicalSourcePath(config, entry.doc_id);
    if (entry.source_note_path !== expectedSourcePath) {
      pushIssue(issues, {
        code: "illegal_write_location",
        severity: "error",
        path: entry.source_note_path,
        message: `manifest source_note_path must be ${expectedSourcePath}`,
      });
    }
  }

  const validSourceNotes = await lintSourceNotes(config, manifest, issues);
  const knownSourceIds = new Set(validSourceNotes.map((note) => note.id));
  const validOutputNotes = await lintOutputNotes(config, manifest, knownSourceIds, issues);
  const validDerivedNotes = await lintDerivedNotes(config, manifest, knownSourceIds, issues);
  const validNotes = [...validSourceNotes, ...validOutputNotes, ...validDerivedNotes];

  lintDuplicateIds(validNotes, issues);
  lintDraftPlaceholders(validNotes, issues);
  lintCrossLinkHealth(validNotes, issues);
  lintSourceCoverageFreshness(validNotes, issues);
  lintResearchGaps(validNotes, issues);
  lintUnsupportedClaims(validNotes, issues);
  lintContradictionCandidates(validNotes, issues);
  await lintKnowledgeGaps(config, issues);
  await lintIndexFiles(config, issues);

  issues.sort(
    (a, b) =>
      a.path.localeCompare(b.path) ||
      a.severity.localeCompare(b.severity) ||
      a.code.localeCompare(b.code),
  );

  return {
    ok: !issues.some((issue) => issue.severity === "error"),
    issues,
  };
}
