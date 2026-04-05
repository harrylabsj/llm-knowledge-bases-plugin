import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { loadManifest } from "../src/core/manifest.js";
import { kbLint } from "../src/tools/kb_lint.js";
import { kbPrepareDerivedNote } from "../src/tools/kb_prepare_derived_note.js";
import { kbPrepareOutput } from "../src/tools/kb_prepare_output.js";
import { kbPrepareSource } from "../src/tools/kb_prepare_source.js";
import { kbReadNotes } from "../src/tools/kb_read_notes.js";
import { kbRebuildIndexes } from "../src/tools/kb_rebuild_indexes.js";
import { kbSearch } from "../src/tools/kb_search.js";
import { kbUpsertDerivedNote } from "../src/tools/kb_upsert_derived_note.js";
import { kbUpsertOutput } from "../src/tools/kb_upsert_output.js";
import { kbUpsertSourceNote } from "../src/tools/kb_upsert_source_note.js";
import type { KnowledgeBasePluginConfig } from "../src/types.js";

const tempRoots: string[] = [];

async function createTempVault(): Promise<KnowledgeBasePluginConfig> {
  const vaultRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-llm-kb-"));
  tempRoots.push(vaultRoot);

  await fs.mkdir(path.join(vaultRoot, "raw", "inbox"), { recursive: true });
  await fs.writeFile(
    path.join(vaultRoot, "raw", "inbox", "example-note.md"),
    "# Example Raw\n\nImportant point.\n",
    "utf8",
  );

  return {
    vaultRoot,
    rawDir: "raw",
    wikiDir: "wiki",
    stateDir: ".llm-kb",
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

describe("1.0.b write flow", () => {
  it("writes source/output notes and rebuilds indexes against a temp vault", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-03T11:00:00Z"));

    const config = await createTempVault();
    const preparedSource = await kbPrepareSource(config, {
      raw_path: "raw/inbox/example-note.md",
    });

    const sourceMarkdown = `---
id: ${preparedSource.doc_id}
type: source
title: Example Note
raw_path: raw/inbox/example-note.md
raw_hash: ${preparedSource.raw_hash}
source_kind: raw_markdown
tags:
  - example
created_at: 2026-04-03T10:00:00Z
updated_at: 2026-04-03T10:30:00Z
status: active
---

# Evidence

- Important point from the raw note.

# Summary

This note captures the main point.

# Related Links

- None yet.

# Open Questions

- What should be expanded next?

# Key Points

- The example note has one critical takeaway.
`;

    const sourceResult = await kbUpsertSourceNote(config, {
      raw_path: "raw/inbox/example-note.md",
      markdown: sourceMarkdown,
    });

    expect(sourceResult).toMatchObject({
      ok: true,
      doc_id: preparedSource.doc_id,
      source_note_path: `wiki/sources/${preparedSource.doc_id}.md`,
      manifest_updated: true,
    });

    const manifest = await loadManifest(config);
    expect(manifest.sources["raw/inbox/example-note.md"]).toMatchObject({
      doc_id: preparedSource.doc_id,
      raw_path: "raw/inbox/example-note.md",
      source_note_path: `wiki/sources/${preparedSource.doc_id}.md`,
      status: "compiled",
    });

    const preparedOutput = await kbPrepareOutput(config, {
      title: "Example Query",
      query: "What are the main points?",
    });

    expect(preparedOutput).toMatchObject({
      output_id: "out-2026-04-03-example-query",
      output_path: "wiki/outputs/2026-04-03-example-query.md",
    });

    const outputMarkdown = `---
id: ${preparedOutput.output_id}
type: output
title: Example Query
query: What are the main points?
source_refs:
  - ${preparedSource.doc_id}
created_at: 2026-04-03T11:00:00Z
updated_at: 2026-04-03T11:05:00Z
---

# Follow-up Questions

- What is still missing?

# Sources Used

- ${preparedSource.doc_id}

# Answer

The main point is that the raw note contains one important takeaway.
`;

    const outputResult = await kbUpsertOutput(config, {
      markdown: outputMarkdown,
    });

    expect(outputResult).toMatchObject({
      ok: true,
      output_id: preparedOutput.output_id,
      output_path: preparedOutput.output_path,
    });

    const preparedConcept = await kbPrepareDerivedNote(config, {
      kind: "concept",
      title: "Important Point",
    });

    expect(preparedConcept).toMatchObject({
      note_id: "concept-important-point",
      note_path: "wiki/concepts/concept-important-point.md",
      kind: "concept",
    });

    const conceptMarkdown = `---
id: ${preparedConcept.note_id}
type: concept
title: Important Point
aliases:
  - Critical takeaway
source_refs:
  - ${preparedSource.doc_id}
tags:
  - example
created_at: 2026-04-03T11:06:00Z
updated_at: 2026-04-03T11:07:00Z
status: active
---

# Summary

This concept captures the most reusable takeaway from the raw note.

# Definition

An important point is the central idea that should be preserved and linked.

# Key Points

- It is the durable takeaway from the raw note.

# Evidence

- The raw note says there is an important point.

# Open Questions

- How should this concept connect to future notes?

# Related Notes

- [[${preparedSource.doc_id}]]
`;

    const conceptResult = await kbUpsertDerivedNote(config, {
      markdown: conceptMarkdown,
    });

    expect(conceptResult).toMatchObject({
      ok: true,
      note_id: preparedConcept.note_id,
      note_path: preparedConcept.note_path,
      kind: "concept",
    });

    const rebuildResult = await kbRebuildIndexes(config);
    expect(rebuildResult).toEqual({
      ok: true,
      written: [
        "wiki/_indexes/sources.md",
        "wiki/_indexes/outputs.md",
        "wiki/_indexes/concepts.md",
        "wiki/_indexes/entities.md",
        "wiki/_indexes/syntheses.md",
        "wiki/index.md",
        "wiki/log.md",
      ],
    });

    const searchResult = await kbSearch(config, {
      query: "critical takeaway",
      limit: 5,
      types: ["source"],
    });
    expect(searchResult.items).toHaveLength(1);
    expect(searchResult.items[0]).toMatchObject({
      path: sourceResult.source_note_path,
      type: "source",
      id: preparedSource.doc_id,
    });

    const conceptSearchResult = await kbSearch(config, {
      query: "critical takeaway",
      limit: 5,
      types: ["concept"],
    });
    expect(conceptSearchResult.items).toHaveLength(1);
    expect(conceptSearchResult.items[0]).toMatchObject({
      path: conceptResult.note_path,
      type: "concept",
      id: preparedConcept.note_id,
    });

    const readResult = await kbReadNotes(config, {
      paths: [
        sourceResult.source_note_path,
        preparedOutput.output_path,
        conceptResult.note_path,
        "wiki/index.md",
        "wiki/_indexes/sources.md",
      ],
    });
    expect(readResult.items).toHaveLength(5);
    expect(readResult.items[0]).toMatchObject({
      path: sourceResult.source_note_path,
      type: "source",
      id: preparedSource.doc_id,
      title: "Example Note",
    });
    expect(readResult.items[1]).toMatchObject({
      path: preparedOutput.output_path,
      type: "output",
      id: preparedOutput.output_id,
      title: "Example Query",
    });
    expect(readResult.items[2]).toMatchObject({
      path: conceptResult.note_path,
      type: "concept",
      id: preparedConcept.note_id,
      title: "Important Point",
    });
    expect(readResult.items[3]).toMatchObject({
      path: "wiki/index.md",
      type: "index",
      title: "Knowledge Base Index",
    });
    expect(readResult.items[4]).toMatchObject({
      path: "wiki/_indexes/sources.md",
      type: "index",
      title: "Sources Index",
    });

    const lintResult = await kbLint(config);
    expect(lintResult.ok).toBe(true);
    expect(lintResult.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "knowledge_gap",
          severity: "warning",
          message: expect.stringContaining('entity page "Example Note"'),
        }),
      ]),
    );

    const sourcesIndex = await fs.readFile(
      path.join(config.vaultRoot, "wiki", "_indexes", "sources.md"),
      "utf8",
    );
    const outputsIndex = await fs.readFile(
      path.join(config.vaultRoot, "wiki", "_indexes", "outputs.md"),
      "utf8",
    );
    const conceptsIndex = await fs.readFile(
      path.join(config.vaultRoot, "wiki", "_indexes", "concepts.md"),
      "utf8",
    );
    const homeIndex = await fs.readFile(
      path.join(config.vaultRoot, "wiki", "index.md"),
      "utf8",
    );
    const logPage = await fs.readFile(
      path.join(config.vaultRoot, "wiki", "log.md"),
      "utf8",
    );

    expect(sourcesIndex).toContain("Example Note");
    expect(sourcesIndex).toContain("This note captures the main point.");
    expect(sourcesIndex).toContain(preparedSource.doc_id);
    expect(outputsIndex).toContain("Example Query");
    expect(outputsIndex).toContain("The main point is that the raw note contains one important takeaway.");
    expect(outputsIndex).toContain(preparedOutput.output_id);
    expect(conceptsIndex).toContain("Important Point");
    expect(conceptsIndex).toContain("This concept captures the most reusable takeaway from the raw note.");
    expect(conceptsIndex).toContain(preparedConcept.note_id);
    expect(homeIndex).toContain("Knowledge Base Index");
    expect(homeIndex).toContain("## Sources");
    expect(homeIndex).toContain("Example Note");
    expect(homeIndex).toContain("## Concepts");
    expect(homeIndex).toContain("Concepts");
    expect(logPage).toContain("## 2026-04-03");
    expect(logPage).toContain("`kb_rebuild_indexes`");

    await fs.rm(path.join(config.vaultRoot, sourceResult.source_note_path));

    const brokenLint = await kbLint(config);
    expect(brokenLint.ok).toBe(false);
    expect(brokenLint.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "missing_source_note",
          path: "raw/inbox/example-note.md",
        }),
      ]),
    );
  });

  it("rejects output notes that reference missing sources", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-03T11:00:00Z"));

    const config = await createTempVault();

    await expect(
      kbUpsertOutput(config, {
        markdown: `---
id: out-2026-04-03-missing-source
type: output
title: Missing Source
query: Which source is missing?
source_refs:
  - src-does-not-exist
created_at: 2026-04-03T11:00:00Z
updated_at: 2026-04-03T11:01:00Z
---

# Answer

No source exists for this answer.

# Sources Used

- src-does-not-exist

# Follow-up Questions

- Should this be allowed?
`,
      }),
    ).rejects.toThrow(/source_ref not found/);
  });

  it("warns when supporting sources are newer than dependent notes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-03T11:00:00Z"));

    const config = await createTempVault();
    const preparedSource = await kbPrepareSource(config, {
      raw_path: "raw/inbox/example-note.md",
    });

    await kbUpsertSourceNote(config, {
      raw_path: "raw/inbox/example-note.md",
      markdown: `---
id: ${preparedSource.doc_id}
type: source
title: Example Note
raw_path: raw/inbox/example-note.md
raw_hash: ${preparedSource.raw_hash}
source_kind: raw_markdown
tags:
  - example
created_at: 2026-04-03T10:00:00Z
updated_at: 2026-04-03T10:30:00Z
status: active
---

# Summary

Initial source summary.

# Key Points

- Initial source point.

# Evidence

- Initial evidence.

# Open Questions

- What changed later?

# Related Links

- None yet.
`,
    });

    const preparedOutput = await kbPrepareOutput(config, {
      title: "Example Query",
      query: "What changed?",
    });

    await kbUpsertOutput(config, {
      markdown: `---
id: ${preparedOutput.output_id}
type: output
title: Example Query
query: What changed?
source_refs:
  - ${preparedSource.doc_id}
created_at: 2026-04-03T11:00:00Z
updated_at: 2026-04-03T11:05:00Z
---

# Answer

The first source version says very little changed.

# Sources Used

- ${preparedSource.doc_id}

# Follow-up Questions

- Should this answer be refreshed later?
- Which external benchmark changed after the first draft?
`,
    });

    await kbUpsertSourceNote(config, {
      raw_path: "raw/inbox/example-note.md",
      markdown: `---
id: ${preparedSource.doc_id}
type: source
title: Example Note
raw_path: raw/inbox/example-note.md
raw_hash: ${preparedSource.raw_hash}
source_kind: raw_markdown
tags:
  - example
created_at: 2026-04-03T10:00:00Z
updated_at: 2026-04-03T12:30:00Z
status: active
---

# Summary

Updated source summary with more recent evidence.

# Key Points

- Updated source point.

# Evidence

- New evidence arrived after the archived answer.

# Open Questions

- Which dependent pages should be refreshed?

# Related Links

- None yet.
`,
    });

    await kbRebuildIndexes(config);

    const lintResult = await kbLint(config);
    expect(lintResult.ok).toBe(true);
    expect(lintResult.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "stale_source_coverage",
          severity: "warning",
          path: preparedOutput.output_path,
        }),
        expect.objectContaining({
          code: "research_gap",
          severity: "warning",
          path: preparedOutput.output_path,
        }),
      ]),
    );
  });

  it("warns when a derived page makes claims without substantive evidence", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-03T11:00:00Z"));

    const config = await createTempVault();
    const preparedSource = await kbPrepareSource(config, {
      raw_path: "raw/inbox/example-note.md",
    });

    await kbUpsertSourceNote(config, {
      raw_path: "raw/inbox/example-note.md",
      markdown: `---
id: ${preparedSource.doc_id}
type: source
title: Example Note
raw_path: raw/inbox/example-note.md
raw_hash: ${preparedSource.raw_hash}
source_kind: raw_markdown
tags:
  - example
created_at: 2026-04-03T10:00:00Z
updated_at: 2026-04-03T10:30:00Z
status: active
---

# Summary

This source describes one important finding in detail.

# Key Points

- The source has enough detail to support a grounded concept page.

# Evidence

- Raw note evidence is available here.

# Open Questions

- None yet.

# Related Links

- None yet.
`,
    });

    const preparedConcept = await kbPrepareDerivedNote(config, {
      kind: "concept",
      title: "Unsupported Concept",
    });

    await kbUpsertDerivedNote(config, {
      markdown: `---
id: ${preparedConcept.note_id}
type: concept
title: Unsupported Concept
aliases: []
source_refs:
  - ${preparedSource.doc_id}
tags:
  - example
created_at: 2026-04-03T11:00:00Z
updated_at: 2026-04-03T11:10:00Z
status: active
---

# Summary

This concept claims that the example source establishes a durable, reusable operating principle for future notes.

# Definition

The unsupported concept is presented as a reusable principle with broad implications.

# Key Points

- It supposedly generalizes beyond the original note.
- It supposedly affects future decisions across the wiki.

# Evidence

No direct evidence captured yet.

# Open Questions

- What source passage actually proves the generalization?

# Related Notes

- [[${preparedSource.doc_id}]]
`,
    });

    await kbRebuildIndexes(config);

    const lintResult = await kbLint(config);
    expect(lintResult.ok).toBe(true);
    expect(lintResult.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "unsupported_claim",
          severity: "warning",
          path: preparedConcept.note_path,
        }),
      ]),
    );
  });

  it("warns on contradiction candidates when overlapping-source claims differ mainly by negation", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-03T11:00:00Z"));

    const config = await createTempVault();
    const preparedSource = await kbPrepareSource(config, {
      raw_path: "raw/inbox/example-note.md",
    });

    await kbUpsertSourceNote(config, {
      raw_path: "raw/inbox/example-note.md",
      markdown: `---
id: ${preparedSource.doc_id}
type: source
title: Example Note
raw_path: raw/inbox/example-note.md
raw_hash: ${preparedSource.raw_hash}
source_kind: raw_markdown
tags:
  - example
created_at: 2026-04-03T10:00:00Z
updated_at: 2026-04-03T10:30:00Z
status: active
---

# Summary

This source supports a verdict discussion about retrieval and memory.

# Key Points

- It contains one benchmark-oriented finding.

# Evidence

- Benchmark evidence appears in the source.

# Open Questions

- None yet.

# Related Links

- None yet.
`,
    });

    const firstOutput = await kbPrepareOutput(config, {
      title: "Retrieval Verdict",
      query: "What is the verdict?",
    });
    const secondOutput = await kbPrepareOutput(config, {
      title: "Retrieval Recheck",
      query: "What changed in the recheck?",
    });

    await kbUpsertOutput(config, {
      markdown: `---
id: ${firstOutput.output_id}
type: output
title: Retrieval Verdict
query: What is the verdict?
source_refs:
  - ${preparedSource.doc_id}
created_at: 2026-04-03T11:00:00Z
updated_at: 2026-04-03T11:05:00Z
---

# Answer

Retrieval is better than memory for this case.

# Sources Used

- ${preparedSource.doc_id}

# Follow-up Questions

- Should this be checked again later?
`,
    });

    await kbUpsertOutput(config, {
      markdown: `---
id: ${secondOutput.output_id}
type: output
title: Retrieval Recheck
query: What changed in the recheck?
source_refs:
  - ${preparedSource.doc_id}
created_at: 2026-04-03T11:06:00Z
updated_at: 2026-04-03T11:07:00Z
---

# Answer

Retrieval is not better than memory for this case.

# Sources Used

- ${preparedSource.doc_id}

# Follow-up Questions

- Which assumption changed?
`,
    });

    await kbRebuildIndexes(config);

    const lintResult = await kbLint(config);
    expect(lintResult.ok).toBe(true);
    expect(lintResult.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "contradiction_candidate",
          severity: "warning",
          path: firstOutput.output_path,
        }),
        expect.objectContaining({
          code: "contradiction_candidate",
          severity: "warning",
          path: secondOutput.output_path,
        }),
      ]),
    );
  });
});
