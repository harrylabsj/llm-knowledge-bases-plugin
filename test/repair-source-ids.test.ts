import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { hashFile } from "../src/core/hash.js";
import { loadManifest, saveManifest } from "../src/core/manifest.js";
import { kbLint } from "../src/tools/kb_lint.js";
import { kbPrepareSource } from "../src/tools/kb_prepare_source.js";
import { kbRepairSourceIds } from "../src/tools/kb_repair_source_ids.js";
import type { KnowledgeBasePluginConfig, ManifestFile } from "../src/types.js";

const tempRoots: string[] = [];

async function createTempVault(): Promise<KnowledgeBasePluginConfig> {
  const vaultRoot = await fs.mkdtemp(path.join(os.tmpdir(), "llm-kb-repair-"));
  tempRoots.push(vaultRoot);

  await fs.mkdir(path.join(vaultRoot, "raw", "inbox"), { recursive: true });
  await fs.mkdir(path.join(vaultRoot, "wiki", "sources"), { recursive: true });

  await fs.writeFile(
    path.join(vaultRoot, "raw", "inbox", "成为波伏瓦.md"),
    "# 成为波伏瓦\n\n哲学和生活从来都是不可分割的。\n",
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
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      await fs.rm(root, { recursive: true, force: true });
    }
  }
});

describe("kb_repair_source_ids", () => {
  it("preserves an existing readable source id while repairing manifest and hash metadata", async () => {
    const config = await createTempVault();
    const rawPath = "raw/inbox/成为波伏瓦.md";
    const sourcePath = "wiki/sources/src-chengwei-bofwa.md";

    await fs.writeFile(
      path.join(config.vaultRoot, sourcePath),
      `---
id: "src-chengwei-bofwa"
type: source
title: "成为波伏瓦"
raw_path: "${rawPath}"
raw_hash: "34fc8e47149a9ccb"
source_kind: weread-review
tags:
  - "人物传记"
created_at: "2026-04-05T00:00:00+08:00"
updated_at: "2026-04-05T00:00:00+08:00"
status: "active"
---

# Summary

波伏瓦强调自我是一种持续的成为。

# Key Points

- 自我是一个不断变化的过程。

# Evidence

- 书中强调哲学与生活不可分割。

# Open Questions

- 如何理解成为与自我认同的关系？

# Related Links

- 待补充
`,
      "utf8",
    );

    const manifest: ManifestFile = {
      schema_version: 2,
      vault_root: config.vaultRoot,
      sources: {
        [rawPath]: {
          doc_id: "src-untitled-2",
          raw_path: rawPath,
          raw_hash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
          raw_kind: "text",
          mime_type: "text/markdown",
          size_bytes: 0,
          source_note_path: "wiki/sources/src-untitled-2.md",
          title: "成为波伏瓦",
          compiled_at: null,
          status: "new",
          asset_refs: [
            {
              raw_path: rawPath,
              mime_type: "text/markdown",
              role: "primary",
              raw_hash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
            },
          ],
          representations: [],
        },
      },
    };
    await saveManifest(config, manifest);

    const dryRun = await kbRepairSourceIds(config);
    expect(dryRun).toMatchObject({
      apply: false,
      repaired_count: 1,
      repairs: [
        expect.objectContaining({
          raw_path: rawPath,
          old_doc_id: "src-untitled-2",
          new_doc_id: "src-chengwei-bofwa",
          new_source_note_path: sourcePath,
          source_note_found: true,
          source_note_rewritten: true,
          manifest_updated: true,
        }),
      ],
    });

    const applied = await kbRepairSourceIds(config, { apply: true });
    expect(applied.rebuilt_indexes).toBe(true);

    const repairedManifest = await loadManifest(config);
    const currentRawHash = await hashFile(path.join(config.vaultRoot, rawPath));
    expect(repairedManifest.sources[rawPath]).toMatchObject({
      doc_id: "src-chengwei-bofwa",
      source_note_path: sourcePath,
      raw_hash: currentRawHash,
      status: "compiled",
    });

    const repairedSource = await fs.readFile(path.join(config.vaultRoot, sourcePath), "utf8");
    expect(repairedSource).toContain('id: src-chengwei-bofwa');
    expect(repairedSource).toMatch(new RegExp(`raw_hash:\\s+['"]?${currentRawHash}['"]?`));
    expect(repairedSource).toContain("source_kind: weread-review");

    await expect(kbLint(config)).resolves.toMatchObject({
      ok: true,
      issues: [],
    });
  });

  it("repairs manifest-only legacy untitled ids before the next compile allocates a canonical source id", async () => {
    const config = await createTempVault();
    const rawPath = "raw/inbox/成为波伏瓦.md";

    const manifest: ManifestFile = {
      schema_version: 2,
      vault_root: config.vaultRoot,
      sources: {
        [rawPath]: {
          doc_id: "src-untitled-2",
          raw_path: rawPath,
          raw_hash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
          raw_kind: "text",
          mime_type: "text/markdown",
          size_bytes: 0,
          source_note_path: "wiki/sources/src-untitled-2.md",
          title: "成为波伏瓦",
          compiled_at: null,
          status: "new",
          asset_refs: [
            {
              raw_path: rawPath,
              mime_type: "text/markdown",
              role: "primary",
              raw_hash: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
            },
          ],
          representations: [],
        },
      },
    };
    await saveManifest(config, manifest);

    const dryRun = await kbRepairSourceIds(config);
    expect(dryRun).toMatchObject({
      apply: false,
      repaired_count: 1,
      source_note_rewrite_count: 0,
      manifest_update_count: 1,
      repairs: [
        expect.objectContaining({
          raw_path: rawPath,
          old_doc_id: "src-untitled-2",
          source_note_found: false,
          source_note_rewritten: false,
          manifest_updated: true,
        }),
      ],
      skipped: [
        expect.objectContaining({
          raw_path: rawPath,
          reason: "manifest can be corrected, but no source note currently exists to rewrite",
        }),
      ],
    });
    expect(dryRun.repairs[0]?.new_doc_id).toMatch(/^src-u-[a-f0-9]{12}$/);
    expect(dryRun.repairs[0]?.new_source_note_path).toBe(
      `wiki/sources/${dryRun.repairs[0]?.new_doc_id}.md`,
    );

    const applied = await kbRepairSourceIds(config, { apply: true });
    expect(applied.rebuilt_indexes).toBe(false);

    const repairedManifest = await loadManifest(config);
    const currentRawHash = await hashFile(path.join(config.vaultRoot, rawPath));
    expect(repairedManifest.sources[rawPath]).toMatchObject({
      doc_id: expect.stringMatching(/^src-u-[a-f0-9]{12}$/),
      source_note_path: expect.stringMatching(/^wiki\/sources\/src-u-[a-f0-9]{12}\.md$/),
      raw_hash: currentRawHash,
      status: "changed",
    });

    const prepared = await kbPrepareSource(config, { raw_path: rawPath });
    expect(prepared.doc_id).toBe(repairedManifest.sources[rawPath]?.doc_id);
    expect(prepared.source_note_path).toBe(repairedManifest.sources[rawPath]?.source_note_path);
  });
});
