#!/usr/bin/env node

import process from "node:process";

import {
  renderAllClientConfigs,
  renderTargetConfig,
  type ClientConfigOptions,
} from "./client-configs.js";

type Target = "all" | "claude" | "codex" | "cursor" | "gemini";

type ParsedArgs = Omit<ClientConfigOptions, "vaultRoot"> & {
  vaultRoot?: string;
  target: Target;
  help: boolean;
};

const USAGE = `Usage: llm-knowledge-bases-configs --vault-root <absolute-path> [options]

Print install snippets for MCP-capable agents.

Options:
  --target <all|claude|codex|cursor|gemini>   Default: all
  --server-name <name>                        Default: llm-knowledge-bases
  --mode <npx|local>                          Default: npx
  --package-dir <absolute-path>               Required when --mode local
  --plugin-dir <absolute-path>                Deprecated alias for --package-dir
  --npm-spec <spec>                           Default: @harrylabs/llm-knowledge-bases@latest
  --raw-dir <dir>
  --wiki-dir <dir>
  --state-dir <dir>
  -h, --help
`;

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = {
    help: false,
    target: "all",
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const value = argv[index + 1];

    switch (arg) {
      case "-h":
      case "--help":
        parsed.help = true;
        break;
      case "--vault-root":
        parsed.vaultRoot = value;
        index += 1;
        break;
      case "--target":
        if (value !== "all" && value !== "claude" && value !== "codex" && value !== "cursor" && value !== "gemini") {
          throw new Error(`invalid target: ${value}`);
        }
        parsed.target = value;
        index += 1;
        break;
      case "--server-name":
        parsed.serverName = value;
        index += 1;
        break;
      case "--mode":
        if (value !== "npx" && value !== "local") {
          throw new Error(`invalid mode: ${value}`);
        }
        parsed.mode = value;
        index += 1;
        break;
      case "--package-dir":
      case "--plugin-dir":
        parsed.packageDir = value;
        parsed.pluginDir = value;
        index += 1;
        break;
      case "--npm-spec":
        parsed.npmSpec = value;
        index += 1;
        break;
      case "--raw-dir":
        parsed.rawDir = value;
        index += 1;
        break;
      case "--wiki-dir":
        parsed.wikiDir = value;
        index += 1;
        break;
      case "--state-dir":
        parsed.stateDir = value;
        index += 1;
        break;
      default:
        throw new Error(`unknown option: ${arg}`);
    }
  }

  return parsed;
}

function writeUsage(): void {
  process.stderr.write(USAGE);
}

function main(): void {
  let parsed: ParsedArgs;

  try {
    parsed = parseArgs(process.argv.slice(2));
  } catch (error) {
    writeUsage();
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exit(1);
    return;
  }

  if (parsed.help) {
    process.stdout.write(USAGE);
    return;
  }

  if (!parsed.vaultRoot) {
    writeUsage();
    process.stderr.write("vault-root is required\n");
    process.exit(1);
    return;
  }

  const options: ClientConfigOptions = {
    vaultRoot: parsed.vaultRoot,
    serverName: parsed.serverName,
    mode: parsed.mode,
    packageDir: parsed.packageDir,
    pluginDir: parsed.pluginDir,
    npmSpec: parsed.npmSpec,
    rawDir: parsed.rawDir,
    wikiDir: parsed.wikiDir,
    stateDir: parsed.stateDir,
  };

  const output =
    parsed.target === "all"
      ? renderAllClientConfigs(options)
      : renderTargetConfig(parsed.target, options);

  process.stdout.write(`${output}\n`);
}

main();
