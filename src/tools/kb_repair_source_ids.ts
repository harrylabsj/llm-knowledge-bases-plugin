import fs from "node:fs/promises";
import path from "node:path";

import matter from "gray-matter";

import type {
  AssetRef,
  KnowledgeBasePluginConfig,
  RepairSourceIdsItem,
  RepairSourceIdsResult,
  SourceManifestEntry,
} from "../types.js";
import { atomicWriteText } from "../core/atomic-write.js";
import { hashFile } from "../core/hash.js";
import {
  allocateUniqueDocId,
  buildSourceDocIdBase,
  loadManifest,
  saveManifest,
} from "../core/manifest.js";
import { listMarkdownFiles } from "../core/notes.js";
import { getVaultPaths, resolveVaultPath } from "../core/paths.js";
import { getSupportedRawFileInfo } from "../core/raw-files.js";
import { appendRunLog } from "../core/runs.js";
import { listRawFiles } from "../core/scan.js";
import { requireSupportedRawPath, validateRuntimeConfig } from "../core/validate.js";
import { kbRebuildIndexes } from "./kb_rebuild_indexes.js";

const SOURCE_ID_PATTERN = /^src-[a-z0-9][a-z0-9-]*$/;
const UNTITLED_SOURCE_ID_PATTERN = /^src-untitled(?:-\d+)?$/;
const SHA256_PATTERN = /^sha256:[a-f0-9]{64}$/;

type LooseSourceCandidate = {
  notePath: string;
  data: Record<string, unknown>;
  body: string;
  rawPath?: string;
  id?: string;
  title?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isReusableSourceId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    SOURCE_ID_PATTERN.test(value) &&
    !UNTITLED_SOURCE_ID_PATTERN.test(value)
  );
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0);
}

function normalizeTimestamp(value: unknown, fallback: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    return fallback;
  }

  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return fallback;
  }

  return new Date(parsed).toISOString();
}

function normalizeNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : undefined;
}

function guessTitleFromRawPath(rawPath: string): string {
  return path
    .posix
    .parse(rawPath)
    .name
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeAssetRefs(
  rawPath: string,
  rawHash: string,
  mimeType: string,
  existingAssetRefs: AssetRef[] | undefined,
): AssetRef[] {
  const next: AssetRef[] = [
    {
      raw_path: rawPath,
      mime_type: mimeType,
      role: "primary",
      raw_hash: rawHash,
    },
  ];

  for (const entry of existingAssetRefs ?? []) {
    if (entry.role === "primary" && entry.raw_path === rawPath) {
      continue;
    }
    next.push(entry);
  }

  return next;
}

function computeStatus(
  existing: SourceManifestEntry | undefined,
  rawHash: string,
  sourceNoteExists: boolean,
): SourceManifestEntry["status"] {
  if (sourceNoteExists) {
    return "compiled";
  }

  if (!existing) {
    return "new";
  }

  return existing.raw_hash === rawHash ? "missing_source_note" : "changed";
}

function parseLooseSourceCandidate(notePath: string, markdown: string): LooseSourceCandidate {
  const parsed = matter(markdown);
  const data = isRecord(parsed.data) ? parsed.data : {};

  return {
    notePath,
    data,
    body: parsed.content.replace(/^\n+/, ""),
    rawPath: normalizeNonEmptyString(data.raw_path),
    id: normalizeNonEmptyString(data.id),
    title: normalizeNonEmptyString(data.title),
  };
}

function chooseCandidate(
  rawPath: string,
  candidates: LooseSourceCandidate[],
  manifestEntry: SourceManifestEntry | undefined,
): LooseSourceCandidate | undefined {
  return [...candidates].sort((left, right) => {
    const leftScore =
      (isReusableSourceId(left.id) ? 100 : 0) +
      (isReusableSourceId(path.posix.parse(left.notePath).name) ? 50 : 0) +
      (manifestEntry?.source_note_path === left.notePath ? 20 : 0) +
      (left.rawPath === rawPath ? 10 : 0);
    const rightScore =
      (isReusableSourceId(right.id) ? 100 : 0) +
      (isReusableSourceId(path.posix.parse(right.notePath).name) ? 50 : 0) +
      (manifestEntry?.source_note_path === right.notePath ? 20 : 0) +
      (right.rawPath === rawPath ? 10 : 0);

    if (leftScore !== rightScore) {
      return rightScore - leftScore;
    }

    return left.notePath.localeCompare(right.notePath);
  })[0];
}

function choosePreferredDocId(
  rawPath: string,
  candidate: LooseSourceCandidate | undefined,
  manifestEntry: SourceManifestEntry | undefined,
): string {
  if (candidate && isReusableSourceId(candidate.id)) {
    return candidate.id;
  }

  if (candidate) {
    const noteStem = path.posix.parse(candidate.notePath).name;
    if (isReusableSourceId(noteStem)) {
      return noteStem;
    }
  }

  if (manifestEntry && isReusableSourceId(manifestEntry.doc_id)) {
    return manifestEntry.doc_id;
  }

  return buildSourceDocIdBase(rawPath);
}

function buildRepairedSourceMarkdown(args: {
  candidate: LooseSourceCandidate;
  docId: string;
  rawPath: string;
  rawHash: string;
  rawKind: string;
  mimeType: string;
  sourceKind: string;
  title: string;
  createdAt: string;
  updatedAt: string;
}): string {
  const {
    candidate,
    docId,
    rawPath,
    rawHash,
    rawKind,
    mimeType,
    sourceKind,
    title,
    createdAt,
    updatedAt,
  } = args;
  const extras = { ...candidate.data };
  delete extras.id;
  delete extras.type;
  delete extras.title;
  delete extras.raw_path;
  delete extras.raw_hash;
  delete extras.raw_kind;
  delete extras.mime_type;
  delete extras.asset_paths;
  delete extras.source_kind;
  delete extras.tags;
  delete extras.created_at;
  delete extras.updated_at;
  delete extras.status;

  const tags = normalizeStringArray(candidate.data.tags);
  const assetPaths = normalizeStringArray(candidate.data.asset_paths);
  const nextSourceKind = normalizeNonEmptyString(candidate.data.source_kind) ?? sourceKind;
  const status = normalizeNonEmptyString(candidate.data.status) ?? "active";
  const nextData = {
    id: docId,
    type: "source",
    title,
    raw_path: rawPath,
    raw_hash: rawHash,
    raw_kind: rawKind,
    mime_type: mimeType,
    ...(assetPaths.length > 0 ? { asset_paths: assetPaths } : {}),
    source_kind: nextSourceKind,
    ...(tags.length > 0 ? { tags } : {}),
    created_at: createdAt,
    updated_at: updatedAt,
    status,
    ...extras,
  };

  return matter.stringify(candidate.body.trimStart(), nextData);
}

export async function kbRepairSourceIds(
  config: KnowledgeBasePluginConfig,
  input?: { apply?: boolean },
): Promise<RepairSourceIdsResult> {
  await validateRuntimeConfig(config);

  const apply = input?.apply === true;
  const now = new Date().toISOString();
  const paths = getVaultPaths(config);
  const manifest = await loadManifest(config);
  const rawItems = await listRawFiles(config);
  const currentRawPaths = new Set(rawItems.map((item) => item.raw_path));
  const sourceNotePaths = await listMarkdownFiles(config, paths.sources);

  const candidatesByRawPath = new Map<string, LooseSourceCandidate[]>();
  const sourcePathOwner = new Map<string, string>();

  for (const notePath of sourceNotePaths) {
    const absolutePath = await resolveVaultPath(config, notePath);
    const candidate = parseLooseSourceCandidate(notePath, await fs.readFile(absolutePath, "utf8"));
    if (!candidate.rawPath) {
      continue;
    }

    const existing = candidatesByRawPath.get(candidate.rawPath) ?? [];
    existing.push(candidate);
    candidatesByRawPath.set(candidate.rawPath, existing);
    sourcePathOwner.set(notePath, candidate.rawPath);
  }

  const usedDocIds = new Set<string>();
  for (const candidate of candidatesByRawPath.values()) {
    for (const note of candidate) {
      if (currentRawPaths.has(note.rawPath ?? "")) {
        continue;
      }
      if (isReusableSourceId(note.id)) {
        usedDocIds.add(note.id);
      }
      const noteStem = path.posix.parse(note.notePath).name;
      if (isReusableSourceId(noteStem)) {
        usedDocIds.add(noteStem);
      }
    }
  }

  const repairs: RepairSourceIdsItem[] = [];
  const skipped: RepairSourceIdsResult["skipped"] = [];

  for (const rawItem of rawItems) {
    const rawPath = rawItem.raw_path;
    const manifestEntry = manifest.sources[rawPath];
    const rawInfo = requireSupportedRawPath(config, rawPath);
    const rawAbsolutePath = await resolveVaultPath(config, rawPath);
    const rawHash = await hashFile(rawAbsolutePath);
    const candidate = chooseCandidate(rawPath, candidatesByRawPath.get(rawPath) ?? [], manifestEntry);
    const title =
      candidate?.title ??
      normalizeNonEmptyString(manifestEntry?.title) ??
      guessTitleFromRawPath(rawPath);

    const preferredDocId = choosePreferredDocId(rawPath, candidate, manifestEntry);
    let docId = allocateUniqueDocId(preferredDocId, usedDocIds);
    let sourceNotePath = `${paths.sources}/${docId}.md`;

    while (sourcePathOwner.has(sourceNotePath) && sourcePathOwner.get(sourceNotePath) !== rawPath) {
      usedDocIds.add(docId);
      docId = allocateUniqueDocId(preferredDocId, usedDocIds);
      sourceNotePath = `${paths.sources}/${docId}.md`;
    }
    usedDocIds.add(docId);

    const oldDocId = manifestEntry?.doc_id ?? candidate?.id ?? null;
    const oldSourceNotePath = manifestEntry?.source_note_path ?? candidate?.notePath ?? null;
    const sourceNoteFound = candidate !== undefined;
    const sourceNoteNeedsRewrite =
      candidate !== undefined &&
      (
        candidate.notePath !== sourceNotePath ||
        candidate.id !== docId ||
        candidate.rawPath !== rawPath ||
        candidate.title !== title ||
        normalizeNonEmptyString(candidate.data.raw_kind) !== rawInfo.rawKind ||
        normalizeNonEmptyString(candidate.data.mime_type) !== rawInfo.mimeType ||
        !SHA256_PATTERN.test(normalizeNonEmptyString(candidate.data.raw_hash) ?? "") ||
        candidate.data.raw_hash !== rawHash
      );

    const nextManifestEntry: SourceManifestEntry = {
      doc_id: docId,
      raw_path: rawPath,
      raw_hash: rawHash,
      raw_kind: rawInfo.rawKind,
      mime_type: rawInfo.mimeType,
      size_bytes: rawItem.size_bytes,
      source_note_path: sourceNotePath,
      title,
      compiled_at:
        sourceNoteFound
          ? manifestEntry?.compiled_at ?? now
          : manifestEntry?.compiled_at ?? null,
      status: computeStatus(manifestEntry, rawHash, sourceNoteFound),
      asset_refs: normalizeAssetRefs(rawPath, rawHash, rawInfo.mimeType, manifestEntry?.asset_refs),
      representations: manifestEntry?.representations ?? [],
    };

    const manifestNeedsUpdate =
      !manifestEntry ||
      manifestEntry.doc_id !== nextManifestEntry.doc_id ||
      manifestEntry.source_note_path !== nextManifestEntry.source_note_path ||
      manifestEntry.raw_hash !== nextManifestEntry.raw_hash ||
      manifestEntry.raw_kind !== nextManifestEntry.raw_kind ||
      manifestEntry.mime_type !== nextManifestEntry.mime_type ||
      manifestEntry.size_bytes !== nextManifestEntry.size_bytes ||
      manifestEntry.title !== nextManifestEntry.title ||
      manifestEntry.compiled_at !== nextManifestEntry.compiled_at ||
      manifestEntry.status !== nextManifestEntry.status;

    if (!sourceNoteNeedsRewrite && !manifestNeedsUpdate) {
      continue;
    }

    if (!sourceNoteFound && manifestNeedsUpdate) {
      skipped.push({
        raw_path: rawPath,
        reason: "manifest can be corrected, but no source note currently exists to rewrite",
      });
    }

    if (apply) {
      if (candidate) {
        const createdAt = normalizeTimestamp(candidate.data.created_at, now);
        const repairedMarkdown = buildRepairedSourceMarkdown({
          candidate,
          docId,
          rawPath,
          rawHash,
          rawKind: rawInfo.rawKind,
          mimeType: rawInfo.mimeType,
          sourceKind: rawInfo.sourceKindGuess,
          title,
          createdAt,
          updatedAt: now,
        });
        const nextAbsolutePath = await resolveVaultPath(config, sourceNotePath);
        await atomicWriteText(nextAbsolutePath, repairedMarkdown.endsWith("\n") ? repairedMarkdown : `${repairedMarkdown}\n`);

        if (candidate.notePath !== sourceNotePath) {
          await fs.rm(await resolveVaultPath(config, candidate.notePath), { force: true });
        }
      }

      manifest.sources[rawPath] = nextManifestEntry;
    }

    repairs.push({
      raw_path: rawPath,
      old_doc_id: oldDocId,
      new_doc_id: docId,
      old_source_note_path: oldSourceNotePath,
      new_source_note_path: sourceNotePath,
      source_note_found: sourceNoteFound,
      source_note_rewritten: sourceNoteNeedsRewrite && sourceNoteFound,
      manifest_updated: manifestNeedsUpdate,
    });
  }

  if (apply && repairs.length > 0) {
    await saveManifest(config, manifest);
    await appendRunLog(config, {
      ts: now,
      action: "kb_repair_source_ids",
      target: `${repairs.length} repaired source records`,
      status: "ok",
    });
  }

  const rebuiltIndexes = apply && repairs.some((repair) => repair.source_note_rewritten);
  if (rebuiltIndexes) {
    await kbRebuildIndexes(config);
  }

  return {
    ok: true,
    apply,
    scanned_raw_count: rawItems.length,
    repaired_count: repairs.length,
    source_note_rewrite_count: repairs.filter((repair) => repair.source_note_rewritten).length,
    manifest_update_count: repairs.filter((repair) => repair.manifest_updated).length,
    rebuilt_indexes: rebuiltIndexes,
    repairs,
    skipped,
  };
}
