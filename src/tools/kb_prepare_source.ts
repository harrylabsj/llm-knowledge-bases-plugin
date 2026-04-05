import fs from "node:fs/promises";
import path from "node:path";

import type { KnowledgeBasePluginConfig } from "../types.js";
import { hashFile } from "../core/hash.js";
import { SOURCE_REQUIRED_HEADINGS } from "../core/frontmatter.js";
import { loadManifest, resolveCanonicalDocId } from "../core/manifest.js";
import { getVaultPaths, resolveVaultPath } from "../core/paths.js";
import { requireSupportedRawPath, validateRuntimeConfig } from "../core/validate.js";

function guessTitle(rawPath: string): string {
  return path
    .parse(rawPath)
    .name.replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export async function kbPrepareSource(
  config: KnowledgeBasePluginConfig,
  input: { raw_path: string },
) {
  await validateRuntimeConfig(config);
  const rawInfo = requireSupportedRawPath(config, input.raw_path);
  const absolute = await resolveVaultPath(config, input.raw_path);
  const stats = await fs.stat(absolute);
  const manifest = await loadManifest(config);
  const docId = resolveCanonicalDocId(manifest, input.raw_path);
  const rawHash = await hashFile(absolute);

  return {
    doc_id: docId,
    source_note_path: `${getVaultPaths(config).sources}/${docId}.md`,
    title_guess: guessTitle(input.raw_path),
    raw_hash: rawHash,
    raw_kind: rawInfo.rawKind,
    mime_type: rawInfo.mimeType,
    size_bytes: stats.size,
    representation_count: manifest.sources[input.raw_path]?.representations.length ?? 0,
    asset_refs: [
      {
        raw_path: input.raw_path,
        mime_type: rawInfo.mimeType,
        role: "primary",
        raw_hash: rawHash,
      },
    ],
    source_kind: rawInfo.sourceKindGuess,
    template: {
      required_headings: [...SOURCE_REQUIRED_HEADINGS],
    },
  };
}
