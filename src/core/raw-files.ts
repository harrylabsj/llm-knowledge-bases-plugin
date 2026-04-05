import path from "node:path";

import type { RawKind, SupportedRawExtension } from "../types.js";

export type SupportedRawFileInfo = {
  ext: SupportedRawExtension;
  rawKind: RawKind;
  mimeType: string;
  sourceKindGuess: string;
  textReadable: boolean;
};

const RAW_FILE_INFO_BY_EXTENSION: Record<SupportedRawExtension, SupportedRawFileInfo> = {
  ".md": {
    ext: ".md",
    rawKind: "text",
    mimeType: "text/markdown",
    sourceKindGuess: "raw_markdown",
    textReadable: true,
  },
  ".txt": {
    ext: ".txt",
    rawKind: "text",
    mimeType: "text/plain",
    sourceKindGuess: "raw_text",
    textReadable: true,
  },
  ".pdf": {
    ext: ".pdf",
    rawKind: "pdf",
    mimeType: "application/pdf",
    sourceKindGuess: "raw_pdf",
    textReadable: false,
  },
  ".png": {
    ext: ".png",
    rawKind: "image",
    mimeType: "image/png",
    sourceKindGuess: "raw_image",
    textReadable: false,
  },
  ".jpg": {
    ext: ".jpg",
    rawKind: "image",
    mimeType: "image/jpeg",
    sourceKindGuess: "raw_image",
    textReadable: false,
  },
  ".jpeg": {
    ext: ".jpeg",
    rawKind: "image",
    mimeType: "image/jpeg",
    sourceKindGuess: "raw_image",
    textReadable: false,
  },
  ".webp": {
    ext: ".webp",
    rawKind: "image",
    mimeType: "image/webp",
    sourceKindGuess: "raw_image",
    textReadable: false,
  },
  ".gif": {
    ext: ".gif",
    rawKind: "image",
    mimeType: "image/gif",
    sourceKindGuess: "raw_image",
    textReadable: false,
  },
  ".svg": {
    ext: ".svg",
    rawKind: "image",
    mimeType: "image/svg+xml",
    sourceKindGuess: "raw_image",
    textReadable: false,
  },
  ".csv": {
    ext: ".csv",
    rawKind: "data",
    mimeType: "text/csv",
    sourceKindGuess: "raw_csv",
    textReadable: true,
  },
  ".tsv": {
    ext: ".tsv",
    rawKind: "data",
    mimeType: "text/tab-separated-values",
    sourceKindGuess: "raw_tsv",
    textReadable: true,
  },
  ".json": {
    ext: ".json",
    rawKind: "data",
    mimeType: "application/json",
    sourceKindGuess: "raw_json",
    textReadable: true,
  },
  ".html": {
    ext: ".html",
    rawKind: "data",
    mimeType: "text/html",
    sourceKindGuess: "raw_html",
    textReadable: true,
  },
};

export function getSupportedRawFileInfo(rawPath: string): SupportedRawFileInfo | null {
  const ext = path.posix.extname(rawPath).toLowerCase() as SupportedRawExtension;
  return RAW_FILE_INFO_BY_EXTENSION[ext] ?? null;
}

export function listSupportedRawExtensions(): SupportedRawExtension[] {
  return Object.keys(RAW_FILE_INFO_BY_EXTENSION).sort() as SupportedRawExtension[];
}
