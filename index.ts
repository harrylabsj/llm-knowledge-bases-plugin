export {
  KnowledgeBaseConfigJsonSchema,
  KnowledgeBasePluginConfigJsonSchema,
  OPENCLAW_PLUGIN_ID,
  PLUGIN_ID,
  normalizeKnowledgeBaseConfig,
  resolveKnowledgeBaseConfigFromHostConfig,
  resolveKnowledgeBaseConfigFromOpenClawHostConfig,
} from "./src/config.js";
export {
  DEFAULT_NPM_SPEC,
  DEFAULT_SERVER_NAME,
  DEFAULT_STDIO_BIN,
  buildMcpStdioLaunchSpec,
  buildStdioLaunchSpec,
  renderAllClientConfigs,
  renderClaudeAddCommand,
  renderCodexAddCommand,
  renderCursorConfig,
  renderGeminiConfig,
  renderShellCommand,
  renderTargetConfig,
} from "./src/client-configs.js";
export {
  KB_TOOL_NAMES,
  parseStandaloneCliArgs,
  registerKnowledgeBaseCli,
  runStandaloneKnowledgeBaseCli,
} from "./src/cli.js";
export {
  createKnowledgeBaseMcpServer,
  listKnowledgeBaseMcpTools,
} from "./src/mcp.js";
export { kbLint } from "./src/tools/kb_lint.js";
export { kbListRaw } from "./src/tools/kb_list_raw.js";
export { kbMapGaps } from "./src/tools/kb_map_gaps.js";
export { kbPrepareDerivedNote } from "./src/tools/kb_prepare_derived_note.js";
export { kbPrepareOutput } from "./src/tools/kb_prepare_output.js";
export { kbPrepareRepresentation } from "./src/tools/kb_prepare_representation.js";
export { kbPrepareSourceBundle } from "./src/tools/kb_prepare_source_bundle.js";
export { kbPrepareSource } from "./src/tools/kb_prepare_source.js";
export { kbRepairSourceIds } from "./src/tools/kb_repair_source_ids.js";
export { kbPromoteGap } from "./src/tools/kb_promote_gap.js";
export { kbGetRawAsset } from "./src/tools/kb_get_raw_asset.js";
export { kbReadNotes } from "./src/tools/kb_read_notes.js";
export { kbReadRaw } from "./src/tools/kb_read_raw.js";
export { kbReadRepresentations } from "./src/tools/kb_read_representations.js";
export { kbRebuildIndexes } from "./src/tools/kb_rebuild_indexes.js";
export { kbSearch } from "./src/tools/kb_search.js";
export { kbStatus } from "./src/tools/kb_status.js";
export { kbUpsertRepresentation } from "./src/tools/kb_upsert_representation.js";
export { kbUpsertDerivedNote } from "./src/tools/kb_upsert_derived_note.js";
export { kbUpsertOutput } from "./src/tools/kb_upsert_output.js";
export { kbUpsertSourceNote } from "./src/tools/kb_upsert_source_note.js";
export type {
  ClientConfigOptions,
  StdioLaunchSpec,
  TargetClient,
  TransportMode,
} from "./src/client-configs.js";
export type {
  KnowledgeBaseCliCommandName,
  ParsedStandaloneCliArgs,
  StandaloneCliIo,
} from "./src/cli.js";
export type {
  JsonRpcId,
  JsonRpcRequest,
  JsonRpcResponse,
} from "./src/mcp.js";
export type {
  CompileReadiness,
  DerivedNoteKind,
  GapCandidate,
  GapCandidateCategory,
  GapPromotionResult,
  GapReport,
  KnowledgeBaseConfig,
  KnowledgeBaseNoteType,
  KnowledgeBasePluginConfig,
  LintIssue,
  ManifestFile,
  RawItemStatus,
  RawListItem,
  ReadNoteItem,
  RepairSourceIdsItem,
  RepairSourceIdsResult,
  RepresentationEntry,
  RepresentationKind,
  RunLogEntry,
  SearchResultItem,
  SourceManifestEntry,
  StatusSummary,
} from "./src/types.js";
