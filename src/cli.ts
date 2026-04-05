import process from "node:process";

import { normalizeKnowledgeBaseConfig } from "./config.js";
import type {
  KnowledgeBaseConfig,
  KnowledgeBaseNoteType,
  KnowledgeBasePluginConfig,
} from "./types.js";
import { kbListRaw } from "./tools/kb_list_raw.js";
import { kbPrepareDerivedNote } from "./tools/kb_prepare_derived_note.js";
import { kbPrepareOutput } from "./tools/kb_prepare_output.js";
import { kbPrepareSource } from "./tools/kb_prepare_source.js";
import { kbLint } from "./tools/kb_lint.js";
import { kbReadRaw } from "./tools/kb_read_raw.js";
import { kbReadNotes } from "./tools/kb_read_notes.js";
import { kbMapGaps } from "./tools/kb_map_gaps.js";
import { kbPromoteGap } from "./tools/kb_promote_gap.js";
import { kbRebuildIndexes } from "./tools/kb_rebuild_indexes.js";
import { kbSearch } from "./tools/kb_search.js";
import { kbStatus } from "./tools/kb_status.js";
import { kbUpsertDerivedNote } from "./tools/kb_upsert_derived_note.js";
import { kbUpsertOutput } from "./tools/kb_upsert_output.js";
import { kbUpsertSourceNote } from "./tools/kb_upsert_source_note.js";

export type CliCommand = {
  command(name: string): CliCommand;
  description(text: string): CliCommand;
  option(flags: string, description: string): CliCommand;
  action(fn: (...args: any[]) => void | Promise<void>): CliCommand;
};

type CommandOptionValue = string | boolean;

type CliOptionSpec = {
  flags: string;
  description: string;
  key: string;
  type: "string" | "boolean";
};

export type KnowledgeBaseCliCommandName =
  | "kb_status"
  | "kb_list_raw"
  | "kb_read_raw"
  | "kb_prepare_source"
  | "kb_upsert_source_note"
  | "kb_prepare_output"
  | "kb_prepare_derived_note"
  | "kb_upsert_output"
  | "kb_upsert_derived_note"
  | "kb_rebuild_indexes"
  | "kb_search"
  | "kb_read_notes"
  | "kb_map_gaps"
  | "kb_promote_gap"
  | "kb_lint";

type KnowledgeBaseCliCommandSpec = {
  toolName: KnowledgeBaseCliCommandName;
  openclawName: string;
  standaloneAliases: string[];
  description: string;
  options: CliOptionSpec[];
  run: (
    config: KnowledgeBaseConfig,
    options: Record<string, CommandOptionValue>,
  ) => Promise<unknown>;
};

export type ParsedStandaloneCliArgs = {
  help: boolean;
  commandName?: KnowledgeBaseCliCommandName;
  config: {
    vaultRoot?: string;
    rawDir?: string;
    wikiDir?: string;
    stateDir?: string;
  };
  commandOptions: Record<string, CommandOptionValue>;
};

type WriteTarget = Pick<NodeJS.WriteStream, "write">;

export type StandaloneCliIo = {
  stdout?: Pick<NodeJS.WriteStream, "write">;
  stderr?: Pick<NodeJS.WriteStream, "write">;
  env?: NodeJS.ProcessEnv;
};

export const KB_TOOL_NAMES = [
  "kb_status",
  "kb_list_raw",
  "kb_read_raw",
  "kb_prepare_source",
  "kb_upsert_source_note",
  "kb_prepare_output",
  "kb_prepare_derived_note",
  "kb_upsert_output",
  "kb_upsert_derived_note",
  "kb_rebuild_indexes",
  "kb_search",
  "kb_read_notes",
  "kb_map_gaps",
  "kb_promote_gap",
  "kb_lint",
] as const;

function printJson(value: unknown, target: WriteTarget = process.stdout): void {
  target.write(`${JSON.stringify(value, null, 2)}\n`);
}

function fail(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

function requireStringOption(
  options: Record<string, CommandOptionValue>,
  key: string,
  errorMessage: string,
): string {
  const value = options[key];
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(errorMessage);
  }
  return value;
}

function optionalNumberOption(
  options: Record<string, CommandOptionValue>,
  key: string,
): number | undefined {
  const value = options[key];
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string" || value.length === 0 || Number.isNaN(Number(value))) {
    throw new Error(`validation_error: --${key.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`)} must be a number`);
  }
  return Number(value);
}

const COMMAND_SPECS: KnowledgeBaseCliCommandSpec[] = [
  {
    toolName: "kb_status",
    openclawName: "status",
    standaloneAliases: ["status"],
    description: "Show vault status and change counts",
    options: [],
    run: async (config) => kbStatus(config),
  },
  {
    toolName: "kb_list_raw",
    openclawName: "list-raw",
    standaloneAliases: ["list-raw"],
    description: "List raw markdown/text files in the vault",
    options: [
      {
        flags: "--changed-only",
        description: "Show only files that are new, changed, or missing source notes",
        key: "changedOnly",
        type: "boolean",
      },
      {
        flags: "--limit <n>",
        description: "Maximum number of items to return",
        key: "limit",
        type: "string",
      },
    ],
    run: async (config, options) =>
      kbListRaw(config, {
        changed_only: options.changedOnly === true,
        limit: optionalNumberOption(options, "limit") ?? 50,
      }),
  },
  {
    toolName: "kb_read_raw",
    openclawName: "read-raw",
    standaloneAliases: ["read-raw"],
    description: "Read a raw markdown/text file from the vault",
    options: [
      {
        flags: "--raw-path <path>",
        description: "Relative raw path, for example raw/inbox/example-note.md",
        key: "rawPath",
        type: "string",
      },
    ],
    run: async (config, options) =>
      kbReadRaw(config, {
        raw_path: requireStringOption(options, "rawPath", "invalid_path: --raw-path is required"),
      }),
  },
  {
    toolName: "kb_prepare_source",
    openclawName: "prepare-source",
    standaloneAliases: ["prepare-source"],
    description: "Resolve canonical doc_id and source note path for a raw file",
    options: [
      {
        flags: "--raw-path <path>",
        description: "Relative raw path, for example raw/inbox/example-note.md",
        key: "rawPath",
        type: "string",
      },
    ],
    run: async (config, options) =>
      kbPrepareSource(config, {
        raw_path: requireStringOption(options, "rawPath", "invalid_path: --raw-path is required"),
      }),
  },
  {
    toolName: "kb_upsert_source_note",
    openclawName: "upsert-source-note",
    standaloneAliases: ["upsert-source-note"],
    description: "Validate and write a source note, then update the manifest",
    options: [
      {
        flags: "--raw-path <path>",
        description: "Relative raw path, for example raw/inbox/example-note.md",
        key: "rawPath",
        type: "string",
      },
      {
        flags: "--markdown <text>",
        description: "Full markdown content for the source note",
        key: "markdown",
        type: "string",
      },
    ],
    run: async (config, options) =>
      kbUpsertSourceNote(config, {
        raw_path: requireStringOption(options, "rawPath", "invalid_path: --raw-path is required"),
        markdown: requireStringOption(options, "markdown", "validation_error: --markdown is required"),
      }),
  },
  {
    toolName: "kb_prepare_output",
    openclawName: "prepare-output",
    standaloneAliases: ["prepare-output"],
    description: "Resolve canonical output id and path for a new archived answer",
    options: [
      {
        flags: "--title <text>",
        description: "Human readable output title",
        key: "title",
        type: "string",
      },
      {
        flags: "--query <text>",
        description: "The user question or prompt being archived",
        key: "query",
        type: "string",
      },
    ],
    run: async (config, options) =>
      kbPrepareOutput(config, {
        title: requireStringOption(options, "title", "validation_error: --title is required"),
        query: requireStringOption(options, "query", "validation_error: --query is required"),
      }),
  },
  {
    toolName: "kb_prepare_derived_note",
    openclawName: "prepare-derived-note",
    standaloneAliases: ["prepare-derived-note"],
    description: "Resolve canonical id and path for a concept, entity, or synthesis note",
    options: [
      {
        flags: "--kind <kind>",
        description: "One of: concept, entity, synthesis",
        key: "kind",
        type: "string",
      },
      {
        flags: "--title <text>",
        description: "Human readable note title",
        key: "title",
        type: "string",
      },
    ],
    run: async (config, options) =>
      kbPrepareDerivedNote(config, {
        kind: requireStringOption(options, "kind", "validation_error: --kind is required"),
        title: requireStringOption(options, "title", "validation_error: --title is required"),
      }),
  },
  {
    toolName: "kb_upsert_output",
    openclawName: "upsert-output",
    standaloneAliases: ["upsert-output"],
    description: "Validate and write an output note",
    options: [
      {
        flags: "--markdown <text>",
        description: "Full markdown content for the output note",
        key: "markdown",
        type: "string",
      },
    ],
    run: async (config, options) =>
      kbUpsertOutput(config, {
        markdown: requireStringOption(options, "markdown", "validation_error: --markdown is required"),
      }),
  },
  {
    toolName: "kb_upsert_derived_note",
    openclawName: "upsert-derived-note",
    standaloneAliases: ["upsert-derived-note"],
    description: "Validate and write a concept, entity, or synthesis note",
    options: [
      {
        flags: "--markdown <text>",
        description: "Full markdown content for the derived note",
        key: "markdown",
        type: "string",
      },
    ],
    run: async (config, options) =>
      kbUpsertDerivedNote(config, {
        markdown: requireStringOption(options, "markdown", "validation_error: --markdown is required"),
      }),
  },
  {
    toolName: "kb_rebuild_indexes",
    openclawName: "rebuild-indexes",
    standaloneAliases: ["rebuild-indexes"],
    description: "Rebuild wiki index, log, and collection index notes",
    options: [],
    run: async (config) => kbRebuildIndexes(config),
  },
  {
    toolName: "kb_search",
    openclawName: "search",
    standaloneAliases: ["search"],
    description: "Search wiki notes with lightweight token scoring",
    options: [
      {
        flags: "--query <text>",
        description: "Search query text",
        key: "query",
        type: "string",
      },
      {
        flags: "--limit <n>",
        description: "Maximum number of results to return",
        key: "limit",
        type: "string",
      },
      {
        flags: "--types <list>",
        description: "Comma-separated note types: source,output,concept,entity,synthesis,index,log",
        key: "types",
        type: "string",
      },
    ],
    run: async (config, options) =>
      kbSearch(config, {
        query: requireStringOption(options, "query", "validation_error: --query is required"),
        limit: optionalNumberOption(options, "limit"),
        types:
          typeof options.types === "string"
            ? options.types
                .split(",")
                .map((item) => item.trim())
                .filter(Boolean) as KnowledgeBaseNoteType[]
            : undefined,
      }),
  },
  {
    toolName: "kb_read_notes",
    openclawName: "read-notes",
    standaloneAliases: ["read-notes"],
    description: "Read wiki notes from the vault, including derived notes, indexes, and the log",
    options: [
      {
        flags: "--paths <list>",
        description: "Comma-separated relative note paths",
        key: "paths",
        type: "string",
      },
    ],
    run: async (config, options) =>
      kbReadNotes(config, {
        paths: requireStringOption(options, "paths", "validation_error: --paths is required")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean),
      }),
  },
  {
    toolName: "kb_map_gaps",
    openclawName: "map-gaps",
    standaloneAliases: ["map-gaps"],
    description: "Report the highest-value missing concept, entity, and synthesis pages",
    options: [
      {
        flags: "--limit <n>",
        description: "Maximum number of candidates to return",
        key: "limit",
        type: "string",
      },
    ],
    run: async (config, options) =>
      kbMapGaps(config, {
        limit: optionalNumberOption(options, "limit"),
      }),
  },
  {
    toolName: "kb_promote_gap",
    openclawName: "promote-gap",
    standaloneAliases: ["promote-gap"],
    description: "Create a derived note directly from a current gap candidate",
    options: [
      {
        flags: "--note-id <id>",
        description: "Candidate note_id returned by kb_map_gaps",
        key: "noteId",
        type: "string",
      },
      {
        flags: "--kind <kind>",
        description: "Fallback selector when note_id is omitted: concept, entity, or synthesis",
        key: "kind",
        type: "string",
      },
      {
        flags: "--title <title>",
        description: "Fallback selector title when note_id is omitted",
        key: "title",
        type: "string",
      },
    ],
    run: async (config, options) =>
      kbPromoteGap(config, {
        note_id: typeof options.noteId === "string" ? options.noteId : undefined,
        kind: typeof options.kind === "string" ? options.kind : undefined,
        title: typeof options.title === "string" ? options.title : undefined,
      }),
  },
  {
    toolName: "kb_lint",
    openclawName: "lint",
    standaloneAliases: ["lint"],
    description: "Run deterministic knowledge-base structure checks plus wiki-health warnings",
    options: [],
    run: async (config) => kbLint(config),
  },
];

function getCommandSpec(commandName: KnowledgeBaseCliCommandName): KnowledgeBaseCliCommandSpec {
  const spec = COMMAND_SPECS.find((item) => item.toolName === commandName);
  if (!spec) {
    throw new Error(`unknown command: ${commandName}`);
  }
  return spec;
}

function resolveCommandName(input: string): KnowledgeBaseCliCommandName | undefined {
  const spec = COMMAND_SPECS.find(
    (item) => item.toolName === input || item.standaloneAliases.includes(input),
  );
  return spec?.toolName;
}

function optionFlagName(option: CliOptionSpec): string {
  return option.flags.split(" ")[0];
}

function parseFlagValue(
  argv: string[],
  index: number,
  flag: string,
  reservedFlags: string[],
): string {
  const value = argv[index + 1];
  if (!value || reservedFlags.includes(value)) {
    throw new Error(`validation_error: ${flag} requires a value`);
  }
  return value;
}

function renderCommandSynopsis(spec: KnowledgeBaseCliCommandSpec): string {
  const aliases = spec.standaloneAliases.length > 0 ? ` (alias: ${spec.standaloneAliases.join(", ")})` : "";
  const options = spec.options.map((option) => option.flags).join(" ");
  return `  ${spec.toolName}${aliases}${options ? ` ${options}` : ""}`;
}

function renderStandaloneUsage(commandName?: KnowledgeBaseCliCommandName): string {
  const spec = commandName ? getCommandSpec(commandName) : undefined;

  if (spec) {
    const optionLines = spec.options.length
      ? spec.options.map((option) => `  ${option.flags.padEnd(18)} ${option.description}`).join("\n")
      : "  (no command-specific options)";

    return `Usage: llm-knowledge-bases ${spec.toolName} --vault-root <absolute-path> [options]

${spec.description}

Aliases:
  ${spec.standaloneAliases.join(", ") || "(none)"}

Global options:
  --vault-root <absolute-path>  Required unless LLM_KB_VAULT_ROOT is set
  --raw-dir <dir>
  --wiki-dir <dir>
  --state-dir <dir>
  -h, --help

Command options:
${optionLines}
`;
  }

  const commandLines = COMMAND_SPECS.map((item) => renderCommandSynopsis(item)).join("\n");
  return `Usage: llm-knowledge-bases <command> --vault-root <absolute-path> [options]

Directly run the deterministic kb_* workflow against an Obsidian vault.

Commands:
${commandLines}

Global options:
  --vault-root <absolute-path>  Required unless LLM_KB_VAULT_ROOT is set
  --raw-dir <dir>
  --wiki-dir <dir>
  --state-dir <dir>
  -h, --help

Environment variable fallbacks:
  LLM_KB_VAULT_ROOT
  LLM_KB_RAW_DIR
  LLM_KB_WIKI_DIR
  LLM_KB_STATE_DIR
`;
}

export function parseStandaloneCliArgs(argv: string[]): ParsedStandaloneCliArgs {
  const parsed: ParsedStandaloneCliArgs = {
    help: false,
    config: {},
    commandOptions: {},
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "-h" || arg === "--help") {
      parsed.help = true;
      continue;
    }

    if (!arg.startsWith("--")) {
      if (parsed.commandName) {
        throw new Error(`unexpected argument: ${arg}`);
      }
      const commandName = resolveCommandName(arg);
      if (!commandName) {
        throw new Error(`unknown command: ${arg}`);
      }
      parsed.commandName = commandName;
      continue;
    }

    switch (arg) {
      case "--vault-root":
        parsed.config.vaultRoot = parseFlagValue(argv, index, arg, [
          "--vault-root",
          "--raw-dir",
          "--wiki-dir",
          "--state-dir",
          "-h",
          "--help",
        ]);
        index += 1;
        break;
      case "--raw-dir":
        parsed.config.rawDir = parseFlagValue(argv, index, arg, [
          "--vault-root",
          "--raw-dir",
          "--wiki-dir",
          "--state-dir",
          "-h",
          "--help",
        ]);
        index += 1;
        break;
      case "--wiki-dir":
        parsed.config.wikiDir = parseFlagValue(argv, index, arg, [
          "--vault-root",
          "--raw-dir",
          "--wiki-dir",
          "--state-dir",
          "-h",
          "--help",
        ]);
        index += 1;
        break;
      case "--state-dir":
        parsed.config.stateDir = parseFlagValue(argv, index, arg, [
          "--vault-root",
          "--raw-dir",
          "--wiki-dir",
          "--state-dir",
          "-h",
          "--help",
        ]);
        index += 1;
        break;
      default: {
        if (!parsed.commandName) {
          throw new Error(`unknown option before command: ${arg}`);
        }

        const spec = getCommandSpec(parsed.commandName);
        const option = spec.options.find((item) => item.flags.startsWith(arg));
        if (!option) {
          throw new Error(`unknown option for ${parsed.commandName}: ${arg}`);
        }

        if (option.type === "boolean") {
          parsed.commandOptions[option.key] = true;
          break;
        }

        parsed.commandOptions[option.key] = parseFlagValue(
          argv,
          index,
          arg,
          [
            "--vault-root",
            "--raw-dir",
            "--wiki-dir",
            "--state-dir",
            "-h",
            "--help",
            ...spec.options.map((item) => optionFlagName(item)),
          ],
        );
        index += 1;
        break;
      }
    }
  }

  return parsed;
}

async function runCommand(
  config: KnowledgeBaseConfig,
  commandName: KnowledgeBaseCliCommandName,
  options: Record<string, CommandOptionValue>,
): Promise<unknown> {
  return getCommandSpec(commandName).run(config, options);
}

export async function runStandaloneKnowledgeBaseCli(
  argv: string[],
  io: StandaloneCliIo = {},
): Promise<number> {
  const stdout = io.stdout ?? process.stdout;
  const stderr = io.stderr ?? process.stderr;
  const env = io.env ?? process.env;

  let parsed: ParsedStandaloneCliArgs;
  try {
    parsed = parseStandaloneCliArgs(argv);
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    stderr.write(renderStandaloneUsage());
    return 1;
  }

  if (parsed.help || !parsed.commandName) {
    stdout.write(renderStandaloneUsage(parsed.commandName));
    return parsed.commandName ? 0 : parsed.help ? 0 : 1;
  }

  let config: KnowledgeBaseConfig;
  try {
    config = normalizeKnowledgeBaseConfig({
      vaultRoot: parsed.config.vaultRoot ?? env.LLM_KB_VAULT_ROOT,
      rawDir: parsed.config.rawDir ?? env.LLM_KB_RAW_DIR,
      wikiDir: parsed.config.wikiDir ?? env.LLM_KB_WIKI_DIR,
      stateDir: parsed.config.stateDir ?? env.LLM_KB_STATE_DIR,
    });
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    stderr.write(renderStandaloneUsage(parsed.commandName));
    return 1;
  }

  try {
    const result = await runCommand(config, parsed.commandName, parsed.commandOptions);
    printJson(result, stdout);
    return 0;
  } catch (error) {
    stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    return 1;
  }
}

export function registerKnowledgeBaseCli(params: {
  program: CliCommand;
  pluginConfig: KnowledgeBasePluginConfig;
}): void {
  const { program, pluginConfig } = params;
  const root = program.command("openclaw-llm-kb").description("LLM Knowledge Bases vault utilities");

  for (const spec of COMMAND_SPECS) {
    const command = root.command(spec.openclawName).description(spec.description);
    for (const option of spec.options) {
      command.option(option.flags, option.description);
    }
    command.action(async (options: Record<string, CommandOptionValue>) => {
      try {
        printJson(await spec.run(pluginConfig, options));
      } catch (error) {
        fail(error);
      }
    });
  }
}
