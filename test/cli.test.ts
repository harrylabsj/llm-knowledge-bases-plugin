import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { parseStandaloneCliArgs, runStandaloneKnowledgeBaseCli } from "../src/cli.js";

const tempRoots: string[] = [];

async function createTempVault(): Promise<string> {
  const vaultRoot = await fs.mkdtemp(path.join(os.tmpdir(), "llm-kb-cli-"));
  tempRoots.push(vaultRoot);

  await fs.mkdir(path.join(vaultRoot, "raw", "inbox"), { recursive: true });
  await fs.writeFile(
    path.join(vaultRoot, "raw", "inbox", "example-note.md"),
    "# Example Raw\n\nImportant point.\n",
    "utf8",
  );

  return vaultRoot;
}

afterEach(async () => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      await fs.rm(root, { recursive: true, force: true });
    }
  }
});

function createBufferTarget() {
  let text = "";
  return {
    target: {
      write(chunk: string) {
        text += chunk;
        return true;
      },
    },
    read() {
      return text;
    },
  };
}

describe("standalone CLI", () => {
  it("maps kebab-case aliases onto the kb_* command set", () => {
    expect(parseStandaloneCliArgs(["status", "--vault-root", "/vault"])).toMatchObject({
      commandName: "kb_status",
      config: {
        vaultRoot: "/vault",
      },
    });
  });

  it("accepts markdown values that start with frontmatter fences", () => {
    expect(
      parseStandaloneCliArgs([
        "kb_upsert_output",
        "--vault-root",
        "/vault",
        "--markdown",
        "---\nid: out-123\n---",
      ]),
    ).toMatchObject({
      commandName: "kb_upsert_output",
      commandOptions: {
        markdown: "---\nid: out-123\n---",
      },
    });
  });

  it("runs kb_status against a vault using env fallback config", async () => {
    const vaultRoot = await createTempVault();
    const stdout = createBufferTarget();
    const stderr = createBufferTarget();

    const exitCode = await runStandaloneKnowledgeBaseCli(["kb_status"], {
      stdout: stdout.target,
      stderr: stderr.target,
      env: {
        ...process.env,
        LLM_KB_VAULT_ROOT: vaultRoot,
      },
    });

    expect(exitCode).toBe(0);
    expect(stderr.read()).toBe("");
    expect(JSON.parse(stdout.read())).toMatchObject({
      vault_root: vaultRoot,
      raw_count: 1,
    });
  });
});
