import fs from "node:fs/promises";

import type { KnowledgeBasePluginConfig, StatusSummary } from "../types.js";
import { ensureManifest, loadManifest } from "../core/manifest.js";
import { getVaultPaths, resolveVaultPath } from "../core/paths.js";
import { listRawFiles } from "../core/scan.js";
import { validateRuntimeConfig } from "../core/validate.js";

async function countMarkdownFiles(
  config: KnowledgeBasePluginConfig,
  relativeDir: string,
): Promise<number> {
  const absolute = await resolveVaultPath(config, relativeDir);
  try {
    const entries = await fs.readdir(absolute, { withFileTypes: true });
    return entries.filter((entry) => entry.isFile() && entry.name.endsWith(".md")).length;
  } catch {
    return 0;
  }
}

export async function kbStatus(config: KnowledgeBasePluginConfig): Promise<StatusSummary> {
  await validateRuntimeConfig(config);
  await ensureManifest(config);
  const manifest = await loadManifest(config);
  const rawItems = await listRawFiles(config);
  const changedRawCount = rawItems.filter((item) => item.status !== "compiled").length;
  const paths = getVaultPaths(config);

  return {
    vault_configured: true,
    vault_root: config.vaultRoot,
    raw_count: rawItems.length,
    source_note_count: await countMarkdownFiles(config, paths.sources),
    output_count: await countMarkdownFiles(config, paths.outputs),
    derived_note_counts: {
      concept: await countMarkdownFiles(config, paths.concepts),
      entity: await countMarkdownFiles(config, paths.entities),
      synthesis: await countMarkdownFiles(config, paths.syntheses),
    },
    changed_raw_count: changedRawCount,
    manifest_exists: Object.keys(manifest.sources).length >= 0,
    paths: {
      raw: paths.raw,
      sources: paths.sources,
      outputs: paths.outputs,
      concepts: paths.concepts,
      entities: paths.entities,
      syntheses: paths.syntheses,
      indexes: paths.indexes,
      index: paths.index,
      log: paths.log,
      state: paths.state,
    },
  };
}
