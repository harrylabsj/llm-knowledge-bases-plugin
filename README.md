# OpenClaw LLM Knowledge Bases Plugin

Inspired by a public workflow shared by Andrej Karpathy (@karpathy). From raw research to a living Markdown knowledge base that compounds with every question.

If you want the workflow-first entry point, start with the companion [LLM Knowledge Bases skill](https://github.com/harrylabsj/openclaw-skill-llm-knowledge-bases). This plugin provides the deterministic vault runtime behind that same workflow.

## Scope

This repository currently implements the full `1.0` plugin surface described in the design doc:

- configurable `vaultRoot`
- controlled path handling and vault boundary checks
- manifest and runs state files
- raw file discovery
- raw file reading
- canonical source-note preparation
- source note upsert and manifest updates
- output note preparation and upsert
- sources/outputs index rebuilding
- lightweight text search
- controlled note reads
- deterministic lint
- CLI-backed surface for the first tool set

This repository does not implement:

- embeddings or vector search
- database-backed indexing
- rename tracking
- PDF or image ingestion
- cron / heartbeat automation
- plugin-internal autonomous agent loops

## Why CLI-backed first

The design allows a CLI fallback when the current OpenClaw plugin SDK does not yet expose the exact native tool registration surface we want.

That means the plugin still owns all vault I/O, but the first implementation path is:

- `openclaw-llm-kb status`
- `openclaw-llm-kb list-raw`
- `openclaw-llm-kb read-raw`
- `openclaw-llm-kb prepare-source`
- `openclaw-llm-kb upsert-source-note`
- `openclaw-llm-kb prepare-output`
- `openclaw-llm-kb upsert-output`
- `openclaw-llm-kb rebuild-indexes`
- `openclaw-llm-kb search`
- `openclaw-llm-kb read-notes`
- `openclaw-llm-kb lint`

The skill can call this surface while the plugin internals stay deterministic and auditable.

## Configuration

The plugin requires a vault root:

```json
{
  "vaultRoot": "/absolute/path/to/your/obsidian-vault",
  "rawDir": "raw",
  "wikiDir": "wiki",
  "stateDir": ".llm-kb"
}
```

`vaultRoot` is the only source of truth for vault location.

## Example commands

The CLI examples below assume the plugin is installed and configured inside OpenClaw:

```bash
openclaw openclaw-llm-kb status
openclaw openclaw-llm-kb list-raw --changed-only
openclaw openclaw-llm-kb read-raw --raw-path raw/inbox/example-note.md
openclaw openclaw-llm-kb prepare-source --raw-path raw/inbox/example-note.md
openclaw openclaw-llm-kb upsert-source-note --raw-path raw/inbox/example-note.md --markdown '<full markdown>'
openclaw openclaw-llm-kb prepare-output --title 'Example Query' --query 'What are the main points?'
openclaw openclaw-llm-kb upsert-output --markdown '<full markdown>'
openclaw openclaw-llm-kb rebuild-indexes
openclaw openclaw-llm-kb search --query 'main points example' --types source,output
openclaw openclaw-llm-kb read-notes --paths wiki/sources/src-example-note.md,wiki/_indexes/sources.md
openclaw openclaw-llm-kb lint
```

## Local development

Install dependencies:

```bash
npm install
```

Run checks:

```bash
npm run typecheck
npm test
```

## Manual verification

1. Create or copy a test vault from `examples/vault-template/`.
2. Configure `vaultRoot` to that absolute path.
3. Put a markdown file under `raw/`.
4. Run `openclaw openclaw-llm-kb status`.
5. Run `openclaw openclaw-llm-kb list-raw --changed-only`.
6. Run `openclaw openclaw-llm-kb read-raw --raw-path <path>`.
7. Run `openclaw openclaw-llm-kb prepare-source --raw-path <path>`.
8. Generate a valid source note and write it with `openclaw openclaw-llm-kb upsert-source-note`.
9. Run `openclaw openclaw-llm-kb rebuild-indexes`.
10. Verify `openclaw openclaw-llm-kb search --query '<keywords>'` returns the new source note.
11. Ask a question, prepare an output note with `prepare-output`, then write it with `upsert-output`.
12. Use `openclaw openclaw-llm-kb read-notes --paths <source>,<output>,wiki/_indexes/sources.md` to verify controlled reads.
13. Run `openclaw openclaw-llm-kb lint` and confirm the result is clean.
14. Delete or rename the source note temporarily, run `lint` again, and confirm it reports the structure problem.

## Vault template

See [examples/vault-template/README.md](/Users/jianghaidong/Library/Mobile%20Documents/com~apple~CloudDocs/codex/plugins/openclaw-llm-knowledge-bases-plugin/examples/vault-template/README.md).
