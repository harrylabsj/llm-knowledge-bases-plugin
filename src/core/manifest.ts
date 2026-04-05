import fs from "node:fs/promises";
import path from "node:path";

import type {
  KnowledgeBasePluginConfig,
  ManifestFile,
  RawKind,
  SourceManifestEntry,
} from "../types.js";
import { atomicWriteText } from "./atomic-write.js";
import { getVaultPaths, resolveVaultPath } from "./paths.js";
import { getSupportedRawFileInfo } from "./raw-files.js";
import { slugify } from "./slug.js";

function buildEmptyManifest(config: KnowledgeBasePluginConfig): ManifestFile {
  return {
    schema_version: 2,
    vault_root: config.vaultRoot,
    sources: {},
  };
}

type LegacySourceManifestEntry = {
  doc_id: string;
  raw_path: string;
  raw_hash: string;
  source_note_path: string;
  title: string;
  compiled_at: string | null;
  status: "compiled" | "new" | "changed" | "missing_source_note";
};

type LegacyManifestFile = {
  schema_version?: 1;
  vault_root?: string;
  sources?: Record<string, LegacySourceManifestEntry>;
};

function fallbackRawKind(rawPath: string): RawKind {
  const ext = path.posix.extname(rawPath).toLowerCase();
  if (ext === ".pdf") {
    return "pdf";
  }
  if ([".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"].includes(ext)) {
    return "image";
  }
  if ([".csv", ".tsv", ".json", ".html"].includes(ext)) {
    return "data";
  }
  return "text";
}

async function inferSizeBytes(
  config: KnowledgeBasePluginConfig,
  rawPath: string,
): Promise<number> {
  try {
    const stats = await fs.stat(await resolveVaultPath(config, rawPath));
    return stats.size;
  } catch {
    return 0;
  }
}

async function upgradeLegacyEntry(
  config: KnowledgeBasePluginConfig,
  entry: LegacySourceManifestEntry,
): Promise<SourceManifestEntry> {
  const rawInfo = getSupportedRawFileInfo(entry.raw_path);
  const rawKind = rawInfo?.rawKind ?? fallbackRawKind(entry.raw_path);
  const mimeType = rawInfo?.mimeType ?? "application/octet-stream";

  return {
    doc_id: entry.doc_id,
    raw_path: entry.raw_path,
    raw_hash: entry.raw_hash,
    raw_kind: rawKind,
    mime_type: mimeType,
    size_bytes: await inferSizeBytes(config, entry.raw_path),
    source_note_path: entry.source_note_path,
    title: entry.title,
    compiled_at: entry.compiled_at,
    status: entry.status,
    asset_refs: [
      {
        raw_path: entry.raw_path,
        mime_type: mimeType,
        role: "primary",
        raw_hash: entry.raw_hash,
      },
    ],
    representations: [],
  };
}

async function normalizeManifest(
  config: KnowledgeBasePluginConfig,
  parsed: unknown,
): Promise<ManifestFile> {
  if (typeof parsed !== "object" || parsed === null) {
    return buildEmptyManifest(config);
  }

  const candidate = parsed as Partial<ManifestFile>;
  if (candidate.schema_version === 2 && typeof candidate.sources === "object" && candidate.sources) {
    return {
      schema_version: 2,
      vault_root: typeof candidate.vault_root === "string" ? candidate.vault_root : config.vaultRoot,
      sources: candidate.sources,
    };
  }

  const legacy = parsed as LegacyManifestFile;
  const sources = legacy.sources ?? {};
  const upgradedEntries = await Promise.all(
    Object.entries(sources).map(async ([rawPath, entry]) => [
      rawPath,
      await upgradeLegacyEntry(config, entry),
    ] as const),
  );

  return {
    schema_version: 2,
    vault_root: typeof legacy.vault_root === "string" ? legacy.vault_root : config.vaultRoot,
    sources: Object.fromEntries(upgradedEntries),
  };
}

export async function loadManifest(config: KnowledgeBasePluginConfig): Promise<ManifestFile> {
  const manifestPath = await resolveVaultPath(config, getVaultPaths(config).manifest);
  try {
    const content = await fs.readFile(manifestPath, "utf8");
    return await normalizeManifest(config, JSON.parse(content));
  } catch {
    return buildEmptyManifest(config);
  }
}

export async function saveManifest(
  config: KnowledgeBasePluginConfig,
  manifest: ManifestFile,
): Promise<void> {
  const manifestPath = await resolveVaultPath(config, getVaultPaths(config).manifest);
  const normalizedManifest: ManifestFile = {
    schema_version: 2,
    vault_root: config.vaultRoot,
    sources: manifest.sources,
  };
  await atomicWriteText(manifestPath, `${JSON.stringify(normalizedManifest, null, 2)}\n`);
}

export async function ensureManifest(config: KnowledgeBasePluginConfig): Promise<ManifestFile> {
  const manifest = await loadManifest(config);
  await saveManifest(config, manifest);
  return manifest;
}

export function buildSourceDocIdBase(rawPath: string): string {
  return `src-${slugify(path.posix.parse(rawPath).name)}`;
}

export function allocateUniqueDocId(preferredDocId: string, usedDocIds: Iterable<string>): string {
  const used = new Set(usedDocIds);
  if (!used.has(preferredDocId)) {
    return preferredDocId;
  }

  let counter = 2;
  while (used.has(`${preferredDocId}-${counter}`)) {
    counter += 1;
  }
  return `${preferredDocId}-${counter}`;
}

export function resolveCanonicalDocId(manifest: ManifestFile, rawPath: string): string {
  const existing = manifest.sources[rawPath];
  if (existing) {
    return existing.doc_id;
  }

  return allocateUniqueDocId(
    buildSourceDocIdBase(rawPath),
    Object.values(manifest.sources).map((item) => item.doc_id),
  );
}
