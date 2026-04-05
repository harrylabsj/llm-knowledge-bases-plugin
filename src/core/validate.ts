import path from "node:path";

import type { KnowledgeBasePluginConfig } from "../types.js";
import { ensureVaultRootReadable } from "./paths.js";
import { getSupportedRawFileInfo, listSupportedRawExtensions } from "./raw-files.js";

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

function requireRawPathUnderRoot(config: KnowledgeBasePluginConfig, rawPath: string): void {
  if (!rawPath.startsWith(`${config.rawDir}/`)) {
    throw new Error(`invalid_path: raw_path must stay under ${config.rawDir}/`);
  }
}

export function requireSupportedRawPath(config: KnowledgeBasePluginConfig, rawPath: string) {
  requireRawPathUnderRoot(config, rawPath);

  const rawInfo = getSupportedRawFileInfo(rawPath);
  if (!rawInfo) {
    throw new Error(
      `invalid_path: raw_path must reference a supported file (${listSupportedRawExtensions().join(", ")})`,
    );
  }

  return rawInfo;
}

export function requireTextReadableRawPath(config: KnowledgeBasePluginConfig, rawPath: string) {
  const rawInfo = requireSupportedRawPath(config, rawPath);
  if (!rawInfo.textReadable) {
    throw new Error(
      `invalid_path: raw_path must reference a text-readable raw file; ${path.posix.extname(rawPath).toLowerCase()} requires kb_prepare_representation, kb_upsert_representation, and kb_read_representations first`,
    );
  }

  return rawInfo;
}
