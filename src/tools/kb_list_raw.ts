import type { KnowledgeBasePluginConfig } from "../types.js";
import { listRawFiles } from "../core/scan.js";
import { validateRuntimeConfig } from "../core/validate.js";

export async function kbListRaw(
  config: KnowledgeBasePluginConfig,
  input?: { changed_only?: boolean; limit?: number },
) {
  await validateRuntimeConfig(config);
  const items = await listRawFiles(config, {
    changedOnly: input?.changed_only ?? false,
    limit: input?.limit ?? 50,
  });
  return { items };
}
