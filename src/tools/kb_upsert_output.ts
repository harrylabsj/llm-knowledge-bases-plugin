import fs from "node:fs/promises";

import type { KnowledgeBasePluginConfig, ManifestFile } from "../types.js";
import { atomicWriteText } from "../core/atomic-write.js";
import { OUTPUT_REQUIRED_HEADINGS, parseOutputNoteMarkdown } from "../core/frontmatter.js";
import { loadManifest } from "../core/manifest.js";
import { buildOutputId, buildOutputPathFromId, parseOutputId } from "../core/naming.js";
import { getVaultPaths, resolveVaultPath } from "../core/paths.js";
import { appendRunLog } from "../core/runs.js";
import { requireHeadings, validateRuntimeConfig } from "../core/validate.js";

async function sourceRefExists(
  config: KnowledgeBasePluginConfig,
  manifest: ManifestFile,
  sourceRef: string,
): Promise<boolean> {
  const manifestDocIds = new Set(Object.values(manifest.sources).map((item) => item.doc_id));
  if (manifestDocIds.has(sourceRef)) {
    return true;
  }

  try {
    await fs.stat(await resolveVaultPath(config, `${getVaultPaths(config).sources}/${sourceRef}.md`));
    return true;
  } catch {
    return false;
  }
}

export async function kbUpsertOutput(
  config: KnowledgeBasePluginConfig,
  input: { markdown: string },
) {
  await validateRuntimeConfig(config);

  if (!input.markdown?.trim()) {
    throw new Error("validation_error: markdown is required");
  }

  const { frontmatter, body } = parseOutputNoteMarkdown(input.markdown);
  requireHeadings(body, [...OUTPUT_REQUIRED_HEADINGS]);

  const parsedOutputId = parseOutputId(frontmatter.id);
  if (!parsedOutputId) {
    throw new Error("validation_error: output id must match out-YYYY-MM-DD-<slug>");
  }

  const expectedOutputId = buildOutputId(frontmatter.title, parsedOutputId.dateStamp);
  if (frontmatter.id !== expectedOutputId) {
    throw new Error(`validation_error: output id must match canonical title slug "${expectedOutputId}"`);
  }

  const manifest = await loadManifest(config);
  for (const sourceRef of frontmatter.source_refs) {
    if (!(await sourceRefExists(config, manifest, sourceRef))) {
      throw new Error(`validation_error: source_ref not found: ${sourceRef}`);
    }
  }

  const outputPath = buildOutputPathFromId(getVaultPaths(config).outputs, frontmatter.id);
  await atomicWriteText(
    await resolveVaultPath(config, outputPath),
    input.markdown.endsWith("\n") ? input.markdown : `${input.markdown}\n`,
  );

  await appendRunLog(config, {
    ts: new Date().toISOString(),
    action: "kb_upsert_output",
    target: outputPath,
    status: "ok",
  });

  return {
    ok: true,
    output_id: frontmatter.id,
    output_path: outputPath,
  };
}
