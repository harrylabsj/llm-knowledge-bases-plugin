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

  it("parses comma-separated representation kinds for kb_read_representations", () => {
    expect(
      parseStandaloneCliArgs([
        "kb_read_representations",
        "--vault-root",
        "/vault",
        "--raw-path",
        "raw/papers/report.pdf",
        "--kinds",
        "ocr_text,metadata",
      ]),
    ).toMatchObject({
      commandName: "kb_read_representations",
      commandOptions: {
        rawPath: "raw/papers/report.pdf",
        kinds: "ocr_text,metadata",
      },
    });
  });

  it("parses kb_prepare_source_bundle with a raw-path argument", () => {
    expect(
      parseStandaloneCliArgs([
        "kb_prepare_source_bundle",
        "--vault-root",
        "/vault",
        "--raw-path",
        "raw/papers/report.pdf",
      ]),
    ).toMatchObject({
      commandName: "kb_prepare_source_bundle",
      commandOptions: {
        rawPath: "raw/papers/report.pdf",
      },
    });
  });

  it("parses kb_repair_source_ids with an apply flag", () => {
    expect(
      parseStandaloneCliArgs([
        "kb_repair_source_ids",
        "--vault-root",
        "/vault",
        "--apply",
      ]),
    ).toMatchObject({
      commandName: "kb_repair_source_ids",
      commandOptions: {
        apply: true,
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

  it("runs kb_prepare_representation from the standalone CLI", async () => {
    const vaultRoot = await createTempVault();
    const stdout = createBufferTarget();
    const stderr = createBufferTarget();

    const exitCode = await runStandaloneKnowledgeBaseCli(
      [
        "kb_prepare_representation",
        "--vault-root",
        vaultRoot,
        "--raw-path",
        "raw/inbox/example-note.md",
        "--kind",
        "native_text",
      ],
      {
        stdout: stdout.target,
        stderr: stderr.target,
      },
    );

    expect(exitCode).toBe(0);
    expect(stderr.read()).toBe("");
    expect(JSON.parse(stdout.read())).toMatchObject({
      doc_id: "src-example-note",
      raw_path: "raw/inbox/example-note.md",
      kind: "native_text",
      representation_path: ".llm-kb/representations/src-example-note/native-text.md",
    });
  });

  it("runs kb_get_raw_asset from the standalone CLI", async () => {
    const vaultRoot = await createTempVault();
    const stdout = createBufferTarget();
    const stderr = createBufferTarget();

    const exitCode = await runStandaloneKnowledgeBaseCli(
      [
        "kb_get_raw_asset",
        "--vault-root",
        vaultRoot,
        "--raw-path",
        "raw/inbox/example-note.md",
      ],
      {
        stdout: stdout.target,
        stderr: stderr.target,
      },
    );

    expect(exitCode).toBe(0);
    expect(stderr.read()).toBe("");
    expect(JSON.parse(stdout.read())).toMatchObject({
      raw_path: "raw/inbox/example-note.md",
      raw_kind: "text",
      mime_type: "text/markdown",
      absolute_path: path.join(vaultRoot, "raw", "inbox", "example-note.md"),
    });
  });
});
