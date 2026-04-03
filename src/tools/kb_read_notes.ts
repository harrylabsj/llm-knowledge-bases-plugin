import type { KnowledgeBasePluginConfig } from "../types.js";
import { readNote } from "../core/notes.js";
import { validateRuntimeConfig } from "../core/validate.js";

export async function kbReadNotes(
  config: KnowledgeBasePluginConfig,
  input: { paths: string[] },
) {
  await validateRuntimeConfig(config);

  if (!Array.isArray(input.paths) || input.paths.length === 0) {
    throw new Error("validation_error: paths is required");
  }
  if (input.paths.length > 10) {
    throw new Error("validation_error: paths may contain at most 10 files");
  }

  const items = [];
  for (const notePath of input.paths) {
    items.push(await readNote(config, notePath));
  }

  return { items };
}
