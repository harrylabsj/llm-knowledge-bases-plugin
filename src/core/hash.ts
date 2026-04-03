import { createHash } from "node:crypto";
import fs from "node:fs/promises";

export function hashText(content: string): string {
  return `sha256:${createHash("sha256").update(content, "utf8").digest("hex")}`;
}

export async function hashFile(filePath: string): Promise<string> {
  const content = await fs.readFile(filePath);
  return `sha256:${createHash("sha256").update(content).digest("hex")}`;
}
