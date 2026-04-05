function escapeRegExp(input: string): string {
  return input.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function stripMarkdown(input: string): string {
  return input
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_`>#-]+/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, (_, target: string, label?: string) =>
      label ?? target,
    )
    .replace(/\s+/g, " ")
    .trim();
}

export function truncateText(input: string, maxLength = 140): string {
  if (input.length <= maxLength) {
    return input;
  }
  return `${input.slice(0, maxLength - 3).trimEnd()}...`;
}

export function extractSection(body: string, heading: string): string {
  const lines = body.split("\n");
  const headingPattern = new RegExp(`^#\\s+${escapeRegExp(heading)}\\s*$`);

  let startIndex = -1;
  for (let index = 0; index < lines.length; index += 1) {
    if (headingPattern.test(lines[index]?.trim() ?? "")) {
      startIndex = index + 1;
      break;
    }
  }

  if (startIndex < 0) {
    return "";
  }

  let endIndex = lines.length;
  for (let index = startIndex; index < lines.length; index += 1) {
    if (/^#\s+.+$/.test(lines[index]?.trim() ?? "")) {
      endIndex = index;
      break;
    }
  }

  return lines.slice(startIndex, endIndex).join("\n").trim();
}

export function extractExcerpt(body: string): string {
  for (const heading of ["Summary", "Answer"]) {
    const preferred = extractSection(body, heading);
    if (preferred) {
      return truncateText(stripMarkdown(preferred));
    }
  }

  const plain = stripMarkdown(body);
  if (!plain) {
    return "";
  }

  return truncateText(plain);
}

export function extractWikiLinks(markdown: string): Array<{ target: string; label: string }> {
  const results: Array<{ target: string; label: string }> = [];
  const pattern = /\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g;

  for (const match of markdown.matchAll(pattern)) {
    const target = match[1]?.trim();
    const label = (match[2] ?? match[1] ?? "").trim();
    if (!target || !label) {
      continue;
    }
    results.push({ target, label });
  }

  return results;
}
