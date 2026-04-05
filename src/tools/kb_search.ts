import type { KnowledgeBaseNoteType, KnowledgeBasePluginConfig } from "../types.js";
import { searchKnowledgeBase } from "../core/search.js";
import { validateRuntimeConfig } from "../core/validate.js";

const ALLOWED_SEARCH_TYPES: readonly KnowledgeBaseNoteType[] = [
  "source",
  "output",
  "concept",
  "entity",
  "synthesis",
  "index",
  "log",
];

export async function kbSearch(
  config: KnowledgeBasePluginConfig,
  input: {
    query: string;
    limit?: number;
    types?: KnowledgeBaseNoteType[];
  },
) {
  await validateRuntimeConfig(config);

  const query = input.query?.trim();
  if (!query) {
    throw new Error("validation_error: query is required");
  }

  const limit = input.limit ?? 8;
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error("validation_error: limit must be a positive integer");
  }

  if (input.types && input.types.some((type) => !ALLOWED_SEARCH_TYPES.includes(type))) {
    throw new Error(
      "validation_error: types must only contain source, output, concept, entity, synthesis, index, or log",
    );
  }

  return {
    items: await searchKnowledgeBase(config, {
      query,
      limit,
      types: input.types,
    }),
  };
}
