import type { KnowledgeBasePluginConfig } from "../types.js";
import { atomicWriteText } from "../core/atomic-write.js";
import { hashText } from "../core/hash.js";
import { loadManifest, saveManifest } from "../core/manifest.js";
import { resolveVaultPath } from "../core/paths.js";
import {
  buildRepresentationRelativePath,
  prepareManifestEntryForRaw,
  requireRepresentationKind,
  upsertRepresentationEntry,
} from "../core/representations.js";
import { appendRunLog } from "../core/runs.js";
import { validateRuntimeConfig } from "../core/validate.js";

export async function kbUpsertRepresentation(
  config: KnowledgeBasePluginConfig,
  input: { raw_path: string; kind: string; content: string },
) {
  await validateRuntimeConfig(config);

  if (!input.content?.trim()) {
    throw new Error("validation_error: content is required");
  }

  const kind = requireRepresentationKind(input.kind);
  const manifest = await loadManifest(config);
  const prepared = await prepareManifestEntryForRaw(config, manifest, input.raw_path);
  const representationPath = buildRepresentationRelativePath(config, prepared.docId, kind);
  const normalizedContent = input.content.endsWith("\n") ? input.content : `${input.content}\n`;
  const contentHash = hashText(normalizedContent);
  const generatedAt = new Date().toISOString();

  await atomicWriteText(
    await resolveVaultPath(config, representationPath),
    normalizedContent,
  );

  manifest.sources[input.raw_path] = {
    ...prepared.entry,
    representations: upsertRepresentationEntry(prepared.entry.representations, {
      kind,
      path: representationPath,
      content_hash: contentHash,
      generated_at: generatedAt,
      raw_hash: prepared.rawHash,
    }),
  };

  await saveManifest(config, manifest);
  await appendRunLog(config, {
    ts: generatedAt,
    action: "kb_upsert_representation",
    target: representationPath,
    status: "ok",
  });

  return {
    ok: true,
    doc_id: prepared.docId,
    raw_path: input.raw_path,
    kind,
    representation_path: representationPath,
    content_hash: contentHash,
    generated_at: generatedAt,
    manifest_updated: true,
  };
}
