import type { KnowledgeBasePluginConfig } from "../types.js";
import { loadManifest } from "../core/manifest.js";
import {
  buildRepresentationRelativePath,
  prepareManifestEntryForRaw,
  requireRepresentationKind,
} from "../core/representations.js";
import { validateRuntimeConfig } from "../core/validate.js";

export async function kbPrepareRepresentation(
  config: KnowledgeBasePluginConfig,
  input: { raw_path: string; kind: string },
) {
  await validateRuntimeConfig(config);
  const kind = requireRepresentationKind(input.kind);
  const manifest = await loadManifest(config);
  const prepared = await prepareManifestEntryForRaw(config, manifest, input.raw_path);

  return {
    doc_id: prepared.docId,
    raw_path: input.raw_path,
    raw_hash: prepared.rawHash,
    raw_kind: prepared.entry.raw_kind,
    mime_type: prepared.entry.mime_type,
    size_bytes: prepared.entry.size_bytes,
    kind,
    representation_path: buildRepresentationRelativePath(config, prepared.docId, kind),
  };
}
