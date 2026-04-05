import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createKnowledgeBaseMcpServer, listKnowledgeBaseMcpTools } from "../src/mcp.js";
import type { KnowledgeBasePluginConfig } from "../src/types.js";

const tempRoots: string[] = [];

async function createTempVault(): Promise<KnowledgeBasePluginConfig> {
  const vaultRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-llm-kb-mcp-"));
  tempRoots.push(vaultRoot);

  await fs.mkdir(path.join(vaultRoot, "raw", "inbox"), { recursive: true });
  await fs.writeFile(
    path.join(vaultRoot, "raw", "inbox", "example-note.md"),
    "# Example Raw\n\nImportant point.\n",
    "utf8",
  );

  return {
    vaultRoot,
    rawDir: "raw",
    wikiDir: "wiki",
    stateDir: ".llm-kb",
  };
}

afterEach(async () => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      await fs.rm(root, { recursive: true, force: true });
    }
  }
});

describe("knowledge base MCP server", () => {
  it("lists the kb tool surface for MCP clients", async () => {
    const tools = listKnowledgeBaseMcpTools();
    expect(tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining([
        "kb_status",
        "kb_list_raw",
        "kb_read_raw",
        "kb_get_raw_asset",
        "kb_prepare_source",
        "kb_prepare_source_bundle",
        "kb_prepare_representation",
        "kb_upsert_representation",
        "kb_read_representations",
        "kb_upsert_source_note",
        "kb_prepare_output",
        "kb_prepare_derived_note",
        "kb_upsert_output",
        "kb_upsert_derived_note",
        "kb_rebuild_indexes",
        "kb_search",
        "kb_read_notes",
        "kb_map_gaps",
        "kb_promote_gap",
        "kb_lint",
      ]),
    );
  });

  it("handles initialize, tools/list, and tools/call requests", async () => {
    const config = await createTempVault();
    const server = createKnowledgeBaseMcpServer(config);

    const initialize = await server.handleRequest({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "vitest", version: "1.0.0" },
      },
    });

    expect(initialize).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        protocolVersion: "2025-03-26",
        capabilities: {
          tools: {
            listChanged: false,
          },
        },
        serverInfo: {
          name: "llm-knowledge-bases-mcp",
        },
      },
    });

    const listedTools = await server.handleRequest({
      jsonrpc: "2.0",
      id: 2,
      method: "tools/list",
    });

    expect(listedTools).toMatchObject({
      jsonrpc: "2.0",
      id: 2,
      result: {
        tools: expect.arrayContaining([
          expect.objectContaining({ name: "kb_status" }),
          expect.objectContaining({ name: "kb_search" }),
        ]),
      },
    });

    const statusResult = await server.handleRequest({
      jsonrpc: "2.0",
      id: 3,
      method: "tools/call",
      params: {
        name: "kb_status",
        arguments: {},
      },
    });

    expect(statusResult).toMatchObject({
      jsonrpc: "2.0",
      id: 3,
      result: {
        isError: false,
        structuredContent: expect.objectContaining({
          vault_root: config.vaultRoot,
          raw_count: 1,
        }),
      },
    });

    const prepareRepresentationResult = await server.handleRequest({
      jsonrpc: "2.0",
      id: 5,
      method: "tools/call",
      params: {
        name: "kb_prepare_representation",
        arguments: {
          raw_path: "raw/inbox/example-note.md",
          kind: "native_text",
        },
      },
    });

    expect(prepareRepresentationResult).toMatchObject({
      jsonrpc: "2.0",
      id: 5,
      result: {
        isError: false,
        structuredContent: expect.objectContaining({
          doc_id: "src-example-note",
          raw_path: "raw/inbox/example-note.md",
          kind: "native_text",
          representation_path: ".llm-kb/representations/src-example-note/native-text.md",
        }),
      },
    });

    const sourceBundleResult = await server.handleRequest({
      jsonrpc: "2.0",
      id: 6,
      method: "tools/call",
      params: {
        name: "kb_prepare_source_bundle",
        arguments: {
          raw_path: "raw/inbox/example-note.md",
        },
      },
    });

    expect(sourceBundleResult).toMatchObject({
      jsonrpc: "2.0",
      id: 6,
      result: {
        isError: false,
        structuredContent: expect.objectContaining({
          doc_id: "src-example-note",
          source_note_path: "wiki/sources/src-example-note.md",
          compile_readiness: "ready",
        }),
      },
    });
  });

  it("returns tool-level errors instead of crashing the server", async () => {
    const config = await createTempVault();
    const server = createKnowledgeBaseMcpServer(config);

    const result = await server.handleRequest({
      jsonrpc: "2.0",
      id: 4,
      method: "tools/call",
      params: {
        name: "kb_read_raw",
        arguments: {},
      },
    });

    expect(result).toMatchObject({
      jsonrpc: "2.0",
      id: 4,
      result: {
        isError: true,
        content: [expect.objectContaining({ type: "text" })],
      },
    });
  });
});
