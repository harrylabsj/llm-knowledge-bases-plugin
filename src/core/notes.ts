import fs from "node:fs/promises";
import path from "node:path";

import type {
  KnowledgeBaseNoteType,
  KnowledgeBasePluginConfig,
  ReadNoteItem,
} from "../types.js";
import { parseOutputNoteMarkdown, parseSourceNoteMarkdown } from "./frontmatter.js";
import { getVaultPaths, resolveVaultPath, toVaultRelativePath } from "./paths.js";

function isUnderDir(candidate: string, dir: string): boolean {
  return candidate.startsWith(`${dir}/`);
}

function inferIndexTitle(notePath: string, content: string): string {
  const headingMatch = /^#\s+(.+?)\s*$/m.exec(content);
  if (headingMatch?.[1]) {
    return headingMatch[1];
  }

  return path
    .posix.parse(notePath)
    .name.replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

export function classifyNotePath(
  config: KnowledgeBasePluginConfig,
  notePath: string,
): KnowledgeBaseNoteType {
  const normalized = toVaultRelativePath(notePath);
  const paths = getVaultPaths(config);

  if (isUnderDir(normalized, paths.sources)) {
    return "source";
  }
  if (isUnderDir(normalized, paths.outputs)) {
    return "output";
  }
  if (isUnderDir(normalized, paths.indexes)) {
    return "index";
  }

  throw new Error("invalid_path: path must stay under wiki/sources, wiki/outputs, or wiki/_indexes");
}

export async function listMarkdownFiles(
  config: KnowledgeBasePluginConfig,
  relativeDir: string,
): Promise<string[]> {
  const absoluteDir = await resolveVaultPath(config, relativeDir);

  try {
    const entries = await fs.readdir(absoluteDir, { withFileTypes: true });
    return entries
      .filter((entry) => entry.isFile() && entry.name.endsWith(".md"))
      .map((entry) => `${relativeDir}/${entry.name}`)
      .sort();
  } catch {
    return [];
  }
}

export async function readNote(
  config: KnowledgeBasePluginConfig,
  notePath: string,
): Promise<ReadNoteItem> {
  const type = classifyNotePath(config, notePath);
  const absolutePath = await resolveVaultPath(config, notePath);
  const content = await fs.readFile(absolutePath, "utf8");

  if (type === "source") {
    const { frontmatter } = parseSourceNoteMarkdown(content);
    return {
      path: notePath,
      type,
      id: frontmatter.id,
      title: frontmatter.title,
      content,
    };
  }

  if (type === "output") {
    const { frontmatter } = parseOutputNoteMarkdown(content);
    return {
      path: notePath,
      type,
      id: frontmatter.id,
      title: frontmatter.title,
      content,
    };
  }

  return {
    path: notePath,
    type,
    title: inferIndexTitle(notePath, content),
    content,
  };
}
