import path from "node:path";

import type { KnowledgeBasePluginConfig } from "../types.js";
import { hashFile } from "../core/hash.js";
import { SOURCE_REQUIRED_HEADINGS } from "../core/frontmatter.js";
import { loadManifest, resolveCanonicalDocId } from "../core/manifest.js";
import { getVaultPaths, resolveVaultPath } from "../core/paths.js";
import { requireRawPath, validateRuntimeConfig } from "../core/validate.js";

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
  requireRawPath(config, input.raw_path);
  const absolute = await resolveVaultPath(config, input.raw_path);
  const manifest = await loadManifest(config);
  const docId = resolveCanonicalDocId(manifest, input.raw_path);

  return {
    doc_id: docId,
    source_note_path: `${getVaultPaths(config).sources}/${docId}.md`,
    title_guess: guessTitle(input.raw_path),
    raw_hash: await hashFile(absolute),
    source_kind: "raw_markdown",
    template: {
      required_headings: [...SOURCE_REQUIRED_HEADINGS],
    },
  };
}
