import type { KnowledgeBasePluginConfig } from "../types.js";
import { loadManifest } from "../core/manifest.js";
import { buildRawAssetInfo } from "../core/representations.js";
import { validateRuntimeConfig } from "../core/validate.js";

export async function kbGetRawAsset(
  config: KnowledgeBasePluginConfig,
  input: { raw_path: string },
) {
  await validateRuntimeConfig(config);
  const manifest = await loadManifest(config);
  const asset = await buildRawAssetInfo(config, manifest, input.raw_path);

  return asset.raw;
}
