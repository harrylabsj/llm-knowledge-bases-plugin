import fs from "node:fs/promises";

import type { KnowledgeBasePluginConfig, RepresentationKind } from "../types.js";
import { loadManifest } from "../core/manifest.js";
import {
  prepareManifestEntryForRaw,
  requireRepresentationKind,
} from "../core/representations.js";
import { resolveVaultPath } from "../core/paths.js";
import { validateRuntimeConfig } from "../core/validate.js";

function normalizeRequestedKinds(inputKinds?: string[]): RepresentationKind[] | undefined {
  if (inputKinds === undefined) {
    return undefined;
  }
  if (!Array.isArray(inputKinds) || inputKinds.length === 0) {
    throw new Error("validation_error: kinds must contain at least one item");
  }

  const kinds = inputKinds.map((kind) => requireRepresentationKind(kind));
  return [...new Set(kinds)];
}

export async function kbReadRepresentations(
  config: KnowledgeBasePluginConfig,
  input: { raw_path: string; kinds?: string[] },
) {
  await validateRuntimeConfig(config);
  const requestedKinds = normalizeRequestedKinds(input.kinds);
  const manifest = await loadManifest(config);
  const prepared = await prepareManifestEntryForRaw(config, manifest, input.raw_path);
  const storedEntries = prepared.entry.representations;

  if (storedEntries.length === 0) {
    throw new Error(`not_found: no representations stored for ${input.raw_path}`);
  }

  const selectedEntries = requestedKinds
    ? requestedKinds.map((kind) => {
        const match = storedEntries.find((entry) => entry.kind === kind);
        if (!match) {
          throw new Error(`not_found: representation not found for ${input.raw_path}: ${kind}`);
        }
        return match;
      })
    : storedEntries;

  const items = [];
  for (const entry of selectedEntries) {
    let content: string;
    try {
      content = await fs.readFile(await resolveVaultPath(config, entry.path), "utf8");
    } catch {
      throw new Error(`not_found: representation file not found: ${entry.path}`);
    }

    items.push({
      kind: entry.kind,
      representation_path: entry.path,
      content_hash: entry.content_hash,
      generated_at: entry.generated_at,
      content,
    });
  }

  return {
    doc_id: prepared.docId,
    raw_path: input.raw_path,
    raw_kind: prepared.entry.raw_kind,
    mime_type: prepared.entry.mime_type,
    items,
  };
}
