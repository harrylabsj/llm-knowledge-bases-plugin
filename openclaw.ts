import {
  KnowledgeBaseConfigJsonSchema,
  OPENCLAW_PLUGIN_ID,
  resolveKnowledgeBaseConfigFromOpenClawHostConfig,
} from "./src/config.js";
import { registerKnowledgeBaseCli, type CliCommand } from "./src/cli.js";

type OpenClawPluginApi = {
  registerCli?: (
    factory: (params: { program: CliCommand; config: unknown }) => void,
    options?: { commands?: string[] },
  ) => void;
};

const plugin = {
  id: OPENCLAW_PLUGIN_ID,
  name: "LLM Knowledge Bases",
  description:
    "Deterministic Markdown knowledge-base runtime for Obsidian vaults, with standalone CLI, MCP server, and OpenClaw compatibility.",
  configSchema: KnowledgeBaseConfigJsonSchema,
  register(api: OpenClawPluginApi) {
    if (!api?.registerCli) {
      throw new Error(
        `[${OPENCLAW_PLUGIN_ID}] registerCli is required because the OpenClaw host integration is CLI-backed`,
      );
    }

    api.registerCli(
      ({ program, config }) => {
        const pluginConfig = resolveKnowledgeBaseConfigFromOpenClawHostConfig(config);
        registerKnowledgeBaseCli({ program, pluginConfig });
      },
      { commands: ["openclaw-llm-kb"] },
    );
  },
};

export default plugin;
