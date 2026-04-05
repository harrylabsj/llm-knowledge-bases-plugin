import fs from "node:fs/promises";

import type { DerivedNoteKind, KnowledgeBasePluginConfig, ManifestFile } from "../types.js";
import { atomicWriteText } from "../core/atomic-write.js";
import {
  DERIVED_NOTE_REQUIRED_HEADINGS,
  parseDerivedNoteMarkdown,
} from "../core/frontmatter.js";
import { loadManifest } from "../core/manifest.js";
import { buildDerivedNoteId, buildDerivedNotePath } from "../core/naming.js";
import { getVaultPaths, resolveVaultPath } from "../core/paths.js";
import { appendRunLog } from "../core/runs.js";
import { requireHeadings, validateRuntimeConfig } from "../core/validate.js";

function resolveDerivedDir(config: KnowledgeBasePluginConfig, kind: DerivedNoteKind): string {
  const paths = getVaultPaths(config);

  switch (kind) {
    case "concept":
      return paths.concepts;
    case "entity":
      return paths.entities;
    case "synthesis":
      return paths.syntheses;
  }
}

async function sourceRefExists(
  config: KnowledgeBasePluginConfig,
  _manifest: ManifestFile,
  sourceRef: string,
): Promise<boolean> {
  try {
    await fs.stat(await resolveVaultPath(config, `${getVaultPaths(config).sources}/${sourceRef}.md`));
    return true;
  } catch {
    return false;
  }
}

export async function kbUpsertDerivedNote(
  config: KnowledgeBasePluginConfig,
  input: { markdown: string },
) {
  await validateRuntimeConfig(config);

  if (!input.markdown?.trim()) {
    throw new Error("validation_error: markdown is required");
  }

  const { frontmatter, body } = parseDerivedNoteMarkdown(input.markdown);
  requireHeadings(body, [...DERIVED_NOTE_REQUIRED_HEADINGS[frontmatter.type]]);

  const expectedNoteId = buildDerivedNoteId(frontmatter.type, frontmatter.title);
  if (frontmatter.id !== expectedNoteId) {
    throw new Error(`validation_error: derived note id must match canonical title slug "${expectedNoteId}"`);
  }

  const manifest = await loadManifest(config);
  for (const sourceRef of frontmatter.source_refs) {
    if (!(await sourceRefExists(config, manifest, sourceRef))) {
      throw new Error(`validation_error: source_ref not found: ${sourceRef}`);
    }
  }

  const notePath = buildDerivedNotePath(resolveDerivedDir(config, frontmatter.type), frontmatter.id);
  await atomicWriteText(
    await resolveVaultPath(config, notePath),
    input.markdown.endsWith("\n") ? input.markdown : `${input.markdown}\n`,
  );

  await appendRunLog(config, {
    ts: new Date().toISOString(),
    action: "kb_upsert_derived_note",
    target: notePath,
    status: "ok",
  });

  return {
    ok: true,
    note_id: frontmatter.id,
    note_path: notePath,
    kind: frontmatter.type,
  };
}
