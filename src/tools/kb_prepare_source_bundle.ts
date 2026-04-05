import type { KnowledgeBasePluginConfig } from "../types.js";
import { loadManifest } from "../core/manifest.js";
import { buildRawAssetInfo } from "../core/representations.js";
import { validateRuntimeConfig } from "../core/validate.js";

export async function kbPrepareSourceBundle(
  config: KnowledgeBasePluginConfig,
  input: { raw_path: string },
) {
  await validateRuntimeConfig(config);
  const manifest = await loadManifest(config);
  const asset = await buildRawAssetInfo(config, manifest, input.raw_path);

  return {
    doc_id: asset.docId,
    source_note_path: asset.sourceNotePath,
    raw: {
      raw_path: asset.raw.raw_path,
      raw_kind: asset.raw.raw_kind,
      mime_type: asset.raw.mime_type,
      raw_hash: asset.raw.raw_hash,
      size_bytes: asset.raw.size_bytes,
    },
    asset_refs: asset.assetRefs,
    representations: asset.representations,
    compile_readiness: asset.compileReadiness,
  };
}
