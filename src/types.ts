export type KnowledgeBasePluginConfig = {
  vaultRoot: string;
  rawDir: string;
  wikiDir: string;
  stateDir: string;
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
  changed_raw_count: number;
  manifest_exists: boolean;
  paths: {
    raw: string;
    sources: string;
    outputs: string;
    indexes: string;
    state: string;
  };
};

export type KnowledgeBaseNoteType = "source" | "output" | "index";

export type SearchResultItem = {
  path: string;
  type: "source" | "output";
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
  severity: "error";
  path: string;
  message: string;
};
