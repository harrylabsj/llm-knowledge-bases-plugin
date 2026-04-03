import type { KnowledgeBasePluginConfig } from "./types.js";
import { kbListRaw } from "./tools/kb_list_raw.js";
import { kbPrepareOutput } from "./tools/kb_prepare_output.js";
import { kbPrepareSource } from "./tools/kb_prepare_source.js";
import { kbLint } from "./tools/kb_lint.js";
import { kbReadRaw } from "./tools/kb_read_raw.js";
import { kbReadNotes } from "./tools/kb_read_notes.js";
import { kbRebuildIndexes } from "./tools/kb_rebuild_indexes.js";
import { kbSearch } from "./tools/kb_search.js";
import { kbStatus } from "./tools/kb_status.js";
import { kbUpsertOutput } from "./tools/kb_upsert_output.js";
import { kbUpsertSourceNote } from "./tools/kb_upsert_source_note.js";

export type CliCommand = {
  command(name: string): CliCommand;
  description(text: string): CliCommand;
  option(flags: string, description: string): CliCommand;
  action(fn: (...args: any[]) => void | Promise<void>): CliCommand;
};

function printJson(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value, null, 2)}\n`);
}

function fail(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`${message}\n`);
  process.exit(1);
}

export function registerKnowledgeBaseCli(params: {
  program: CliCommand;
  pluginConfig: KnowledgeBasePluginConfig;
}): void {
  const { program, pluginConfig } = params;
  const root = program.command("openclaw-llm-kb").description("LLM Knowledge Bases vault utilities");

  root
    .command("status")
    .description("Show vault status and change counts")
    .action(async () => {
      try {
        printJson(await kbStatus(pluginConfig));
      } catch (error) {
        fail(error);
      }
    });

  root
    .command("list-raw")
    .description("List raw markdown/text files in the vault")
    .option("--changed-only", "Show only files that are new, changed, or missing source notes")
    .option("--limit <n>", "Maximum number of items to return")
    .action(async (options: { changedOnly?: boolean; limit?: string }) => {
      try {
        printJson(
          await kbListRaw(pluginConfig, {
            changed_only: options.changedOnly ?? false,
            limit: options.limit ? Number(options.limit) : 50,
          }),
        );
      } catch (error) {
        fail(error);
      }
    });

  root
    .command("read-raw")
    .description("Read a raw markdown/text file from the vault")
    .option("--raw-path <path>", "Relative raw path, for example raw/inbox/example-note.md")
    .action(async (options: { rawPath?: string }) => {
      try {
        if (!options.rawPath) {
          throw new Error("invalid_path: --raw-path is required");
        }
        printJson(await kbReadRaw(pluginConfig, { raw_path: options.rawPath }));
      } catch (error) {
        fail(error);
      }
    });

  root
    .command("prepare-source")
    .description("Resolve canonical doc_id and source note path for a raw file")
    .option("--raw-path <path>", "Relative raw path, for example raw/inbox/example-note.md")
    .action(async (options: { rawPath?: string }) => {
      try {
        if (!options.rawPath) {
          throw new Error("invalid_path: --raw-path is required");
        }
        printJson(await kbPrepareSource(pluginConfig, { raw_path: options.rawPath }));
      } catch (error) {
        fail(error);
      }
    });

  root
    .command("upsert-source-note")
    .description("Validate and write a source note, then update the manifest")
    .option("--raw-path <path>", "Relative raw path, for example raw/inbox/example-note.md")
    .option("--markdown <text>", "Full markdown content for the source note")
    .action(async (options: { rawPath?: string; markdown?: string }) => {
      try {
        if (!options.rawPath) {
          throw new Error("invalid_path: --raw-path is required");
        }
        if (!options.markdown) {
          throw new Error("validation_error: --markdown is required");
        }
        printJson(
          await kbUpsertSourceNote(pluginConfig, {
            raw_path: options.rawPath,
            markdown: options.markdown,
          }),
        );
      } catch (error) {
        fail(error);
      }
    });

  root
    .command("prepare-output")
    .description("Resolve canonical output id and path for a new archived answer")
    .option("--title <text>", "Human readable output title")
    .option("--query <text>", "The user question or prompt being archived")
    .action(async (options: { title?: string; query?: string }) => {
      try {
        if (!options.title) {
          throw new Error("validation_error: --title is required");
        }
        if (!options.query) {
          throw new Error("validation_error: --query is required");
        }
        printJson(
          await kbPrepareOutput(pluginConfig, {
            title: options.title,
            query: options.query,
          }),
        );
      } catch (error) {
        fail(error);
      }
    });

  root
    .command("upsert-output")
    .description("Validate and write an output note")
    .option("--markdown <text>", "Full markdown content for the output note")
    .action(async (options: { markdown?: string }) => {
      try {
        if (!options.markdown) {
          throw new Error("validation_error: --markdown is required");
        }
        printJson(await kbUpsertOutput(pluginConfig, { markdown: options.markdown }));
      } catch (error) {
        fail(error);
      }
    });

  root
    .command("rebuild-indexes")
    .description("Rebuild wiki source and output index notes")
    .action(async () => {
      try {
        printJson(await kbRebuildIndexes(pluginConfig));
      } catch (error) {
        fail(error);
      }
    });

  root
    .command("search")
    .description("Search source and output notes with lightweight token scoring")
    .option("--query <text>", "Search query text")
    .option("--limit <n>", "Maximum number of results to return")
    .option("--types <list>", "Comma-separated note types: source,output")
    .action(async (options: { query?: string; limit?: string; types?: string }) => {
      try {
        if (!options.query) {
          throw new Error("validation_error: --query is required");
        }

        printJson(
          await kbSearch(pluginConfig, {
            query: options.query,
            limit: options.limit ? Number(options.limit) : undefined,
            types: options.types
              ? options.types
                  .split(",")
                  .map((type) => type.trim())
                  .filter(Boolean) as Array<"source" | "output">
              : undefined,
          }),
        );
      } catch (error) {
        fail(error);
      }
    });

  root
    .command("read-notes")
    .description("Read source, output, or index notes from the vault")
    .option("--paths <list>", "Comma-separated relative note paths")
    .action(async (options: { paths?: string }) => {
      try {
        if (!options.paths) {
          throw new Error("validation_error: --paths is required");
        }

        printJson(
          await kbReadNotes(pluginConfig, {
            paths: options.paths
              .split(",")
              .map((item) => item.trim())
              .filter(Boolean),
          }),
        );
      } catch (error) {
        fail(error);
      }
    });

  root
    .command("lint")
    .description("Run deterministic knowledge-base structure lint checks")
    .action(async () => {
      try {
        printJson(await kbLint(pluginConfig));
      } catch (error) {
        fail(error);
      }
    });
}
