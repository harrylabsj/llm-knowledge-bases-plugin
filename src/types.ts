export type KnowledgeBaseConfig = {
  vaultRoot: string;
  rawDir: string;
  wikiDir: string;
  stateDir: string;
};

export type KnowledgeBasePluginConfig = KnowledgeBaseConfig;

export type DerivedNoteKind = "concept" | "entity" | "synthesis";

export type GapCandidateCategory =
  | "missing_link"
  | "unpromoted_output"
  | "unpromoted_entity";

export type GapCandidatePriority = "high" | "medium" | "low";

export type GapCandidateDraft = {
  use_tool: "kb_upsert_derived_note";
  required_headings: string[];
  suggested_opening: string;
  evidence_summary: string[];
  markdown: string;
};

export type SourceManifestEntry = {
  doc_id: string;
  raw_path: string;
  raw_hash: string;
  source_note_path: string;
  title: string;
  compiled_at: string | null;
  status: "compiled" | "new" | "changed" | "missing_source_note";
};

export type ManifestFile = {
  schema_version: 1;
  vault_root: string;
  sources: Record<string, SourceManifestEntry>;
};

export type RunLogEntry = {
  ts: string;
  action: string;
  target: string;
  status: "ok" | "error";
};

export type RawItemStatus = "new" | "changed" | "compiled" | "missing_source_note";

export type RawListItem = {
  raw_path: string;
  title_guess: string;
  ext: ".md" | ".txt";
  raw_hash: string;
  status: RawItemStatus;
  doc_id: string;
  source_note_path: string;
};

export type StatusSummary = {
  vault_configured: true;
  vault_root: string;
  raw_count: number;
  source_note_count: number;
  output_count: number;
  derived_note_counts: Record<DerivedNoteKind, number>;
  changed_raw_count: number;
  manifest_exists: boolean;
  paths: {
    raw: string;
    sources: string;
    outputs: string;
    concepts: string;
    entities: string;
    syntheses: string;
    indexes: string;
    index: string;
    log: string;
    state: string;
  };
};

export type KnowledgeBaseNoteType =
  | "source"
  | "output"
  | DerivedNoteKind
  | "index"
  | "log";

export type SearchResultItem = {
  path: string;
  type: KnowledgeBaseNoteType;
  id: string;
  title: string;
  score: number;
  snippet: string;
};

export type ReadNoteItem = {
  path: string;
  type: KnowledgeBaseNoteType;
  title: string;
  content: string;
  id?: string;
};

export type LintIssue = {
  code: string;
  severity: "error" | "warning";
  path: string;
  message: string;
};

export type GapCandidate = {
  category: GapCandidateCategory;
  kind: DerivedNoteKind;
  title: string;
  suggested_note_id: string;
  suggested_note_path: string;
  source_refs: string[];
  evidence_paths: string[];
  reason: string;
  score: number;
  priority: GapCandidatePriority;
  next_action: "draft_and_upsert";
  draft: GapCandidateDraft;
};

export type GapReport = {
  ok: true;
  scanned_note_count: number;
  candidate_counts: Record<DerivedNoteKind, number>;
  candidates: GapCandidate[];
};

export type GapPromotionResult = {
  ok: true;
  promoted_candidate: GapCandidate;
  write_result: {
    ok: true;
    note_id: string;
    note_path: string;
    kind: DerivedNoteKind;
  };
};
