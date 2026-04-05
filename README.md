# LLM Knowledge Bases

Inspired by a public workflow shared by Andrej Karpathy (@karpathy). From raw research to a living Markdown wiki that compounds with every question.

`@harrylabs/llm-knowledge-bases` is the deterministic runtime behind that workflow. It ships as:

- a standalone CLI for directly running the `kb_*` workflow
- a stdio MCP server for Claude Code, Codex, Cursor, Gemini CLI, and other MCP-capable agents
- a config generator for wiring that MCP server into different clients
- an OpenClaw-compatible host entry for teams that also use OpenClaw

If you want the workflow-first entry point, start with the companion skill.
Use this package when you want the underlying runtime as an installable CLI/MCP toolchain.

## What It Implements

This package now implements the core wiki-maintenance runtime surface:

- a raw/wiki/schema-style operating model, with runtime-owned structure and agent-owned synthesis
- configurable `vaultRoot`
- controlled path handling and vault boundary checks
- manifest and run-log state files
- raw file discovery and source-note compilation support
- archived `output` notes
- first-class `concept`, `entity`, and `synthesis` note support
- deterministic gap mapping for missing concept, entity, and synthesis pages, with ready-to-fill Markdown drafts, suggested openings, and evidence summaries
- direct gap promotion so a reported candidate can be landed as a real derived note through the same shared draft logic
- generated `wiki/index.md` as a page-level catalog with one-line summaries, plus `wiki/log.md` and collection indexes
- lightweight full-wiki text search
- deterministic lint for source, output, and derived notes, including first-pass wiki-health warnings for isolated pages, missing cross-links, stale source coverage, unresolved research gaps, unsupported claims, contradiction candidates, draft placeholders, and medium/high-value missing pages
- CLI and MCP wrappers around the same `kb_*` tool contract

This package still does not implement:

- embeddings or vector search
- database-backed indexing
- rename tracking
- PDF or image-native parsing
- autonomous background agents inside the package

## Default Vault Shape

```text
<vault>/
  raw/
  wiki/
    sources/
    outputs/
    concepts/
    entities/
    syntheses/
    _indexes/
    index.md
    log.md
  .llm-kb/
```

## CLI Commands

The standalone CLI exposes the runtime surface directly:

```bash
llm-knowledge-bases kb_status --vault-root /vault
llm-knowledge-bases kb_list_raw --vault-root /vault --changed-only
llm-knowledge-bases kb_prepare_source --vault-root /vault --raw-path raw/inbox/example-note.md
llm-knowledge-bases kb_upsert_source_note --vault-root /vault --raw-path raw/inbox/example-note.md --markdown '<full markdown>'
llm-knowledge-bases kb_prepare_output --vault-root /vault --title 'Example Query' --query 'What are the tradeoffs?'
llm-knowledge-bases kb_upsert_output --vault-root /vault --markdown '<full markdown>'
llm-knowledge-bases kb_prepare_derived_note --vault-root /vault --kind concept --title 'Agent Memory'
llm-knowledge-bases kb_upsert_derived_note --vault-root /vault --markdown '<full markdown>'
llm-knowledge-bases kb_map_gaps --vault-root /vault --limit 10
llm-knowledge-bases kb_promote_gap --vault-root /vault --note-id synthesis-retrieval-vs-memory
llm-knowledge-bases kb_rebuild_indexes --vault-root /vault
llm-knowledge-bases kb_search --vault-root /vault --query 'agent memory' --types source,concept,synthesis
llm-knowledge-bases kb_read_notes --vault-root /vault --paths wiki/index.md,wiki/concepts/concept-agent-memory.md
llm-knowledge-bases kb_lint --vault-root /vault
```

## MCP Tools

The MCP server exposes:

- `kb_status`
- `kb_list_raw`
- `kb_read_raw`
- `kb_prepare_source`
- `kb_upsert_source_note`
- `kb_prepare_output`
- `kb_upsert_output`
- `kb_prepare_derived_note`
- `kb_upsert_derived_note`
- `kb_map_gaps`
- `kb_promote_gap`
- `kb_rebuild_indexes`
- `kb_search`
- `kb_read_notes`
- `kb_lint`

## Runtime Philosophy

The runtime owns:

- canonical paths
- canonical IDs
- validation
- deterministic writes
- generated wiki navigation

The agent owns:

- summarization
- synthesis
- deciding whether a result belongs in `output`, `concept`, `entity`, or `synthesis`
- improving the wiki over time instead of leaving value trapped in chat

`kb_map_gaps` is the bridge between those layers: it reports prioritized missing-page candidates and emits valid draft Markdown, suggested openings, and evidence summaries that can be refined and sent to `kb_upsert_derived_note`.
`kb_promote_gap` closes that loop by taking one current candidate and landing its shared draft as a real derived note without re-implementing the gap heuristics.
`kb_lint` stays deterministic, but now surfaces a small first layer of wiki-health warnings instead of only schema/path failures, including current high-value missing pages from the same gap-candidate logic used by `kb_map_gaps`, stale source coverage, unresolved research questions, unsupported claims, and contradiction candidates.
