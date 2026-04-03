import fs from "node:fs/promises";

import type { KnowledgeBasePluginConfig } from "../types.js";
import { atomicWriteText } from "../core/atomic-write.js";
import { parseSourceNoteMarkdown, SOURCE_REQUIRED_HEADINGS } from "../core/frontmatter.js";
import { hashFile } from "../core/hash.js";
import { loadManifest, resolveCanonicalDocId, saveManifest } from "../core/manifest.js";
import { getVaultPaths, resolveVaultPath } from "../core/paths.js";
import { appendRunLog } from "../core/runs.js";
import { requireHeadings, requireRawPath, validateRuntimeConfig } from "../core/validate.js";

export async function kbUpsertSourceNote(
  config: KnowledgeBasePluginConfig,
  input: { raw_path: string; markdown: string },
) {
  await validateRuntimeConfig(config);
  requireRawPath(config, input.raw_path);

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
  const docId = resolveCanonicalDocId(manifest, input.raw_path);
  const sourceNotePath = `${getVaultPaths(config).sources}/${docId}.md`;
  const rawHash = await hashFile(rawAbsolutePath);
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

  const sourceAbsolutePath = await resolveVaultPath(config, sourceNotePath);
  await atomicWriteText(
    sourceAbsolutePath,
    input.markdown.endsWith("\n") ? input.markdown : `${input.markdown}\n`,
  );

  manifest.sources[input.raw_path] = {
    doc_id: docId,
    raw_path: input.raw_path,
    raw_hash: rawHash,
    source_note_path: sourceNotePath,
    title: frontmatter.title,
    compiled_at: new Date().toISOString(),
    status: "compiled",
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
