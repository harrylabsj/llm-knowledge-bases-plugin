import path from "node:path";

import type { KnowledgeBasePluginConfig } from "../types.js";
import { ensureVaultRootReadable } from "./paths.js";

export async function validateRuntimeConfig(config: KnowledgeBasePluginConfig): Promise<void> {
  await ensureVaultRootReadable(config);
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function requireHeadings(markdown: string, headings: string[]): void {
  for (const heading of headings) {
    const pattern = new RegExp(`^#{1,6}\\s+${escapeRegExp(heading)}\\s*$`, "m");
    if (!pattern.test(markdown)) {
      throw new Error(`validation_error: missing heading "${heading}"`);
    }
  }
}

export function requireRawPath(config: KnowledgeBasePluginConfig, rawPath: string): void {
  if (!rawPath.startsWith(`${config.rawDir}/`)) {
    throw new Error(`invalid_path: raw_path must stay under ${config.rawDir}/`);
  }

  const extension = path.posix.extname(rawPath).toLowerCase();
  if (extension !== ".md" && extension !== ".txt") {
    throw new Error(`invalid_path: raw_path must reference a .md or .txt file`);
  }
}
