import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { kbGetRawAsset } from "../src/tools/kb_get_raw_asset.js";
import { kbPrepareSourceBundle } from "../src/tools/kb_prepare_source_bundle.js";
import { kbUpsertRepresentation } from "../src/tools/kb_upsert_representation.js";
import type { KnowledgeBasePluginConfig } from "../src/types.js";

const tempRoots: string[] = [];

async function createTempVault(): Promise<KnowledgeBasePluginConfig> {
  const vaultRoot = await fs.mkdtemp(path.join(os.tmpdir(), "llm-kb-source-bundle-"));
  tempRoots.push(vaultRoot);

  await fs.mkdir(path.join(vaultRoot, "raw", "papers"), { recursive: true });
  await fs.mkdir(path.join(vaultRoot, "raw", "images"), { recursive: true });
  await fs.mkdir(path.join(vaultRoot, "raw", "datasets"), { recursive: true });

  await fs.writeFile(path.join(vaultRoot, "raw", "papers", "report.pdf"), Buffer.from("%PDF-1.7\n"));
  await fs.writeFile(path.join(vaultRoot, "raw", "images", "chart.png"), Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  await fs.writeFile(path.join(vaultRoot, "raw", "datasets", "stats.json"), '{ "rows": 12 }\n', "utf8");

  return {
    vaultRoot,
    rawDir: "raw",
    wikiDir: "wiki",
    stateDir: ".llm-kb",
  };
}

afterEach(async () => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      await fs.rm(root, { recursive: true, force: true });
    }
  }
});

describe("raw asset and source bundle flow", () => {
  it("returns deterministic raw asset metadata including the safe absolute path", async () => {
    const config = await createTempVault();

    const asset = await kbGetRawAsset(config, {
      raw_path: "raw/papers/report.pdf",
    });

    expect(asset).toMatchObject({
      raw_path: "raw/papers/report.pdf",
      raw_kind: "pdf",
      mime_type: "application/pdf",
      absolute_path: path.join(config.vaultRoot, "raw", "papers", "report.pdf"),
    });
    expect(asset.raw_hash).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(asset.size_bytes).toBeGreaterThan(0);
  });

  it("tracks compile readiness across pdf, image, and data source bundles", async () => {
    const config = await createTempVault();

    const initialPdfBundle = await kbPrepareSourceBundle(config, {
      raw_path: "raw/papers/report.pdf",
    });
    expect(initialPdfBundle).toMatchObject({
      doc_id: "src-report",
      source_note_path: "wiki/sources/src-report.md",
      raw: {
        raw_path: "raw/papers/report.pdf",
        raw_kind: "pdf",
        mime_type: "application/pdf",
      },
      asset_refs: [
        expect.objectContaining({
          raw_path: "raw/papers/report.pdf",
          role: "primary",
        }),
      ],
      representations: [],
      compile_readiness: "needs_representation",
    });

    await kbUpsertRepresentation(config, {
      raw_path: "raw/papers/report.pdf",
      kind: "metadata",
      content: JSON.stringify({ page_count: 1 }, null, 2),
    });

    const partialPdfBundle = await kbPrepareSourceBundle(config, {
      raw_path: "raw/papers/report.pdf",
    });
    expect(partialPdfBundle).toMatchObject({
      compile_readiness: "partial",
      representations: [
        expect.objectContaining({
          kind: "metadata",
          path: ".llm-kb/representations/src-report/metadata.json",
        }),
      ],
    });

    await kbUpsertRepresentation(config, {
      raw_path: "raw/papers/report.pdf",
      kind: "ocr_text",
      content: "# OCR Text\n\nExtracted content from the PDF.",
    });

    const readyPdfBundle = await kbPrepareSourceBundle(config, {
      raw_path: "raw/papers/report.pdf",
    });
    expect(readyPdfBundle).toMatchObject({
      compile_readiness: "ready",
      representations: expect.arrayContaining([
        expect.objectContaining({ kind: "metadata" }),
        expect.objectContaining({ kind: "ocr_text" }),
      ]),
    });

    const initialImageBundle = await kbPrepareSourceBundle(config, {
      raw_path: "raw/images/chart.png",
    });
    expect(initialImageBundle.compile_readiness).toBe("needs_representation");

    await kbUpsertRepresentation(config, {
      raw_path: "raw/images/chart.png",
      kind: "metadata",
      content: JSON.stringify({ width: 1, height: 1 }, null, 2),
    });

    const partialImageBundle = await kbPrepareSourceBundle(config, {
      raw_path: "raw/images/chart.png",
    });
    expect(partialImageBundle.compile_readiness).toBe("partial");

    await kbUpsertRepresentation(config, {
      raw_path: "raw/images/chart.png",
      kind: "vision_notes",
      content: "# Visual Notes\n\nThe image contains a simple chart preview.",
    });

    const readyImageBundle = await kbPrepareSourceBundle(config, {
      raw_path: "raw/images/chart.png",
    });
    expect(readyImageBundle).toMatchObject({
      compile_readiness: "ready",
      representations: expect.arrayContaining([
        expect.objectContaining({ kind: "metadata" }),
        expect.objectContaining({ kind: "vision_notes" }),
      ]),
    });

    const dataBundle = await kbPrepareSourceBundle(config, {
      raw_path: "raw/datasets/stats.json",
    });
    expect(dataBundle).toMatchObject({
      raw: {
        raw_path: "raw/datasets/stats.json",
        raw_kind: "data",
        mime_type: "application/json",
      },
      compile_readiness: "ready",
    });
  });
});
