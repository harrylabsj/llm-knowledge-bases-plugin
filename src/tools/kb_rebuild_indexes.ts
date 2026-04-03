import type { KnowledgeBasePluginConfig } from "../types.js";
import { rebuildIndexes } from "../core/indexes.js";
import { appendRunLog } from "../core/runs.js";
import { validateRuntimeConfig } from "../core/validate.js";

export async function kbRebuildIndexes(config: KnowledgeBasePluginConfig) {
  await validateRuntimeConfig(config);
  const written = await rebuildIndexes(config);

  await appendRunLog(config, {
    ts: new Date().toISOString(),
    action: "kb_rebuild_indexes",
    target: written.join(", "),
    status: "ok",
  });

  return {
    ok: true,
    written,
  };
}
