import { describe, expect, it } from "vitest";

import {
  buildMcpStdioLaunchSpec,
  buildStdioLaunchSpec,
  renderClaudeAddCommand,
  renderCodexAddCommand,
  renderCursorConfig,
  renderGeminiConfig,
} from "../src/client-configs.js";

describe("client config snippets", () => {
  it("builds npx launch specs by default", () => {
    expect(
      buildStdioLaunchSpec({
        vaultRoot: "/vault",
      }),
    ).toEqual({
      command: "npx",
      args: [
        "-y",
        "--package",
        "@harrylabs/llm-knowledge-bases@latest",
        "llm-knowledge-bases-mcp",
        "--vault-root",
        "/vault",
      ],
      env: {},
    });
  });

  it("builds local launch specs when pluginDir is provided", () => {
    expect(
      buildStdioLaunchSpec({
        vaultRoot: "/vault",
        mode: "local",
        pluginDir: "/plugin",
        rawDir: "raw",
      }),
    ).toEqual({
      command: "node",
      args: ["/plugin/dist/src/mcp-stdio.js", "--vault-root", "/vault", "--raw-dir", "raw"],
      env: {},
    });
  });

  it("prefers packageDir for local package installs", () => {
    expect(
      buildMcpStdioLaunchSpec({
        vaultRoot: "/vault",
        mode: "local",
        packageDir: "/package",
      }),
    ).toEqual({
      command: "node",
      args: ["/package/dist/src/mcp-stdio.js", "--vault-root", "/vault"],
      env: {},
    });
  });

  it("renders agent-specific configs from the same stdio contract", () => {
    expect(
      renderClaudeAddCommand({
        vaultRoot: "/vault path",
      }),
    ).toContain("'claude' 'mcp' 'add' 'llm-knowledge-bases'");

    expect(
      renderCodexAddCommand({
        vaultRoot: "/vault",
      }),
    ).toContain("'codex' 'mcp' 'add' 'llm-knowledge-bases'");

    expect(
      renderCursorConfig({
        vaultRoot: "/vault",
      }),
    ).toMatchObject({
      mcpServers: {
        "llm-knowledge-bases": {
          command: "npx",
        },
      },
    });

    expect(
      renderGeminiConfig({
        vaultRoot: "/vault",
      }),
    ).toMatchObject({
      mcpServers: {
        "llm-knowledge-bases": {
          command: "npx",
          trust: false,
        },
      },
    });
  });
});
