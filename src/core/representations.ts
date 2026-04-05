import fs from "node:fs/promises";
import path from "node:path";

import type {
  CompileReadiness,
  KnowledgeBasePluginConfig,
  ManifestFile,
  RawItemStatus,
  RawKind,
  RepresentationEntry,
  RepresentationKind,
  SourceManifestEntry,
} from "../types.js";
import { REPRESENTATION_KINDS } from "../types.js";
import { hashFile } from "./hash.js";
import { resolveCanonicalDocId } from "./manifest.js";
import { getVaultPaths, resolveVaultPath } from "./paths.js";
import { requireSupportedRawPath } from "./validate.js";

const REPRESENTATION_FILE_NAME_BY_KIND: Record<RepresentationKind, string> = {
  native_text: "native-text.md",
  ocr_text: "ocr-text.md",
  page_notes: "page-notes.md",
  vision_notes: "vision-notes.md",
  data_profile: "data-profile.md",
  metadata: "metadata.json",
};

const REPRESENTATION_KIND_ORDER = new Map(
  REPRESENTATION_KINDS.map((kind, index) => [kind, index] as const),
);

const COMPILE_READY_REPRESENTATION_KINDS: Partial<Record<RawKind, RepresentationKind[]>> = {
  pdf: ["native_text", "ocr_text", "page_notes"],
  image: ["vision_notes"],
  data: ["data_profile"],
};

function guessTitleFromRawPath(rawPath: string): string {
  return path
    .parse(rawPath)
    .name.replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

async function inferSourceStatus(
  config: KnowledgeBasePluginConfig,
  manifest: ManifestFile,
  rawPath: string,
  rawHash: string,
  sourceNotePath: string,
): Promise<RawItemStatus> {
  const existing = manifest.sources[rawPath];

  try {
    await fs.stat(await resolveVaultPath(config, sourceNotePath));
  } catch {
    return existing ? "missing_source_note" : "new";
  }

  if (!existing) {
    return "new";
  }
  if (existing.raw_hash !== rawHash) {
    return "changed";
  }
  return "compiled";
}

function buildPrimaryAssetRef(rawPath: string, rawHash: string, mimeType: string) {
  return {
    raw_path: rawPath,
    mime_type: mimeType,
    role: "primary" as const,
    raw_hash: rawHash,
  };
}

function normalizeAssetRefs(
  rawPath: string,
  rawHash: string,
  mimeType: string,
  existingAssetRefs: SourceManifestEntry["asset_refs"] | undefined,
) {
  const primaryAssetRef = buildPrimaryAssetRef(rawPath, rawHash, mimeType);
  const extraAssetRefs = (existingAssetRefs ?? []).filter(
    (entry) => !(entry.role === "primary" && entry.raw_path === rawPath),
  );
  return [primaryAssetRef, ...extraAssetRefs];
}

export function listRepresentationKinds(): RepresentationKind[] {
  return [...REPRESENTATION_KINDS];
}

export function isRepresentationKind(value: string): value is RepresentationKind {
  return REPRESENTATION_KINDS.includes(value as RepresentationKind);
}

export function requireRepresentationKind(value: string): RepresentationKind {
  if (!isRepresentationKind(value)) {
    throw new Error(
      `validation_error: kind must be one of ${REPRESENTATION_KINDS.join(", ")}`,
    );
  }
  return value;
}

export function buildRepresentationRelativePath(
  config: KnowledgeBasePluginConfig,
  docId: string,
  kind: RepresentationKind,
): string {
  const fileName = REPRESENTATION_FILE_NAME_BY_KIND[kind];
  return `${getVaultPaths(config).representations}/${docId}/${fileName}`;
}

export async function prepareManifestEntryForRaw(
  config: KnowledgeBasePluginConfig,
  manifest: ManifestFile,
  rawPath: string,
): Promise<{
  docId: string;
  rawHash: string;
  sourceNotePath: string;
  entry: SourceManifestEntry;
}> {
  const rawInfo = requireSupportedRawPath(config, rawPath);
  const rawAbsolutePath = await resolveVaultPath(config, rawPath);

  let rawStats: Awaited<ReturnType<typeof fs.stat>>;
  try {
    rawStats = await fs.stat(rawAbsolutePath);
  } catch {
    throw new Error(`not_found: raw file not found: ${rawPath}`);
  }

  const rawHash = await hashFile(rawAbsolutePath);
  const existing = manifest.sources[rawPath];
  const docId = resolveCanonicalDocId(manifest, rawPath);
  const sourceNotePath = existing?.source_note_path ?? `${getVaultPaths(config).sources}/${docId}.md`;

  return {
    docId,
    rawHash,
    sourceNotePath,
    entry: {
      doc_id: docId,
      raw_path: rawPath,
      raw_hash: rawHash,
      raw_kind: rawInfo.rawKind,
      mime_type: rawInfo.mimeType,
      size_bytes: rawStats.size,
      source_note_path: sourceNotePath,
      title: existing?.title ?? guessTitleFromRawPath(rawPath),
      compiled_at: existing?.compiled_at ?? null,
      status: await inferSourceStatus(config, manifest, rawPath, rawHash, sourceNotePath),
      asset_refs: normalizeAssetRefs(rawPath, rawHash, rawInfo.mimeType, existing?.asset_refs),
      representations: existing?.representations ?? [],
    },
  };
}

export function upsertRepresentationEntry(
  entries: RepresentationEntry[],
  nextEntry: RepresentationEntry,
): RepresentationEntry[] {
  const next = entries.filter((entry) => entry.kind !== nextEntry.kind);
  next.push(nextEntry);
  next.sort((left, right) => {
    const leftOrder = REPRESENTATION_KIND_ORDER.get(left.kind) ?? Number.MAX_SAFE_INTEGER;
    const rightOrder = REPRESENTATION_KIND_ORDER.get(right.kind) ?? Number.MAX_SAFE_INTEGER;
    if (leftOrder !== rightOrder) {
      return leftOrder - rightOrder;
    }
    return left.path.localeCompare(right.path);
  });
  return next;
}

export function evaluateCompileReadiness(
  rawKind: RawKind,
  representations: RepresentationEntry[],
): CompileReadiness {
  if (rawKind === "text" || rawKind === "data") {
    return "ready";
  }

  if (representations.length === 0) {
    return "needs_representation";
  }

  const readyKinds = COMPILE_READY_REPRESENTATION_KINDS[rawKind] ?? [];
  if (representations.some((entry) => readyKinds.includes(entry.kind))) {
    return "ready";
  }

  return "partial";
}

export async function buildRawAssetInfo(
  config: KnowledgeBasePluginConfig,
  manifest: ManifestFile,
  rawPath: string,
): Promise<{
  docId: string;
  raw: {
    raw_path: string;
    raw_kind: RawKind;
    mime_type: string;
    raw_hash: string;
    size_bytes: number;
    absolute_path: string;
  };
  sourceNotePath: string;
  assetRefs: SourceManifestEntry["asset_refs"];
  representations: RepresentationEntry[];
  compileReadiness: CompileReadiness;
}> {
  const prepared = await prepareManifestEntryForRaw(config, manifest, rawPath);
  return {
    docId: prepared.docId,
    raw: {
      raw_path: rawPath,
      raw_kind: prepared.entry.raw_kind,
      mime_type: prepared.entry.mime_type,
      raw_hash: prepared.rawHash,
      size_bytes: prepared.entry.size_bytes,
      absolute_path: await resolveVaultPath(config, rawPath),
    },
    sourceNotePath: prepared.sourceNotePath,
    assetRefs: prepared.entry.asset_refs,
    representations: prepared.entry.representations,
    compileReadiness: evaluateCompileReadiness(
      prepared.entry.raw_kind,
      prepared.entry.representations,
    ),
  };
}
