import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { kbLint } from "../src/tools/kb_lint.js";
import { kbMapGaps } from "../src/tools/kb_map_gaps.js";
import { kbPrepareDerivedNote } from "../src/tools/kb_prepare_derived_note.js";
import { kbPrepareOutput } from "../src/tools/kb_prepare_output.js";
import { kbPrepareSource } from "../src/tools/kb_prepare_source.js";
import { kbPromoteGap } from "../src/tools/kb_promote_gap.js";
import { kbRebuildIndexes } from "../src/tools/kb_rebuild_indexes.js";
import { kbUpsertDerivedNote } from "../src/tools/kb_upsert_derived_note.js";
import { kbUpsertOutput } from "../src/tools/kb_upsert_output.js";
import { kbUpsertSourceNote } from "../src/tools/kb_upsert_source_note.js";
import type { KnowledgeBasePluginConfig } from "../src/types.js";

const tempRoots: string[] = [];

async function createTempVault(): Promise<KnowledgeBasePluginConfig> {
  const vaultRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-llm-kb-gaps-"));
  tempRoots.push(vaultRoot);

  await fs.mkdir(path.join(vaultRoot, "raw", "inbox"), { recursive: true });
  await fs.writeFile(
    path.join(vaultRoot, "raw", "inbox", "openai-api.md"),
    "# OpenAI API\n\nUseful interface details.\n",
    "utf8",
  );
  await fs.writeFile(
    path.join(vaultRoot, "raw", "inbox", "retrieval-memory.md"),
    "# Retrieval Memory\n\nTradeoff details.\n",
    "utf8",
  );

  return {
    vaultRoot,
    rawDir: "raw",
    wikiDir: "wiki",
    stateDir: ".llm-kb",
  };
}

function buildSourceMarkdown(input: {
  docId: string;
  rawPath: string;
  rawHash: string;
  title: string;
  summary: string;
}): string {
  return `---
id: ${input.docId}
type: source
title: ${input.title}
raw_path: ${input.rawPath}
raw_hash: ${input.rawHash}
source_kind: raw_markdown
tags:
  - test
created_at: 2026-04-05T10:00:00Z
updated_at: 2026-04-05T10:10:00Z
status: active
---

# Summary

${input.summary}

# Key Points

- ${input.summary}

# Evidence

- Grounded in ${input.rawPath}.

# Open Questions

- What should be expanded?

# Related Links

- None yet.
`;
}

async function seedGapScenario(config: KnowledgeBasePluginConfig) {
  const openaiSource = await kbPrepareSource(config, {
    raw_path: "raw/inbox/openai-api.md",
  });
  const retrievalSource = await kbPrepareSource(config, {
    raw_path: "raw/inbox/retrieval-memory.md",
  });

  await kbUpsertSourceNote(config, {
    raw_path: "raw/inbox/openai-api.md",
    markdown: buildSourceMarkdown({
      docId: openaiSource.doc_id,
      rawPath: "raw/inbox/openai-api.md",
      rawHash: openaiSource.raw_hash,
      title: "OpenAI API",
      summary: "The API exposes useful interface details.",
    }),
  });

  await kbUpsertSourceNote(config, {
    raw_path: "raw/inbox/retrieval-memory.md",
    markdown: buildSourceMarkdown({
      docId: retrievalSource.doc_id,
      rawPath: "raw/inbox/retrieval-memory.md",
      rawHash: retrievalSource.raw_hash,
      title: "Retrieval Memory",
      summary: "This note covers retrieval and memory tradeoffs.",
    }),
  });

  const preparedOutput = await kbPrepareOutput(config, {
    title: "Retrieval vs Memory",
    query: "Compare retrieval and memory approaches.",
  });

  await kbUpsertOutput(config, {
    markdown: `---
id: ${preparedOutput.output_id}
type: output
title: Retrieval vs Memory
query: Compare retrieval and memory approaches.
source_refs:
  - ${openaiSource.doc_id}
  - ${retrievalSource.doc_id}
created_at: 2026-04-05T10:30:00Z
updated_at: 2026-04-05T10:31:00Z
---

# Answer

The tradeoff space needs a dedicated synthesis. See also [[concept-memory-patterns|Memory Patterns]].

# Sources Used

- ${openaiSource.doc_id}
- ${retrievalSource.doc_id}

# Follow-up Questions

- Which patterns recur across both approaches?
`,
  });

  const preparedConcept = await kbPrepareDerivedNote(config, {
    kind: "concept",
    title: "Tooling Surface",
  });

  await kbUpsertDerivedNote(config, {
    markdown: `---
id: ${preparedConcept.note_id}
type: concept
title: Tooling Surface
aliases:
  - API Surface
source_refs:
  - ${openaiSource.doc_id}
tags:
  - test
created_at: 2026-04-05T10:31:00Z
updated_at: 2026-04-05T10:32:00Z
status: active
---

# Summary

Tooling surface captures what an interface exposes.

# Definition

The surface area of a tool or API.

# Key Points

- It helps reason about capability boundaries.

# Evidence

- The OpenAI API source discusses interface details.

# Open Questions

- Which parts of the interface matter most?

# Related Notes

- [[${openaiSource.doc_id}]]
`,
  });

  return {
    openaiSource,
    retrievalSource,
    preparedOutput,
  };
}

afterEach(async () => {
  vi.useRealTimers();

  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      await fs.rm(root, { recursive: true, force: true });
    }
  }
});

describe("kb_map_gaps", () => {
  it("reports missing concept, synthesis, and entity candidates from the current wiki", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-05T10:30:00Z"));

    const config = await createTempVault();
    const { openaiSource } = await seedGapScenario(config);

    const report = await kbMapGaps(config, { limit: 10 });

    expect(report.ok).toBe(true);
    expect(report.scanned_note_count).toBe(4);
    expect(report.candidates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          category: "missing_link",
          kind: "concept",
          title: "Memory Patterns",
          next_action: "draft_and_upsert",
        }),
        expect.objectContaining({
          category: "unpromoted_output",
          kind: "synthesis",
          title: "Retrieval vs Memory",
          priority: "high",
        }),
        expect.objectContaining({
          category: "unpromoted_entity",
          kind: "entity",
          title: "OpenAI API",
        }),
      ]),
    );

    const synthesisCandidate = report.candidates.find(
      (candidate) => candidate.kind === "synthesis" && candidate.title === "Retrieval vs Memory",
    );
    expect(synthesisCandidate).toBeDefined();
    expect(synthesisCandidate?.draft.required_headings).toEqual([
      "Summary",
      "Thesis",
      "Supporting Evidence",
      "Tensions",
      "Open Questions",
      "Related Notes",
    ]);
    expect(synthesisCandidate?.draft.suggested_opening).toContain("Retrieval vs Memory");
    expect(synthesisCandidate?.draft.evidence_summary).toEqual(
      expect.arrayContaining([
        expect.stringContaining("Retrieval vs Memory"),
        expect.stringContaining("OpenAI API"),
      ]),
    );
    expect(synthesisCandidate?.draft.markdown).toContain("type: synthesis");
    expect(synthesisCandidate?.draft.markdown).toContain("title: Retrieval vs Memory");
    expect(synthesisCandidate?.draft.markdown).toContain(`# Thesis`);
    expect(synthesisCandidate?.draft.markdown).toContain(`# Supporting Evidence`);
    expect(synthesisCandidate?.draft.markdown).toContain(openaiSource.doc_id);
  });

  it("surfaces medium/high gap candidates as lint warnings so missing pages show up in maintenance passes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-05T10:30:00Z"));

    const config = await createTempVault();
    await seedGapScenario(config);
    await kbRebuildIndexes(config);

    const lintResult = await kbLint(config);

    expect(lintResult.ok).toBe(true);
    expect(lintResult.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "knowledge_gap",
          severity: "warning",
          path: "wiki/outputs/2026-04-05-retrieval-vs-memory.md",
          message: expect.stringContaining('synthesis page "Retrieval vs Memory"'),
        }),
        expect.objectContaining({
          code: "knowledge_gap",
          severity: "warning",
          path: "wiki/outputs/2026-04-05-retrieval-vs-memory.md",
          message: expect.stringContaining('concept page "Memory Patterns"'),
        }),
        expect.objectContaining({
          code: "knowledge_gap",
          severity: "warning",
          message: expect.stringContaining('entity page "OpenAI API"'),
        }),
      ]),
    );
  });

  it("promotes a current gap candidate into a derived note and removes it from future gap reports", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-05T10:30:00Z"));

    const config = await createTempVault();
    await seedGapScenario(config);

    const before = await kbMapGaps(config, { limit: 10 });
    const synthesisCandidate = before.candidates.find(
      (candidate) => candidate.kind === "synthesis" && candidate.title === "Retrieval vs Memory",
    );

    expect(synthesisCandidate).toBeDefined();

    const promoted = await kbPromoteGap(config, {
      note_id: synthesisCandidate?.suggested_note_id,
    });

    expect(promoted).toMatchObject({
      ok: true,
      promoted_candidate: expect.objectContaining({
        kind: "synthesis",
        title: "Retrieval vs Memory",
      }),
      write_result: {
        ok: true,
        note_id: synthesisCandidate?.suggested_note_id,
        note_path: synthesisCandidate?.suggested_note_path,
        kind: "synthesis",
      },
    });

    const writtenMarkdown = await fs.readFile(
      path.join(config.vaultRoot, promoted.write_result.note_path),
      "utf8",
    );
    expect(writtenMarkdown).toContain("type: synthesis");
    expect(writtenMarkdown).toContain("title: Retrieval vs Memory");
    expect(writtenMarkdown).toContain("# Thesis");

    const after = await kbMapGaps(config, { limit: 10 });
    expect(
      after.candidates.find(
        (candidate) => candidate.kind === "synthesis" && candidate.title === "Retrieval vs Memory",
      ),
    ).toBeUndefined();

    await kbRebuildIndexes(config);
    const lintResult = await kbLint(config);
    expect(lintResult.ok).toBe(true);
    expect(lintResult.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "draft_placeholder",
          severity: "warning",
          path: promoted.write_result.note_path,
        }),
        expect.objectContaining({
          code: "missing_cross_links",
          severity: "warning",
          path: promoted.write_result.note_path,
        }),
        expect.objectContaining({
          code: "orphan_note",
          severity: "warning",
          path: promoted.write_result.note_path,
        }),
      ]),
    );
  });
});
