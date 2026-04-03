import {
  KnowledgeBasePluginConfigJsonSchema,
  PLUGIN_ID,
  resolveKnowledgeBaseConfigFromHostConfig,
} from "./src/config.js";
import { registerKnowledgeBaseCli, type CliCommand } from "./src/cli.js";

type OpenClawPluginApi = {
  registerCli?: (
    factory: (params: { program: CliCommand; config: unknown }) => void,
    options?: { commands?: string[] },
  ) => void;
};

const plugin = {
  id: PLUGIN_ID,
  name: "LLM Knowledge Bases",
  description:
    "Inspired by a public workflow shared by Andrej Karpathy (@karpathy). From raw research to a living Markdown knowledge base that compounds with every question.",
  configSchema: KnowledgeBasePluginConfigJsonSchema,
  register(api: OpenClawPluginApi) {
    if (!api?.registerCli) {
      throw new Error(
        `[${PLUGIN_ID}] registerCli is required because 1.0 currently ships as a CLI-backed surface`,
      );
    }

    api.registerCli(
      ({ program, config }) => {
        const pluginConfig = resolveKnowledgeBaseConfigFromHostConfig(config);
        registerKnowledgeBaseCli({ program, pluginConfig });
      },
      { commands: ["openclaw-llm-kb"] },
    );
  },
};

export default plugin;
