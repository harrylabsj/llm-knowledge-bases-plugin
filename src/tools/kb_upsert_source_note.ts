import fs from "node:fs/promises";

import type { AssetRef, KnowledgeBasePluginConfig } from "../types.js";
import { atomicWriteText } from "../core/atomic-write.js";
import { parseSourceNoteMarkdown, SOURCE_REQUIRED_HEADINGS } from "../core/frontmatter.js";
import { hashFile } from "../core/hash.js";
import { loadManifest, resolveCanonicalDocId, saveManifest } from "../core/manifest.js";
import { getVaultPaths, resolveVaultPath } from "../core/paths.js";
import { prepareManifestEntryForRaw } from "../core/representations.js";
import { appendRunLog } from "../core/runs.js";
import { requireHeadings, requireSupportedRawPath, validateRuntimeConfig } from "../core/validate.js";

async function buildSourceAssetRefs(
  config: KnowledgeBasePluginConfig,
  primaryRawPath: string,
  assetPaths: string[],
) : Promise<AssetRef[]> {
  const seen = new Set<string>();
  const orderedAssetPaths = [primaryRawPath, ...assetPaths.filter((assetPath) => assetPath !== primaryRawPath)];
  const assetRefs: AssetRef[] = [];

  for (const assetPath of orderedAssetPaths) {
    if (seen.has(assetPath)) {
      continue;
    }
    seen.add(assetPath);

    const assetInfo = requireSupportedRawPath(config, assetPath);
    const assetAbsolutePath = await resolveVaultPath(config, assetPath);

    try {
      await fs.stat(assetAbsolutePath);
    } catch {
      throw new Error(`not_found: asset file not found: ${assetPath}`);
    }

    assetRefs.push({
      raw_path: assetPath,
      mime_type: assetInfo.mimeType,
      role: assetPath === primaryRawPath ? "primary" : "attachment",
      raw_hash: await hashFile(assetAbsolutePath),
    });
  }

  return assetRefs;
}

export async function kbUpsertSourceNote(
  config: KnowledgeBasePluginConfig,
  input: { raw_path: string; markdown: string },
) {
  await validateRuntimeConfig(config);
  const rawInfo = requireSupportedRawPath(config, input.raw_path);

  if (!input.markdown?.trim()) {
    throw new Error("validation_error: markdown is required");
  }

  const rawAbsolutePath = await resolveVaultPath(config, input.raw_path);
  try {
    await fs.stat(rawAbsolutePath);
  } catch {
    throw new Error(`not_found: raw file not found: ${input.raw_path}`);
  }

  const manifest = await loadManifest(config);
  const prepared = await prepareManifestEntryForRaw(config, manifest, input.raw_path);
  const docId = resolveCanonicalDocId(manifest, input.raw_path);
  const sourceNotePath = `${getVaultPaths(config).sources}/${docId}.md`;
  const rawHash = prepared.rawHash;
  const { frontmatter, body } = parseSourceNoteMarkdown(input.markdown);

  requireHeadings(body, [...SOURCE_REQUIRED_HEADINGS]);

  if (frontmatter.id !== docId) {
    throw new Error(`validation_error: source id must match canonical doc_id "${docId}"`);
  }
  if (frontmatter.raw_path !== input.raw_path) {
    throw new Error(`validation_error: raw_path must match "${input.raw_path}"`);
  }
  if (frontmatter.raw_hash !== rawHash) {
    throw new Error(`hash_mismatch: raw_hash does not match the current raw file`);
  }
  if (frontmatter.raw_kind && frontmatter.raw_kind !== rawInfo.rawKind) {
    throw new Error(`validation_error: raw_kind must match "${rawInfo.rawKind}"`);
  }
  if (frontmatter.mime_type && frontmatter.mime_type !== rawInfo.mimeType) {
    throw new Error(`validation_error: mime_type must match "${rawInfo.mimeType}"`);
  }

  const explicitAssetPaths = frontmatter.asset_paths.length > 0
    ? frontmatter.asset_paths
    : prepared.entry.asset_refs
        .map((entry) => entry.raw_path)
        .filter((assetPath) => assetPath !== input.raw_path);
  const assetRefs = await buildSourceAssetRefs(config, input.raw_path, explicitAssetPaths);

  const sourceAbsolutePath = await resolveVaultPath(config, sourceNotePath);
  await atomicWriteText(
    sourceAbsolutePath,
    input.markdown.endsWith("\n") ? input.markdown : `${input.markdown}\n`,
  );

  manifest.sources[input.raw_path] = {
    doc_id: docId,
    raw_path: input.raw_path,
    raw_hash: rawHash,
    raw_kind: rawInfo.rawKind,
    mime_type: rawInfo.mimeType,
    size_bytes: prepared.entry.size_bytes,
    source_note_path: sourceNotePath,
    title: frontmatter.title,
    compiled_at: new Date().toISOString(),
    status: "compiled",
    asset_refs: assetRefs,
    representations: prepared.entry.representations,
  };
  await saveManifest(config, manifest);
  await appendRunLog(config, {
    ts: new Date().toISOString(),
    action: "kb_upsert_source_note",
    target: sourceNotePath,
    status: "ok",
  });

  return {
    ok: true,
    doc_id: docId,
    source_note_path: sourceNotePath,
    manifest_updated: true,
  };
}
