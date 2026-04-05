export type TransportMode = "npx" | "local";
export type TargetClient = "claude" | "codex" | "cursor" | "gemini";

export type ClientConfigOptions = {
  vaultRoot: string;
  serverName?: string;
  mode?: TransportMode;
  packageDir?: string;
  pluginDir?: string;
  npmSpec?: string;
  rawDir?: string;
  wikiDir?: string;
  stateDir?: string;
};

export type StdioLaunchSpec = {
  command: string;
  args: string[];
  env: Record<string, string>;
};

export const DEFAULT_SERVER_NAME = "llm-knowledge-bases";
export const DEFAULT_NPM_SPEC = "@harrylabs/llm-knowledge-bases@latest";
export const DEFAULT_STDIO_BIN = "llm-knowledge-bases-mcp";

function shellQuote(input: string): string {
  if (input.length === 0) {
    return "''";
  }
  return `'${input.replace(/'/g, `'\"'\"'`)}'`;
}

function pushOptionalPathArgs(args: string[], options: ClientConfigOptions): void {
  if (options.rawDir) {
    args.push("--raw-dir", options.rawDir);
  }
  if (options.wikiDir) {
    args.push("--wiki-dir", options.wikiDir);
  }
  if (options.stateDir) {
    args.push("--state-dir", options.stateDir);
  }
}

export function buildMcpStdioLaunchSpec(options: ClientConfigOptions): StdioLaunchSpec {
  const mode = options.mode ?? "npx";
  const args: string[] = [];

  if (mode === "local") {
    const packageDir = options.packageDir ?? options.pluginDir;
    if (!packageDir) {
      throw new Error("packageDir is required when mode=local");
    }
    args.push(`${packageDir}/dist/src/mcp-stdio.js`);
    args.push("--vault-root", options.vaultRoot);
    pushOptionalPathArgs(args, options);
    return {
      command: "node",
      args,
      env: {},
    };
  }

  args.push("-y", "--package", options.npmSpec ?? DEFAULT_NPM_SPEC, DEFAULT_STDIO_BIN);
  args.push("--vault-root", options.vaultRoot);
  pushOptionalPathArgs(args, options);
  return {
    command: "npx",
    args,
    env: {},
  };
}

export const buildStdioLaunchSpec = buildMcpStdioLaunchSpec;

export function renderShellCommand(argv: string[]): string {
  return argv.map((item) => shellQuote(item)).join(" ");
}

export function renderClaudeAddCommand(options: ClientConfigOptions): string {
  const serverName = options.serverName ?? DEFAULT_SERVER_NAME;
  const launch = buildMcpStdioLaunchSpec(options);
  return renderShellCommand(["claude", "mcp", "add", serverName, "--", launch.command, ...launch.args]);
}

export function renderCodexAddCommand(options: ClientConfigOptions): string {
  const serverName = options.serverName ?? DEFAULT_SERVER_NAME;
  const launch = buildMcpStdioLaunchSpec(options);
  return renderShellCommand(["codex", "mcp", "add", serverName, "--", launch.command, ...launch.args]);
}

export function renderCursorConfig(options: ClientConfigOptions): Record<string, unknown> {
  const serverName = options.serverName ?? DEFAULT_SERVER_NAME;
  const launch = buildMcpStdioLaunchSpec(options);
  return {
    mcpServers: {
      [serverName]: {
        command: launch.command,
        args: launch.args,
        env: launch.env,
      },
    },
  };
}

export function renderGeminiConfig(options: ClientConfigOptions): Record<string, unknown> {
  const serverName = options.serverName ?? DEFAULT_SERVER_NAME;
  const launch = buildMcpStdioLaunchSpec(options);
  return {
    mcpServers: {
      [serverName]: {
        command: launch.command,
        args: launch.args,
        env: launch.env,
        trust: false,
      },
    },
  };
}

export function renderTargetConfig(target: TargetClient, options: ClientConfigOptions): string {
  if (target === "claude") {
    return renderClaudeAddCommand(options);
  }
  if (target === "codex") {
    return renderCodexAddCommand(options);
  }
  if (target === "cursor") {
    return JSON.stringify(renderCursorConfig(options), null, 2);
  }
  return JSON.stringify(renderGeminiConfig(options), null, 2);
}

export function renderAllClientConfigs(options: ClientConfigOptions): string {
  const sections = [
    ["Claude Code", renderClaudeAddCommand(options)],
    ["Codex", renderCodexAddCommand(options)],
    ["Cursor (.cursor/mcp.json)", JSON.stringify(renderCursorConfig(options), null, 2)],
    ["Gemini CLI (~/.gemini/settings.json or project .gemini/settings.json)", JSON.stringify(renderGeminiConfig(options), null, 2)],
  ] as const;

  return sections
    .map(([title, body]) => `## ${title}\n${body}`)
    .join("\n\n");
}
