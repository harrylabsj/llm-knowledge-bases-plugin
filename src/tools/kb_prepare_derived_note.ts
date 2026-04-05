import type { DerivedNoteKind, KnowledgeBasePluginConfig } from "../types.js";
import { DERIVED_NOTE_REQUIRED_HEADINGS } from "../core/frontmatter.js";
import { buildDerivedNoteId, buildDerivedNotePath } from "../core/naming.js";
import { getVaultPaths } from "../core/paths.js";
import { validateRuntimeConfig } from "../core/validate.js";

function requireDerivedKind(value: string): DerivedNoteKind {
  if (value !== "concept" && value !== "entity" && value !== "synthesis") {
    throw new Error("validation_error: kind must be one of concept, entity, synthesis");
  }
  return value;
}

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

export async function kbPrepareDerivedNote(
  config: KnowledgeBasePluginConfig,
  input: { kind: string; title: string },
) {
  await validateRuntimeConfig(config);

  const kind = requireDerivedKind(input.kind);
  const title = input.title?.trim();

  if (!title) {
    throw new Error("validation_error: title is required");
  }

  const noteId = buildDerivedNoteId(kind, title);
  const notePath = buildDerivedNotePath(resolveDerivedDir(config, kind), noteId);

  return {
    note_id: noteId,
    note_path: notePath,
    kind,
    template: {
      required_headings: [...DERIVED_NOTE_REQUIRED_HEADINGS[kind]],
    },
  };
}
