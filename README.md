# LLM Knowledge Bases

Inspired by a public workflow shared by Andrej Karpathy (@karpathy). From raw text, PDFs, images, and structured data to a living Markdown wiki that compounds with every question.

`@harrylabs/llm-knowledge-bases` is the deterministic runtime behind that workflow. It ships as:

- a standalone CLI for directly running the `kb_*` workflow
- a stdio MCP server for Claude Code, Codex, Cursor, Gemini CLI, and other MCP-capable agents
- a config generator for wiring that MCP server into different clients
- an OpenClaw-compatible host entry for teams that also use OpenClaw

If you want the workflow-first entry point, start with the companion skill.
Use this package when you want the underlying runtime as an installable CLI/MCP toolchain.

## What 0.4.1 Implements

This release makes the runtime representation-first and explicitly multimodal:

- a raw/wiki/schema operating model with runtime-owned structure and agent-owned synthesis
- supported raw kinds for text (`.md`, `.txt`), PDFs, images (`.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`, `.svg`), and structured data (`.csv`, `.tsv`, `.json`, `.html`)
- manifest schema version `2`, including `raw_kind`, `mime_type`, `size_bytes`, `asset_refs`, and stored `representations`
- source-id repair through `kb_repair_source_ids`, so stale source doc ids, source note paths, and raw hashes can be repaired without throwing away readable existing ids
- stable non-ASCII source ids plus deterministic repair workflows, so legacy `src-untitled-*` records are migrated forward instead of being preserved by stale manifest state
- safe raw-asset inspection through `kb_get_raw_asset`, including deterministic metadata plus a safe absolute path for local viewers
- full compile context through `kb_prepare_source_bundle`, including asset refs, stored representations, and `compile_readiness`
- runtime-managed representation storage under `.llm-kb/representations/` through `kb_prepare_representation`, `kb_upsert_representation`, and `kb_read_representations`
- compile-readiness tracking with `ready`, `partial`, and `needs_representation`
- source note validation that keeps `raw_kind`, `mime_type`, and `asset_paths` aligned with the actual reviewed assets
- archived `output` notes plus first-class `concept`, `entity`, and `synthesis` note support
- deterministic gap mapping and promotion through `kb_map_gaps` and `kb_promote_gap`
- generated `wiki/index.md`, `wiki/log.md`, and collection indexes, now with raw-kind labels on source pages
- deterministic lint for schema and wiki health, including warnings for missing representation trails, stale representations, inconsistent `asset_paths`, isolated pages, stale source coverage, unsupported claims, contradiction candidates, and missing high-value pages
- CLI and MCP wrappers around the same runtime contract

## Multimodal Ingest Model

The runtime now supports two ingest paths:

1. Text and structured data can still compile directly from `raw/` with `kb_prepare_source` and `kb_read_raw`.
2. PDFs and images use a representation-first path:
   - inspect the asset with `kb_get_raw_asset`
   - inspect compile readiness with `kb_prepare_source_bundle`
   - store intermediate OCR, vision, page notes, metadata, or profiles under `.llm-kb/representations/`
   - compile the final source note only after the representation trail is present

The runtime intentionally does not perform OCR or vision itself.
Instead, it gives agents a canonical place to store those intermediate artifacts and then validates that the final wiki pages stay grounded in them.

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
    manifest.json
    runs.jsonl
    representations/
```

## CLI Commands

The standalone CLI exposes the runtime surface directly:

```bash
llm-knowledge-bases kb_status --vault-root /vault
llm-knowledge-bases kb_list_raw --vault-root /vault --changed-only
llm-knowledge-bases kb_read_raw --vault-root /vault --raw-path raw/notes/example.md
llm-knowledge-bases kb_get_raw_asset --vault-root /vault --raw-path raw/papers/report.pdf
llm-knowledge-bases kb_prepare_source --vault-root /vault --raw-path raw/notes/example.md
llm-knowledge-bases kb_prepare_source_bundle --vault-root /vault --raw-path raw/papers/report.pdf
llm-knowledge-bases kb_prepare_representation --vault-root /vault --raw-path raw/papers/report.pdf --kind ocr_text
llm-knowledge-bases kb_upsert_representation --vault-root /vault --raw-path raw/papers/report.pdf --kind ocr_text --content '<markdown>'
llm-knowledge-bases kb_read_representations --vault-root /vault --raw-path raw/papers/report.pdf --kinds metadata,ocr_text
llm-knowledge-bases kb_upsert_source_note --vault-root /vault --raw-path raw/papers/report.pdf --markdown '<full markdown>'
llm-knowledge-bases kb_prepare_output --vault-root /vault --title 'Example Query' --query 'What are the tradeoffs?'
llm-knowledge-bases kb_upsert_output --vault-root /vault --markdown '<full markdown>'
llm-knowledge-bases kb_prepare_derived_note --vault-root /vault --kind concept --title 'Agent Memory'
llm-knowledge-bases kb_upsert_derived_note --vault-root /vault --markdown '<full markdown>'
llm-knowledge-bases kb_map_gaps --vault-root /vault --limit 10
llm-knowledge-bases kb_promote_gap --vault-root /vault --note-id synthesis-retrieval-vs-memory
llm-knowledge-bases kb_repair_source_ids --vault-root /vault
llm-knowledge-bases kb_repair_source_ids --vault-root /vault --apply
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
- `kb_get_raw_asset`
- `kb_prepare_source`
- `kb_prepare_source_bundle`
- `kb_prepare_representation`
- `kb_upsert_representation`
- `kb_read_representations`
- `kb_upsert_source_note`
- `kb_prepare_output`
- `kb_upsert_output`
- `kb_prepare_derived_note`
- `kb_upsert_derived_note`
- `kb_map_gaps`
- `kb_promote_gap`
- `kb_repair_source_ids`
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
- manifest-backed representation tracking
- generated wiki navigation

The agent owns:

- summarization
- OCR, vision, or profiling work performed outside the runtime
- synthesis
- deciding whether a result belongs in `output`, `concept`, `entity`, or `synthesis`
- improving the wiki over time instead of leaving value trapped in chat

`kb_prepare_source_bundle` is the bridge between those layers for non-text assets: it returns the exact raw metadata, reviewed asset refs, stored representations, and readiness state the agent needs before compiling a source note.
`kb_map_gaps` and `kb_promote_gap` still cover durable knowledge growth on top of that ingest layer.
`kb_lint` stays deterministic, but now also checks whether multimodal source notes have a believable review trail before the wiki starts depending on them.

## Still Out of Scope

This package still does not implement:

- embeddings or vector search
- database-backed indexing
- rename tracking
- built-in OCR, vision, or PDF parsing inside the runtime itself
- autonomous background agents inside the package
