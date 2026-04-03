import fs from "node:fs/promises";
import path from "node:path";

import type { KnowledgeBasePluginConfig } from "../types.js";

export function toVaultRelativePath(input: string): string {
  const normalized = path.posix.normalize(input.replace(/\\/g, "/"));
  if (normalized.startsWith("/") || normalized === ".." || normalized.startsWith("../")) {
    throw new Error(`invalid_path: ${input}`);
  }
  return normalized;
}

export function getVaultPaths(config: KnowledgeBasePluginConfig) {
  const raw = config.rawDir;
  const sources = `${config.wikiDir}/sources`;
  const outputs = `${config.wikiDir}/outputs`;
  const indexes = `${config.wikiDir}/_indexes`;
  const state = config.stateDir;

  return {
    raw,
    sources,
    outputs,
    indexes,
    state,
    manifest: `${state}/manifest.json`,
    runs: `${state}/runs.jsonl`,
  };
}

export async function ensureVaultRootReadable(config: KnowledgeBasePluginConfig): Promise<void> {
  const stat = await fs.stat(config.vaultRoot);
  if (!stat.isDirectory()) {
    throw new Error(`vault_not_configured: vaultRoot is not a directory: ${config.vaultRoot}`);
  }
}

export async function resolveVaultPath(
  config: KnowledgeBasePluginConfig,
  relativePath: string,
): Promise<string> {
  const safeRelative = toVaultRelativePath(relativePath);
  const absolute = path.resolve(config.vaultRoot, safeRelative);
  const root = path.resolve(config.vaultRoot);

  if (!absolute.startsWith(`${root}${path.sep}`) && absolute !== root) {
    throw new Error(`invalid_path: ${relativePath}`);
  }

  try {
    const real = await fs.realpath(absolute);
    if (!real.startsWith(`${root}${path.sep}`) && real !== root) {
      throw new Error(`invalid_path: symlink escape detected for ${relativePath}`);
    }
  } catch {
    // Path may not exist yet. The prefix check above is the best we can do before writes.
  }

  return absolute;
}
