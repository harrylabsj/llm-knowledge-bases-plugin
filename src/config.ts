import path from "node:path";

import type { KnowledgeBasePluginConfig } from "./types.js";

export const PLUGIN_ID = "llm-knowledge-bases-plugin";

const DEFAULTS = {
  rawDir: "raw",
  wikiDir: "wiki",
  stateDir: ".llm-kb",
} as const;

export const KnowledgeBasePluginConfigJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["vaultRoot"],
  properties: {
    vaultRoot: { type: "string" },
    rawDir: { type: "string", default: DEFAULTS.rawDir },
    wikiDir: { type: "string", default: DEFAULTS.wikiDir },
    stateDir: { type: "string", default: DEFAULTS.stateDir },
  },
} as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function assertRelativeDir(input: string, field: string): string {
  if (!input || path.isAbsolute(input) || input.includes("\0")) {
    throw new Error(`[${PLUGIN_ID}] ${field} must be a non-empty relative path`);
  }
  return input.replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/\/+$/, "");
}

export function normalizeKnowledgeBaseConfig(input: unknown): KnowledgeBasePluginConfig {
  if (!isRecord(input)) {
    throw new Error(`[${PLUGIN_ID}] plugin config must be an object`);
  }

  const vaultRoot = input.vaultRoot;
  if (typeof vaultRoot !== "string" || !path.isAbsolute(vaultRoot)) {
    throw new Error(`[${PLUGIN_ID}] vaultRoot must be an absolute path`);
  }

  return {
    vaultRoot: path.resolve(vaultRoot),
    rawDir: assertRelativeDir(
      typeof input.rawDir === "string" ? input.rawDir : DEFAULTS.rawDir,
      "rawDir",
    ),
    wikiDir: assertRelativeDir(
      typeof input.wikiDir === "string" ? input.wikiDir : DEFAULTS.wikiDir,
      "wikiDir",
    ),
    stateDir: assertRelativeDir(
      typeof input.stateDir === "string" ? input.stateDir : DEFAULTS.stateDir,
      "stateDir",
    ),
  };
}

export function resolveKnowledgeBaseConfigFromHostConfig(hostConfig: unknown): KnowledgeBasePluginConfig {
  if (!isRecord(hostConfig)) {
    throw new Error(`[${PLUGIN_ID}] host config is not an object`);
  }

  const pluginEntry =
    (isRecord(hostConfig.plugins) &&
      isRecord(hostConfig.plugins.entries) &&
      isRecord(hostConfig.plugins.entries[PLUGIN_ID]) &&
      isRecord(hostConfig.plugins.entries[PLUGIN_ID].config) &&
      hostConfig.plugins.entries[PLUGIN_ID].config) ||
    (isRecord(hostConfig.plugins) &&
      isRecord(hostConfig.plugins[PLUGIN_ID]) &&
      hostConfig.plugins[PLUGIN_ID]) ||
    (isRecord(hostConfig[PLUGIN_ID]) && hostConfig[PLUGIN_ID]);

  return normalizeKnowledgeBaseConfig(pluginEntry);
}
