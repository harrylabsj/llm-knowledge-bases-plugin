import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { loadManifest, saveManifest } from "../src/core/manifest.js";
import { kbListRaw } from "../src/tools/kb_list_raw.js";
import { kbPrepareSource } from "../src/tools/kb_prepare_source.js";
import { kbReadRaw } from "../src/tools/kb_read_raw.js";
import type { KnowledgeBasePluginConfig, ManifestFile } from "../src/types.js";

const tempRoots: string[] = [];

async function createTempVault(): Promise<KnowledgeBasePluginConfig> {
  const vaultRoot = await fs.mkdtemp(path.join(os.tmpdir(), "llm-kb-raw-discovery-"));
  tempRoots.push(vaultRoot);

  await fs.mkdir(path.join(vaultRoot, "raw", "inbox"), { recursive: true });
  await fs.mkdir(path.join(vaultRoot, "raw", "papers"), { recursive: true });
  await fs.mkdir(path.join(vaultRoot, "raw", "images"), { recursive: true });
  await fs.mkdir(path.join(vaultRoot, "raw", "datasets"), { recursive: true });

  await fs.writeFile(path.join(vaultRoot, "raw", "inbox", "example-note.md"), "# Note\n", "utf8");
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

describe("raw discovery and manifest migration", () => {
  it("lists text, pdf, image, and data raw files with inferred metadata", async () => {
    const config = await createTempVault();

    const result = await kbListRaw(config, { limit: 10 });
    expect(result.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          raw_path: "raw/inbox/example-note.md",
          raw_kind: "text",
          mime_type: "text/markdown",
          ext: ".md",
          representation_count: 0,
        }),
        expect.objectContaining({
          raw_path: "raw/papers/report.pdf",
          raw_kind: "pdf",
          mime_type: "application/pdf",
          ext: ".pdf",
          representation_count: 0,
        }),
        expect.objectContaining({
          raw_path: "raw/images/chart.png",
          raw_kind: "image",
          mime_type: "image/png",
          ext: ".png",
          representation_count: 0,
        }),
        expect.objectContaining({
          raw_path: "raw/datasets/stats.json",
          raw_kind: "data",
          mime_type: "application/json",
          ext: ".json",
          representation_count: 0,
        }),
      ]),
    );
  });

  it("prepares a non-text raw source with raw kind, mime type, asset refs, and size", async () => {
    const config = await createTempVault();

    const prepared = await kbPrepareSource(config, {
      raw_path: "raw/papers/report.pdf",
    });

    expect(prepared).toMatchObject({
      doc_id: "src-report",
      source_note_path: "wiki/sources/src-report.md",
      raw_kind: "pdf",
      mime_type: "application/pdf",
      source_kind: "raw_pdf",
      representation_count: 0,
      asset_refs: [
        expect.objectContaining({
          raw_path: "raw/papers/report.pdf",
          mime_type: "application/pdf",
          role: "primary",
        }),
      ],
    });
    expect(prepared.size_bytes).toBeGreaterThan(0);
  });

  it("prepares a stable non-untitled doc_id for non-ascii raw file names", async () => {
    const config = await createTempVault();
    await fs.writeFile(
      path.join(config.vaultRoot, "raw", "inbox", "成为波伏瓦.md"),
      "# 成为波伏瓦\n",
      "utf8",
    );

    const prepared = await kbPrepareSource(config, {
      raw_path: "raw/inbox/成为波伏瓦.md",
    });

    expect(prepared.doc_id).toMatch(/^src-u-[a-f0-9]{12}$/);
    expect(prepared.source_note_path).toBe(`wiki/sources/${prepared.doc_id}.md`);
  });

  it("migrates a legacy manifest to schema version 2 with inferred multimodal fields", async () => {
    const config = await createTempVault();
    const manifestPath = path.join(config.vaultRoot, ".llm-kb", "manifest.json");
    await fs.mkdir(path.dirname(manifestPath), { recursive: true });

    const legacyManifest = {
      schema_version: 1,
      vault_root: config.vaultRoot,
      sources: {
        "raw/papers/report.pdf": {
          doc_id: "src-report",
          raw_path: "raw/papers/report.pdf",
          raw_hash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
          source_note_path: "wiki/sources/src-report.md",
          title: "Report",
          compiled_at: null,
          status: "new",
        },
      },
    };

    await fs.writeFile(manifestPath, `${JSON.stringify(legacyManifest, null, 2)}\n`, "utf8");

    const migrated = await loadManifest(config);
    expect(migrated).toMatchObject({
      schema_version: 2,
      sources: {
        "raw/papers/report.pdf": {
          doc_id: "src-report",
          raw_kind: "pdf",
          mime_type: "application/pdf",
          status: "new",
          asset_refs: [
            expect.objectContaining({
              raw_path: "raw/papers/report.pdf",
              mime_type: "application/pdf",
              role: "primary",
            }),
          ],
          representations: [],
        },
      },
    });
    expect(migrated.sources["raw/papers/report.pdf"].size_bytes).toBeGreaterThan(0);
  });

  it("persists schema version 2 manifests with new fields", async () => {
    const config = await createTempVault();
    const manifest: ManifestFile = {
      schema_version: 2,
      vault_root: config.vaultRoot,
      sources: {
        "raw/datasets/stats.json": {
          doc_id: "src-stats",
          raw_path: "raw/datasets/stats.json",
          raw_hash: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
          raw_kind: "data",
          mime_type: "application/json",
          size_bytes: 15,
          source_note_path: "wiki/sources/src-stats.md",
          title: "Stats",
          compiled_at: null,
          status: "compiled",
          asset_refs: [
            {
              raw_path: "raw/datasets/stats.json",
              mime_type: "application/json",
              role: "primary",
              raw_hash: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
            },
          ],
          representations: [],
        },
      },
    };

    await saveManifest(config, manifest);

    const content = JSON.parse(
      await fs.readFile(path.join(config.vaultRoot, ".llm-kb", "manifest.json"), "utf8"),
    );
    expect(content.schema_version).toBe(2);
    expect(content.sources["raw/datasets/stats.json"]).toMatchObject({
      raw_kind: "data",
      mime_type: "application/json",
      size_bytes: 15,
    });
  });

  it("keeps kb_read_raw text-first and rejects pdf assets", async () => {
    const config = await createTempVault();

    await expect(
      kbReadRaw(config, {
        raw_path: "raw/papers/report.pdf",
      }),
    ).rejects.toThrow(/text-readable raw file/);

    await expect(
      kbReadRaw(config, {
        raw_path: "raw/datasets/stats.json",
      }),
    ).resolves.toMatchObject({
      raw_path: "raw/datasets/stats.json",
      title_guess: "Stats",
      content: '{ "rows": 12 }\n',
    });
  });
});
