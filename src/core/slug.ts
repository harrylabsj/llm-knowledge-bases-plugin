import { createHash } from "node:crypto";

const MAX_SLUG_LENGTH = 80;
const NON_ASCII_SLUG_HASH_LENGTH = 12;

function buildAsciiSlug(input: string): string {
  return input
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-")
    .slice(0, MAX_SLUG_LENGTH);
}

function hasMeaningfulCharacters(input: string): boolean {
  return /[\p{Letter}\p{Number}]/u.test(input);
}

function buildNonAsciiFallback(input: string): string {
  const digest = createHash("sha256").update(input.trim(), "utf8").digest("hex");
  return `u-${digest.slice(0, NON_ASCII_SLUG_HASH_LENGTH)}`;
}

export function slugify(input: string): string {
  const normalized = buildAsciiSlug(input);
  if (normalized) {
    return normalized;
  }

  if (hasMeaningfulCharacters(input)) {
    return buildNonAsciiFallback(input);
  }

  return "untitled";
}
