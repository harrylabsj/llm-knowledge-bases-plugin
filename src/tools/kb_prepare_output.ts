import type { KnowledgeBasePluginConfig } from "../types.js";
import { OUTPUT_REQUIRED_HEADINGS } from "../core/frontmatter.js";
import { buildOutputId, buildOutputPath, currentOutputDateStamp } from "../core/naming.js";
import { getVaultPaths } from "../core/paths.js";
import { validateRuntimeConfig } from "../core/validate.js";

export async function kbPrepareOutput(
  config: KnowledgeBasePluginConfig,
  input: { title: string; query: string },
) {
  await validateRuntimeConfig(config);

  const title = input.title?.trim();
  const query = input.query?.trim();

  if (!title) {
    throw new Error("validation_error: title is required");
  }
  if (!query) {
    throw new Error("validation_error: query is required");
  }

  const dateStamp = currentOutputDateStamp();
  const outputsDir = getVaultPaths(config).outputs;

  return {
    output_id: buildOutputId(title, dateStamp),
    output_path: buildOutputPath(outputsDir, title, dateStamp),
    template: {
      required_headings: [...OUTPUT_REQUIRED_HEADINGS],
    },
  };
}
