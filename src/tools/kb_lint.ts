import fs from "node:fs/promises";
import path from "node:path";

import type {
  KnowledgeBasePluginConfig,
  LintIssue,
  ManifestFile,
} from "../types.js";
import type { OutputNoteFrontmatter, SourceNoteFrontmatter } from "../core/frontmatter.js";
import { parseOutputNoteMarkdown, parseSourceNoteMarkdown } from "../core/frontmatter.js";
import { hashFile } from "../core/hash.js";
import { loadManifest } from "../core/manifest.js";
import { listMarkdownFiles } from "../core/notes.js";
import { buildOutputPathFromId } from "../core/naming.js";
import { getVaultPaths, resolveVaultPath } from "../core/paths.js";
import { listRawFiles } from "../core/scan.js";
import { validateRuntimeConfig } from "../core/validate.js";

type ValidNoteRecord = {
  path: string;
  id: string;
  type: "source" | "output";
  frontmatter: SourceNoteFrontmatter | OutputNoteFrontmatter;
};

function pushIssue(issues: LintIssue[], issue: LintIssue): void {
  issues.push(issue);
}

function canonicalSourcePath(config: KnowledgeBasePluginConfig, docId: string): string {
  return `${getVaultPaths(config).sources}/${docId}.md`;
}

async function sourceRefExists(
  config: KnowledgeBasePluginConfig,
  manifest: ManifestFile,
  knownSourceIds: Set<string>,
  sourceRef: string,
): Promise<boolean> {
  if (knownSourceIds.has(sourceRef)) {
    return true;
  }

  const manifestDocIds = new Set(Object.values(manifest.sources).map((item) => item.doc_id));
  if (manifestDocIds.has(sourceRef)) {
    return true;
  }

  try {
    await fs.stat(await resolveVaultPath(config, `${getVaultPaths(config).sources}/${sourceRef}.md`));
    return true;
  } catch {
    return false;
  }
}

async function lintSourceNotes(
  config: KnowledgeBasePluginConfig,
  manifest: ManifestFile,
  issues: LintIssue[],
): Promise<ValidNoteRecord[]> {
  const paths = getVaultPaths(config);
  const sourcePaths = await listMarkdownFiles(config, paths.sources);
  const validNotes: ValidNoteRecord[] = [];

  for (const notePath of sourcePaths) {
    const absolutePath = await resolveVaultPath(config, notePath);
    const content = await fs.readFile(absolutePath, "utf8");

    try {
      const { frontmatter } = parseSourceNoteMarkdown(content);
      validNotes.push({
        path: notePath,
        id: frontmatter.id,
        type: "source",
        frontmatter,
      });

      const expectedPath = canonicalSourcePath(config, frontmatter.id);
      if (notePath !== expectedPath || path.posix.parse(notePath).name !== frontmatter.id) {
        pushIssue(issues, {
          code: "illegal_write_location",
          severity: "error",
          path: notePath,
          message: `source note path must be ${expectedPath}`,
        });
      }

      if (!frontmatter.raw_path.startsWith(`${config.rawDir}/`)) {
        pushIssue(issues, {
          code: "validation_error",
          severity: "error",
          path: notePath,
          message: "source note raw_path must stay under raw/",
        });
        continue;
      }

      try {
        const currentRawHash = await hashFile(await resolveVaultPath(config, frontmatter.raw_path));
        if (frontmatter.raw_hash !== currentRawHash) {
          pushIssue(issues, {
            code: "hash_mismatch",
            severity: "error",
            path: notePath,
            message: "source note raw_hash does not match the current raw file",
          });
        }
      } catch {
        pushIssue(issues, {
          code: "missing_raw",
          severity: "error",
          path: frontmatter.raw_path,
          message: "source note references a raw file that does not exist",
        });
      }

      const manifestEntry = manifest.sources[frontmatter.raw_path];
      if (manifestEntry && manifestEntry.source_note_path !== expectedPath) {
        pushIssue(issues, {
          code: "illegal_write_location",
          severity: "error",
          path: notePath,
          message: `manifest source_note_path must be ${expectedPath}`,
        });
      }
    } catch (error) {
      pushIssue(issues, {
        code: "validation_error",
        severity: "error",
        path: notePath,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return validNotes;
}

async function lintOutputNotes(
  config: KnowledgeBasePluginConfig,
  manifest: ManifestFile,
  knownSourceIds: Set<string>,
  issues: LintIssue[],
): Promise<ValidNoteRecord[]> {
  const paths = getVaultPaths(config);
  const outputPaths = await listMarkdownFiles(config, paths.outputs);
  const validNotes: ValidNoteRecord[] = [];

  for (const notePath of outputPaths) {
    const absolutePath = await resolveVaultPath(config, notePath);
    const content = await fs.readFile(absolutePath, "utf8");

    try {
      const { frontmatter } = parseOutputNoteMarkdown(content);
      validNotes.push({
        path: notePath,
        id: frontmatter.id,
        type: "output",
        frontmatter,
      });

      const expectedPath = buildOutputPathFromId(paths.outputs, frontmatter.id);
      if (notePath !== expectedPath) {
        pushIssue(issues, {
          code: "illegal_write_location",
          severity: "error",
          path: notePath,
          message: `output note path must be ${expectedPath}`,
        });
      }

      for (const sourceRef of frontmatter.source_refs) {
        if (!(await sourceRefExists(config, manifest, knownSourceIds, sourceRef))) {
          pushIssue(issues, {
            code: "invalid_source_ref",
            severity: "error",
            path: notePath,
            message: `output note source_refs references missing source "${sourceRef}"`,
          });
        }
      }
    } catch (error) {
      pushIssue(issues, {
        code: "validation_error",
        severity: "error",
        path: notePath,
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return validNotes;
}

function lintDuplicateIds(notes: ValidNoteRecord[], issues: LintIssue[]): void {
  const byId = new Map<string, ValidNoteRecord[]>();

  for (const note of notes) {
    const group = byId.get(note.id) ?? [];
    group.push(note);
    byId.set(note.id, group);
  }

  for (const [id, group] of byId.entries()) {
    if (group.length < 2) {
      continue;
    }

    for (const note of group) {
      pushIssue(issues, {
        code: "duplicate_id",
        severity: "error",
        path: note.path,
        message: `duplicate id "${id}" detected`,
      });
    }
  }
}

async function lintIndexFiles(config: KnowledgeBasePluginConfig, issues: LintIssue[]): Promise<void> {
  const paths = getVaultPaths(config);
  for (const indexPath of [`${paths.indexes}/sources.md`, `${paths.indexes}/outputs.md`]) {
    try {
      await fs.stat(await resolveVaultPath(config, indexPath));
    } catch {
      pushIssue(issues, {
        code: "missing_index",
        severity: "error",
        path: indexPath,
        message: "index file is missing",
      });
    }
  }
}

export async function kbLint(config: KnowledgeBasePluginConfig) {
  await validateRuntimeConfig(config);

  const issues: LintIssue[] = [];
  const manifest = await loadManifest(config);
  const rawItems = await listRawFiles(config);
  const rawPathSet = new Set(rawItems.map((item) => item.raw_path));

  for (const rawItem of rawItems) {
    if (!manifest.sources[rawItem.raw_path]) {
      pushIssue(issues, {
        code: "missing_manifest_record",
        severity: "error",
        path: rawItem.raw_path,
        message: "raw file exists but manifest record is missing",
      });
      continue;
    }

    if (rawItem.status === "missing_source_note") {
      pushIssue(issues, {
        code: "missing_source_note",
        severity: "error",
        path: rawItem.raw_path,
        message: "raw file exists but source note is missing",
      });
    }
  }

  for (const [rawPath, entry] of Object.entries(manifest.sources)) {
    if (!rawPathSet.has(rawPath)) {
      pushIssue(issues, {
        code: "missing_raw",
        severity: "error",
        path: rawPath,
        message: "manifest record exists but raw file is missing",
      });
    }

    const expectedSourcePath = canonicalSourcePath(config, entry.doc_id);
    if (entry.source_note_path !== expectedSourcePath) {
      pushIssue(issues, {
        code: "illegal_write_location",
        severity: "error",
        path: entry.source_note_path,
        message: `manifest source_note_path must be ${expectedSourcePath}`,
      });
    }
  }

  const validSourceNotes = await lintSourceNotes(config, manifest, issues);
  const knownSourceIds = new Set(validSourceNotes.map((note) => note.id));
  const validOutputNotes = await lintOutputNotes(config, manifest, knownSourceIds, issues);

  lintDuplicateIds([...validSourceNotes, ...validOutputNotes], issues);
  await lintIndexFiles(config, issues);

  issues.sort((a, b) => a.path.localeCompare(b.path) || a.code.localeCompare(b.code));

  return {
    ok: issues.length === 0,
    issues,
  };
}
