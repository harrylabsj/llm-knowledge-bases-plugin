import fs from "node:fs/promises";
import path from "node:path";

import type { KnowledgeBasePluginConfig, ManifestFile } from "../types.js";
import { atomicWriteText } from "./atomic-write.js";
import { getVaultPaths, resolveVaultPath } from "./paths.js";
import { slugify } from "./slug.js";

function buildEmptyManifest(config: KnowledgeBasePluginConfig): ManifestFile {
  return {
    schema_version: 1,
    vault_root: config.vaultRoot,
    sources: {},
  };
}

export async function loadManifest(config: KnowledgeBasePluginConfig): Promise<ManifestFile> {
  const manifestPath = await resolveVaultPath(config, getVaultPaths(config).manifest);
  try {
    const content = await fs.readFile(manifestPath, "utf8");
    return JSON.parse(content) as ManifestFile;
  } catch {
    return buildEmptyManifest(config);
  }
}

export async function saveManifest(
  config: KnowledgeBasePluginConfig,
  manifest: ManifestFile,
): Promise<void> {
  const manifestPath = await resolveVaultPath(config, getVaultPaths(config).manifest);
  await atomicWriteText(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

export async function ensureManifest(config: KnowledgeBasePluginConfig): Promise<ManifestFile> {
  const manifest = await loadManifest(config);
  await saveManifest(config, manifest);
  return manifest;
}

export function resolveCanonicalDocId(manifest: ManifestFile, rawPath: string): string {
  const existing = manifest.sources[rawPath];
  if (existing) {
    return existing.doc_id;
  }

  const base = `src-${slugify(path.parse(rawPath).name)}`;
  const used = new Set(Object.values(manifest.sources).map((item) => item.doc_id));
  if (!used.has(base)) {
    return base;
  }

  let counter = 2;
  while (used.has(`${base}-${counter}`)) {
    counter += 1;
  }
  return `${base}-${counter}`;
}
