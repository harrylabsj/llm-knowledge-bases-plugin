import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { saveManifest } from "../src/core/manifest.js";
import { kbLint } from "../src/tools/kb_lint.js";
import { kbPrepareSource } from "../src/tools/kb_prepare_source.js";
import { kbRebuildIndexes } from "../src/tools/kb_rebuild_indexes.js";
import { kbUpsertRepresentation } from "../src/tools/kb_upsert_representation.js";
import type { KnowledgeBasePluginConfig, ManifestFile } from "../src/types.js";

const tempRoots: string[] = [];

async function createTempVault(): Promise<KnowledgeBasePluginConfig> {
  const vaultRoot = await fs.mkdtemp(path.join(os.tmpdir(), "llm-kb-multimodal-lint-"));
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

async function writeSourceNote(
  config: KnowledgeBasePluginConfig,
  markdown: string,
  docId = "src-report",
) {
  const notePath = path.join(config.vaultRoot, "wiki", "sources", `${docId}.md`);
  await fs.mkdir(path.dirname(notePath), { recursive: true });
  await fs.writeFile(notePath, markdown, "utf8");
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

describe("multimodal lint and index polish", () => {
  it("warns on missing representation trails and shows raw_kind labels in source indexes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-05T12:00:00Z"));

    const config = await createTempVault();
    const prepared = await kbPrepareSource(config, {
      raw_path: "raw/papers/report.pdf",
    });

    const manifest: ManifestFile = {
      schema_version: 2,
      vault_root: config.vaultRoot,
      sources: {
        "raw/papers/report.pdf": {
          doc_id: prepared.doc_id,
          raw_path: "raw/papers/report.pdf",
          raw_hash: prepared.raw_hash,
          raw_kind: "pdf",
          mime_type: "application/pdf",
          size_bytes: prepared.size_bytes,
          source_note_path: prepared.source_note_path,
          title: "Report",
          compiled_at: "2026-04-05T12:00:00Z",
          status: "compiled",
          asset_refs: [
            {
              raw_path: "raw/papers/report.pdf",
              mime_type: "application/pdf",
              role: "primary",
              raw_hash: prepared.raw_hash,
            },
          ],
          representations: [],
        },
      },
    };

    await saveManifest(config, manifest);
    await writeSourceNote(
      config,
      `---
id: ${prepared.doc_id}
type: source
title: Report
raw_path: raw/papers/report.pdf
raw_hash: ${prepared.raw_hash}
raw_kind: pdf
mime_type: application/pdf
source_kind: raw_pdf
tags:
  - example
created_at: 2026-04-05T12:00:00Z
updated_at: 2026-04-05T12:00:00Z
status: active
---

# Summary

This source summarizes one PDF report.

# Key Points

- The report makes one major claim.

# Evidence

- The report contains supporting evidence.

# Open Questions

- Which section should be expanded later?

# Related Links

- None yet.
`,
    );

    await kbRebuildIndexes(config);

    const lintResult = await kbLint(config);
    expect(lintResult.ok).toBe(true);
    expect(lintResult.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "missing_representation",
          severity: "warning",
          path: prepared.source_note_path,
        }),
        expect.objectContaining({
          code: "unreviewed_asset_source",
          severity: "warning",
          path: prepared.source_note_path,
        }),
      ]),
    );

    const sourcesIndex = await fs.readFile(
      path.join(config.vaultRoot, "wiki", "_indexes", "sources.md"),
      "utf8",
    );
    const homeIndex = await fs.readFile(
      path.join(config.vaultRoot, "wiki", "index.md"),
      "utf8",
    );

    expect(sourcesIndex).toContain("[source | pdf]");
    expect(homeIndex).toContain("[source | pdf]");
  });

  it("warns when stored representations are stale relative to the current raw asset", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-05T13:00:00Z"));

    const config = await createTempVault();
    await kbUpsertRepresentation(config, {
      raw_path: "raw/papers/report.pdf",
      kind: "ocr_text",
      content: "# OCR Text\n\nOriginal extracted text.",
    });

    await fs.writeFile(
      path.join(config.vaultRoot, "raw", "papers", "report.pdf"),
      Buffer.from("%PDF-1.7\nupdated\n"),
    );

    const prepared = await kbPrepareSource(config, {
      raw_path: "raw/papers/report.pdf",
    });

    await writeSourceNote(
      config,
      `---
id: ${prepared.doc_id}
type: source
title: Report
raw_path: raw/papers/report.pdf
raw_hash: ${prepared.raw_hash}
raw_kind: pdf
mime_type: application/pdf
asset_paths:
  - raw/papers/report.pdf
source_kind: raw_pdf
tags:
  - example
created_at: 2026-04-05T13:00:00Z
updated_at: 2026-04-05T13:05:00Z
status: active
---

# Summary

This source summarizes the updated PDF.

# Key Points

- The updated PDF still has one central claim.

# Evidence

- The PDF content was reviewed again after the raw file changed.

# Open Questions

- Which page changed after the refresh?

# Related Links

- None yet.

# Visual Notes

The refreshed review confirmed the updated PDF still centers one main claim.
`,
    );

    await kbRebuildIndexes(config);

    const lintResult = await kbLint(config);
    expect(lintResult.ok).toBe(true);
    expect(lintResult.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "representation_stale",
          severity: "warning",
          path: prepared.source_note_path,
        }),
      ]),
    );
  });
});
