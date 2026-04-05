import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { loadManifest } from "../src/core/manifest.js";
import { kbListRaw } from "../src/tools/kb_list_raw.js";
import { kbPrepareRepresentation } from "../src/tools/kb_prepare_representation.js";
import { kbPrepareSource } from "../src/tools/kb_prepare_source.js";
import { kbReadRepresentations } from "../src/tools/kb_read_representations.js";
import { kbUpsertRepresentation } from "../src/tools/kb_upsert_representation.js";
import { kbUpsertSourceNote } from "../src/tools/kb_upsert_source_note.js";
import type { KnowledgeBasePluginConfig } from "../src/types.js";

const tempRoots: string[] = [];

async function createTempVault(): Promise<KnowledgeBasePluginConfig> {
  const vaultRoot = await fs.mkdtemp(path.join(os.tmpdir(), "llm-kb-representations-"));
  tempRoots.push(vaultRoot);

  await fs.mkdir(path.join(vaultRoot, "raw", "papers"), { recursive: true });
  await fs.writeFile(path.join(vaultRoot, "raw", "papers", "report.pdf"), Buffer.from("%PDF-1.7\n"));

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

describe("representation flow", () => {
  it("stores canonical representation files and updates manifest-backed counters", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-05T09:00:00Z"));

    const config = await createTempVault();

    const preparedMetadata = await kbPrepareRepresentation(config, {
      raw_path: "raw/papers/report.pdf",
      kind: "metadata",
    });
    expect(preparedMetadata).toMatchObject({
      doc_id: "src-report",
      raw_path: "raw/papers/report.pdf",
      raw_kind: "pdf",
      mime_type: "application/pdf",
      kind: "metadata",
      representation_path: ".llm-kb/representations/src-report/metadata.json",
    });

    const preparedOcr = await kbPrepareRepresentation(config, {
      raw_path: "raw/papers/report.pdf",
      kind: "ocr_text",
    });
    expect(preparedOcr).toMatchObject({
      doc_id: "src-report",
      kind: "ocr_text",
      representation_path: ".llm-kb/representations/src-report/ocr-text.md",
    });

    const metadataResult = await kbUpsertRepresentation(config, {
      raw_path: "raw/papers/report.pdf",
      kind: "metadata",
      content: JSON.stringify({ page_count: 1 }, null, 2),
    });
    expect(metadataResult).toMatchObject({
      ok: true,
      doc_id: "src-report",
      raw_path: "raw/papers/report.pdf",
      kind: "metadata",
      representation_path: ".llm-kb/representations/src-report/metadata.json",
      manifest_updated: true,
    });

    const ocrResult = await kbUpsertRepresentation(config, {
      raw_path: "raw/papers/report.pdf",
      kind: "ocr_text",
      content: "# OCR Text\n\nImportant paragraph from page 1.",
    });
    expect(ocrResult).toMatchObject({
      ok: true,
      doc_id: "src-report",
      raw_path: "raw/papers/report.pdf",
      kind: "ocr_text",
      representation_path: ".llm-kb/representations/src-report/ocr-text.md",
      manifest_updated: true,
    });

    const filteredRead = await kbReadRepresentations(config, {
      raw_path: "raw/papers/report.pdf",
      kinds: ["metadata"],
    });
    expect(filteredRead).toMatchObject({
      doc_id: "src-report",
      raw_path: "raw/papers/report.pdf",
      raw_kind: "pdf",
      mime_type: "application/pdf",
      items: [
        expect.objectContaining({
          kind: "metadata",
          representation_path: ".llm-kb/representations/src-report/metadata.json",
          content: '{\n  "page_count": 1\n}\n',
        }),
      ],
    });

    const allRepresentations = await kbReadRepresentations(config, {
      raw_path: "raw/papers/report.pdf",
    });
    expect(allRepresentations.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          kind: "metadata",
          representation_path: ".llm-kb/representations/src-report/metadata.json",
        }),
        expect.objectContaining({
          kind: "ocr_text",
          representation_path: ".llm-kb/representations/src-report/ocr-text.md",
        }),
      ]),
    );

    const manifest = await loadManifest(config);
    expect(manifest.sources["raw/papers/report.pdf"]).toMatchObject({
      doc_id: "src-report",
      raw_path: "raw/papers/report.pdf",
      raw_kind: "pdf",
      status: "missing_source_note",
      representations: [
        expect.objectContaining({
          kind: "ocr_text",
          path: ".llm-kb/representations/src-report/ocr-text.md",
        }),
        expect.objectContaining({
          kind: "metadata",
          path: ".llm-kb/representations/src-report/metadata.json",
        }),
      ],
    });

    const preparedSource = await kbPrepareSource(config, {
      raw_path: "raw/papers/report.pdf",
    });
    expect(preparedSource.representation_count).toBe(2);

    const rawItems = await kbListRaw(config, { limit: 10 });
    expect(rawItems.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          raw_path: "raw/papers/report.pdf",
          representation_count: 2,
          status: "missing_source_note",
        }),
      ]),
    );

    const sourceResult = await kbUpsertSourceNote(config, {
      raw_path: "raw/papers/report.pdf",
      markdown: `---
id: ${preparedSource.doc_id}
type: source
title: Report
raw_path: raw/papers/report.pdf
raw_hash: ${preparedSource.raw_hash}
raw_kind: pdf
mime_type: application/pdf
asset_paths:
  - raw/papers/report.pdf
source_kind: raw_pdf
tags:
  - example
created_at: 2026-04-05T09:00:00Z
updated_at: 2026-04-05T09:10:00Z
status: active
---

# Summary

This source compiles the represented PDF into a grounded source note.

# Key Points

- OCR and metadata are available for the PDF.

# Evidence

- The stored OCR text captured the main paragraph from page 1.

# Open Questions

- Which page should be expanded next?

# Related Links

- None yet.

# Visual Notes

The PDF representation trail is stored before this source note was compiled.
`,
    });
    expect(sourceResult).toMatchObject({
      ok: true,
      doc_id: "src-report",
      source_note_path: "wiki/sources/src-report.md",
      manifest_updated: true,
    });

    const compiledManifest = await loadManifest(config);
    expect(compiledManifest.sources["raw/papers/report.pdf"]).toMatchObject({
      status: "compiled",
      raw_kind: "pdf",
      mime_type: "application/pdf",
      asset_refs: [
        expect.objectContaining({
          raw_path: "raw/papers/report.pdf",
          role: "primary",
        }),
      ],
      representations: expect.arrayContaining([
        expect.objectContaining({ kind: "metadata" }),
        expect.objectContaining({ kind: "ocr_text" }),
      ]),
    });
  });

  it("fails fast when a requested representation kind is missing", async () => {
    const config = await createTempVault();

    await kbUpsertRepresentation(config, {
      raw_path: "raw/papers/report.pdf",
      kind: "ocr_text",
      content: "# OCR Text\n\nOnly one representation is stored.",
    });

    await expect(
      kbReadRepresentations(config, {
        raw_path: "raw/papers/report.pdf",
        kinds: ["metadata"],
      }),
    ).rejects.toThrow(/representation not found/);
  });
});
