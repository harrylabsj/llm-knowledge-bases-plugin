import fs from "node:fs/promises";
import path from "node:path";

import type {
  KnowledgeBaseNoteType,
  KnowledgeBasePluginConfig,
  SearchResultItem,
} from "../types.js";
import {
  parseDerivedNoteMarkdown,
  parseOutputNoteMarkdown,
  parseSourceNoteMarkdown,
} from "./frontmatter.js";
import { listMarkdownFiles } from "./notes.js";
import { getVaultPaths, resolveVaultPath } from "./paths.js";

type SearchableDocument = {
  path: string;
  type: KnowledgeBaseNoteType;
  id: string;
  title: string;
  aliases: string[];
  body: string;
};

type ScoredQuery = {
  score: number;
  snippet: string;
};

function tokenize(input: string): string[] {
  return [...new Set(input.toLowerCase().split(/[^a-z0-9]+/).filter(Boolean))];
}

function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countOccurrences(text: string, token: string): number {
  const matches = text.match(new RegExp(escapeRegExp(token), "g"));
  return matches?.length ?? 0;
}

function stripMarkdown(input: string): string {
  return input
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_`>#-]+/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function inferIndexLikeTitle(notePath: string, content: string): string {
  const headingMatch = /^#\s+(.+?)\s*$/m.exec(content);
  if (headingMatch?.[1]) {
    return headingMatch[1];
  }

  return path
    .posix.parse(notePath)
    .name.replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function buildSnippet(body: string, tokens: string[]): string {
  const plain = stripMarkdown(body);
  if (!plain) {
    return "";
  }

  const lower = plain.toLowerCase();
  let matchIndex = -1;
  for (const token of tokens) {
    const index = lower.indexOf(token);
    if (index !== -1 && (matchIndex === -1 || index < matchIndex)) {
      matchIndex = index;
    }
  }

  if (matchIndex === -1) {
    return plain.slice(0, 160);
  }

  const start = Math.max(0, matchIndex - 60);
  const end = Math.min(plain.length, matchIndex + 100);
  const prefix = start > 0 ? "..." : "";
  const suffix = end < plain.length ? "..." : "";

  return `${prefix}${plain.slice(start, end)}${suffix}`;
}

export function scoreTextQuery(input: {
  query: string;
  title: string;
  body: string;
  id?: string;
  aliases?: string[];
}): ScoredQuery {
  const query = input.query.trim().toLowerCase();
  const tokens = tokenize(query);

  if (tokens.length === 0) {
    return { score: 0, snippet: "" };
  }

  const title = input.title.toLowerCase();
  const body = input.body.toLowerCase();
  const id = input.id?.toLowerCase() ?? "";
  const aliases = (input.aliases ?? []).join(" ").toLowerCase();

  let score = 0;
  let matchedTokens = 0;

  for (const token of tokens) {
    const titleHits = countOccurrences(title, token);
    const idHits = countOccurrences(id, token);
    const aliasHits = countOccurrences(aliases, token);
    const bodyHits = countOccurrences(body, token);

    if (titleHits + idHits + aliasHits + bodyHits > 0) {
      matchedTokens += 1;
    }

    score += titleHits * 5;
    score += aliasHits * 4;
    score += idHits * 3;
    score += Math.min(bodyHits, 8);
  }

  if (matchedTokens === 0) {
    return { score: 0, snippet: "" };
  }

  if (title.includes(query)) {
    score += 4;
  }
  if (aliases.includes(query)) {
    score += 3;
  }
  if (body.includes(query)) {
    score += 2;
  }
  if (matchedTokens === tokens.length) {
    score += 2;
  }

  return {
    score,
    snippet: buildSnippet(input.body, tokens),
  };
}

async function existingPath(
  config: KnowledgeBasePluginConfig,
  relativePath: string,
): Promise<string[]> {
  try {
    await fs.stat(await resolveVaultPath(config, relativePath));
    return [relativePath];
  } catch {
    return [];
  }
}

async function resolveNotePaths(
  config: KnowledgeBasePluginConfig,
  types: KnowledgeBaseNoteType[],
): Promise<string[]> {
  const paths = getVaultPaths(config);
  const notePaths = (
    await Promise.all(
      types.map(async (type) => {
        switch (type) {
          case "source":
            return listMarkdownFiles(config, paths.sources);
          case "output":
            return listMarkdownFiles(config, paths.outputs);
          case "concept":
            return listMarkdownFiles(config, paths.concepts);
          case "entity":
            return listMarkdownFiles(config, paths.entities);
          case "synthesis":
            return listMarkdownFiles(config, paths.syntheses);
          case "index":
            return [
              ...(await listMarkdownFiles(config, paths.indexes)),
              ...(await existingPath(config, paths.index)),
            ];
          case "log":
            return existingPath(config, paths.log);
        }
      }),
    )
  ).flat();

  return [...new Set(notePaths)].sort();
}

async function loadSearchableDocuments(
  config: KnowledgeBasePluginConfig,
  types: KnowledgeBaseNoteType[],
): Promise<SearchableDocument[]> {
  const paths = getVaultPaths(config);
  const notePaths = await resolveNotePaths(config, types);
  const documents: SearchableDocument[] = [];

  for (const notePath of notePaths) {
    const content = await fs.readFile(await resolveVaultPath(config, notePath), "utf8");

    try {
      if (notePath.startsWith(`${paths.sources}/`)) {
        const { frontmatter, body } = parseSourceNoteMarkdown(content);
        documents.push({
          path: notePath,
          type: "source",
          id: frontmatter.id,
          title: frontmatter.title,
          aliases: [],
          body,
        });
        continue;
      }

      if (notePath.startsWith(`${paths.outputs}/`)) {
        const { frontmatter, body } = parseOutputNoteMarkdown(content);
        documents.push({
          path: notePath,
          type: "output",
          id: frontmatter.id,
          title: frontmatter.title,
          aliases: [],
          body,
        });
        continue;
      }

      if (
        notePath.startsWith(`${paths.concepts}/`) ||
        notePath.startsWith(`${paths.entities}/`) ||
        notePath.startsWith(`${paths.syntheses}/`)
      ) {
        const { frontmatter, body } = parseDerivedNoteMarkdown(content);
        documents.push({
          path: notePath,
          type: frontmatter.type,
          id: frontmatter.id,
          title: frontmatter.title,
          aliases: frontmatter.aliases,
          body,
        });
        continue;
      }

      documents.push({
        path: notePath,
        type: notePath === paths.log ? "log" : "index",
        id: notePath,
        title: inferIndexLikeTitle(notePath, content),
        aliases: [],
        body: content,
      });
    } catch {
      // Invalid notes are skipped here and surfaced by kb_lint instead.
    }
  }

  return documents;
}

export async function searchKnowledgeBase(
  config: KnowledgeBasePluginConfig,
  input: {
    query: string;
    limit?: number;
    types?: KnowledgeBaseNoteType[];
  },
): Promise<SearchResultItem[]> {
  const types: KnowledgeBaseNoteType[] =
    input.types && input.types.length > 0
      ? input.types
      : ["source", "output", "concept", "entity", "synthesis", "index"];
  const documents = await loadSearchableDocuments(config, types);

  return documents
    .map((document) => {
      const { score, snippet } = scoreTextQuery({
        query: input.query,
        title: document.title,
        body: document.body,
        id: document.id,
        aliases: document.aliases,
      });

      return {
        path: document.path,
        type: document.type,
        id: document.id,
        title: document.title,
        score,
        snippet,
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
    .slice(0, input.limit ?? 8);
}
