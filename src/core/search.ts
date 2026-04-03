import fs from "node:fs/promises";

import type { KnowledgeBasePluginConfig, SearchResultItem } from "../types.js";
import { parseOutputNoteMarkdown, parseSourceNoteMarkdown } from "./frontmatter.js";
import { listMarkdownFiles } from "./notes.js";
import { getVaultPaths, resolveVaultPath } from "./paths.js";

type SearchableDocument = {
  path: string;
  type: "source" | "output";
  id: string;
  title: string;
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
}): ScoredQuery {
  const query = input.query.trim().toLowerCase();
  const tokens = tokenize(query);

  if (tokens.length === 0) {
    return { score: 0, snippet: "" };
  }

  const title = input.title.toLowerCase();
  const body = input.body.toLowerCase();
  const id = input.id?.toLowerCase() ?? "";

  let score = 0;
  let matchedTokens = 0;

  for (const token of tokens) {
    const titleHits = countOccurrences(title, token);
    const idHits = countOccurrences(id, token);
    const bodyHits = countOccurrences(body, token);

    if (titleHits + idHits + bodyHits > 0) {
      matchedTokens += 1;
    }

    score += titleHits * 5;
    score += idHits * 3;
    score += Math.min(bodyHits, 8);
  }

  if (matchedTokens === 0) {
    return { score: 0, snippet: "" };
  }

  if (title.includes(query)) {
    score += 4;
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

async function loadSearchableDocuments(
  config: KnowledgeBasePluginConfig,
  types: Array<"source" | "output">,
): Promise<SearchableDocument[]> {
  const paths = getVaultPaths(config);
  const notePaths = (
    await Promise.all(
      types.map((type) => listMarkdownFiles(config, type === "source" ? paths.sources : paths.outputs)),
    )
  ).flat();

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
          body,
        });
        continue;
      }

      const { frontmatter, body } = parseOutputNoteMarkdown(content);
      documents.push({
        path: notePath,
        type: "output",
        id: frontmatter.id,
        title: frontmatter.title,
        body,
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
    types?: Array<"source" | "output">;
  },
): Promise<SearchResultItem[]> {
  const types: Array<"source" | "output"> =
    input.types && input.types.length > 0 ? input.types : ["source", "output"];
  const documents = await loadSearchableDocuments(config, types);

  return documents
    .map((document) => {
      const { score, snippet } = scoreTextQuery({
        query: input.query,
        title: document.title,
        body: document.body,
        id: document.id,
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
