import type { KnowledgeBasePluginConfig } from "../types.js";
import { searchKnowledgeBase } from "../core/search.js";
import { validateRuntimeConfig } from "../core/validate.js";

export async function kbSearch(
  config: KnowledgeBasePluginConfig,
  input: {
    query: string;
    limit?: number;
    types?: Array<"source" | "output">;
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

  if (input.types && input.types.some((type) => type !== "source" && type !== "output")) {
    throw new Error("validation_error: types must only contain source and output");
  }

  return {
    items: await searchKnowledgeBase(config, {
      query,
      limit,
      types: input.types,
    }),
  };
}
