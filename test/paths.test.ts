import path from "node:path";

import { describe, expect, it } from "vitest";

import { resolveVaultPath, toVaultRelativePath } from "../src/core/paths.js";
import type { KnowledgeBasePluginConfig } from "../src/types.js";

const config: KnowledgeBasePluginConfig = {
  vaultRoot: path.resolve("/tmp/vault"),
  rawDir: "raw",
  wikiDir: "wiki",
  stateDir: ".llm-kb",
};

describe("paths", () => {
  it("normalizes safe relative paths", () => {
    expect(toVaultRelativePath("raw\\inbox\\a.md")).toBe("raw/inbox/a.md");
  });

  it("rejects traversal", () => {
    expect(() => toVaultRelativePath("../secrets.txt")).toThrow(/invalid_path/);
  });

  it("resolves a vault path under the root", async () => {
    const resolved = await resolveVaultPath(config, "raw/inbox/a.md");
    expect(resolved).toContain(path.join("tmp", "vault", "raw", "inbox", "a.md"));
  });
});
