import fs from "node:fs/promises";
import path from "node:path";

import type { KnowledgeBasePluginConfig, RunLogEntry } from "../types.js";
import { getVaultPaths, resolveVaultPath } from "./paths.js";

export async function appendRunLog(
  config: KnowledgeBasePluginConfig,
  entry: RunLogEntry,
): Promise<void> {
  const runsPath = await resolveVaultPath(config, getVaultPaths(config).runs);
  await fs.mkdir(path.dirname(runsPath), { recursive: true });
  await fs.appendFile(runsPath, `${JSON.stringify(entry)}\n`, "utf8");
}
