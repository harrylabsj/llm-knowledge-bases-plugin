import fs from "node:fs/promises";
import path from "node:path";

import type { KnowledgeBasePluginConfig, ManifestFile, RawListItem, RawItemStatus } from "../types.js";
import { hashFile } from "./hash.js";
import { loadManifest, resolveCanonicalDocId } from "./manifest.js";
import { getVaultPaths, resolveVaultPath, toVaultRelativePath } from "./paths.js";

const RAW_EXTENSIONS = new Set([".md", ".txt"]);

async function walkFiles(root: string, current: string, acc: string[]): Promise<void> {
  const entries = await fs.readdir(current, { withFileTypes: true });
  for (const entry of entries) {
    const next = path.join(current, entry.name);
    if (entry.isDirectory()) {
      await walkFiles(root, next, acc);
      continue;
    }
    if (!entry.isFile()) {
      continue;
    }
    const ext = path.extname(entry.name).toLowerCase();
    if (!RAW_EXTENSIONS.has(ext)) {
      continue;
    }
    acc.push(toVaultRelativePath(path.relative(root, next)));
  }
}

function guessTitleFromRawPath(rawPath: string): string {
  return path
    .parse(rawPath)
    .name.replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

async function getRawStatus(
  config: KnowledgeBasePluginConfig,
  manifest: ManifestFile,
  rawPath: string,
  rawHash: string,
): Promise<{ status: RawItemStatus; docId: string; sourceNotePath: string }> {
  const docId = resolveCanonicalDocId(manifest, rawPath);
  const sourceNotePath = `${getVaultPaths(config).sources}/${docId}.md`;
  const existing = manifest.sources[rawPath];

  try {
    await fs.stat(await resolveVaultPath(config, sourceNotePath));
  } catch {
    return {
      status: existing ? "missing_source_note" : "new",
      docId,
      sourceNotePath,
    };
  }

  if (!existing) {
    return { status: "new", docId, sourceNotePath };
  }
  if (existing.raw_hash !== rawHash) {
    return { status: "changed", docId, sourceNotePath };
  }
  return { status: "compiled", docId, sourceNotePath };
}

export async function listRawFiles(
  config: KnowledgeBasePluginConfig,
  options?: { changedOnly?: boolean; limit?: number },
): Promise<RawListItem[]> {
  const manifest = await loadManifest(config);
  const rawRootRel = getVaultPaths(config).raw;
  const rawRootAbs = await resolveVaultPath(config, rawRootRel);
  const files: string[] = [];

  try {
    await walkFiles(config.vaultRoot, rawRootAbs, files);
  } catch {
    return [];
  }

  const items: RawListItem[] = [];
  for (const rawPath of files.sort()) {
    const absolute = await resolveVaultPath(config, rawPath);
    const rawHash = await hashFile(absolute);
    const ext = path.extname(rawPath).toLowerCase() as ".md" | ".txt";
    const statusInfo = await getRawStatus(config, manifest, rawPath, rawHash);
    if (options?.changedOnly && statusInfo.status === "compiled") {
      continue;
    }

    items.push({
      raw_path: rawPath,
      title_guess: guessTitleFromRawPath(rawPath),
      ext,
      raw_hash: rawHash,
      status: statusInfo.status,
      doc_id: statusInfo.docId,
      source_note_path: statusInfo.sourceNotePath,
    });

    if (options?.limit && items.length >= options.limit) {
      break;
    }
  }

  return items;
}
