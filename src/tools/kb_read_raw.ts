import fs from "node:fs/promises";
import path from "node:path";

import type { KnowledgeBasePluginConfig } from "../types.js";
import { hashFile } from "../core/hash.js";
import { resolveVaultPath } from "../core/paths.js";
import { requireTextReadableRawPath, validateRuntimeConfig } from "../core/validate.js";

function guessTitle(rawPath: string): string {
  return path
    .parse(rawPath)
    .name.replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export async function kbReadRaw(
  config: KnowledgeBasePluginConfig,
  input: { raw_path: string },
): Promise<{
  raw_path: string;
  title_guess: string;
  content: string;
  raw_hash: string;
  truncated?: boolean;
}> {
  await validateRuntimeConfig(config);
  requireTextReadableRawPath(config, input.raw_path);

  const absolute = await resolveVaultPath(config, input.raw_path);
  const content = await fs.readFile(absolute, "utf8");
  return {
    raw_path: input.raw_path,
    title_guess: guessTitle(input.raw_path),
    content,
    raw_hash: await hashFile(absolute),
  };
}
