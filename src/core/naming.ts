import type { DerivedNoteKind } from "../types.js";

import { slugify } from "./slug.js";

export function currentOutputDateStamp(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10);
}

export function buildOutputStem(title: string, dateStamp: string): string {
  return `${dateStamp}-${slugify(title)}`;
}

export function buildOutputId(title: string, dateStamp: string): string {
  return `out-${buildOutputStem(title, dateStamp)}`;
}

export function buildOutputPath(outputsDir: string, title: string, dateStamp: string): string {
  return `${outputsDir}/${buildOutputStem(title, dateStamp)}.md`;
}

export function buildOutputPathFromId(outputsDir: string, outputId: string): string {
  if (!outputId.startsWith("out-")) {
    throw new Error(`validation_error: invalid output id "${outputId}"`);
  }

  return `${outputsDir}/${outputId.slice(4)}.md`;
}

export function parseOutputId(
  outputId: string,
): {
  dateStamp: string;
  slug: string;
} | null {
  const match = /^out-(\d{4}-\d{2}-\d{2})-([a-z0-9][a-z0-9-]*)$/.exec(outputId);
  if (!match) {
    return null;
  }

  return {
    dateStamp: match[1],
    slug: match[2],
  };
}

export function buildDerivedNoteId(kind: DerivedNoteKind, title: string): string {
  return `${kind}-${slugify(title)}`;
}

export function buildDerivedNotePath(dir: string, noteId: string): string {
  return `${dir}/${noteId}.md`;
}
