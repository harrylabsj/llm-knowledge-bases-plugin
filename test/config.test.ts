import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  normalizeKnowledgeBaseConfig,
  resolveKnowledgeBaseConfigFromHostConfig,
} from "../src/config.js";

describe("config", () => {
  it("normalizes defaults", () => {
    const config = normalizeKnowledgeBaseConfig({ vaultRoot: path.resolve("/tmp/vault") });
    expect(config.rawDir).toBe("raw");
    expect(config.wikiDir).toBe("wiki");
    expect(config.stateDir).toBe(".llm-kb");
  });

  it("resolves config from plugins.entries", () => {
    const config = resolveKnowledgeBaseConfigFromHostConfig({
      plugins: {
        entries: {
          "llm-knowledge-bases-plugin": {
            config: {
              vaultRoot: path.resolve("/tmp/vault"),
            },
          },
        },
      },
    });

    expect(config.vaultRoot).toContain("/tmp/vault");
  });
});
