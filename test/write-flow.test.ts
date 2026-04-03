import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { loadManifest } from "../src/core/manifest.js";
import { kbLint } from "../src/tools/kb_lint.js";
import { kbPrepareOutput } from "../src/tools/kb_prepare_output.js";
import { kbPrepareSource } from "../src/tools/kb_prepare_source.js";
import { kbReadNotes } from "../src/tools/kb_read_notes.js";
import { kbRebuildIndexes } from "../src/tools/kb_rebuild_indexes.js";
import { kbSearch } from "../src/tools/kb_search.js";
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

    const rebuildResult = await kbRebuildIndexes(config);
    expect(rebuildResult).toEqual({
      ok: true,
      written: ["wiki/_indexes/sources.md", "wiki/_indexes/outputs.md"],
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

    const readResult = await kbReadNotes(config, {
      paths: [
        sourceResult.source_note_path,
        preparedOutput.output_path,
        "wiki/_indexes/sources.md",
      ],
    });
    expect(readResult.items).toHaveLength(3);
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
      path: "wiki/_indexes/sources.md",
      type: "index",
      title: "Sources Index",
    });

    const lintResult = await kbLint(config);
    expect(lintResult).toEqual({
      ok: true,
      issues: [],
    });

    const sourcesIndex = await fs.readFile(
      path.join(config.vaultRoot, "wiki", "_indexes", "sources.md"),
      "utf8",
    );
    const outputsIndex = await fs.readFile(
      path.join(config.vaultRoot, "wiki", "_indexes", "outputs.md"),
      "utf8",
    );

    expect(sourcesIndex).toContain("Example Note");
    expect(sourcesIndex).toContain(preparedSource.doc_id);
    expect(outputsIndex).toContain("Example Query");
    expect(outputsIndex).toContain(preparedOutput.output_id);

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
});
