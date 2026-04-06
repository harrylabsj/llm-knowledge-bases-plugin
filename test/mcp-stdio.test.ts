import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { createKnowledgeBaseMcpServer } from "../src/mcp.js";
import {
  createStdioJsonRpcSession,
  serializeContentLengthMessage,
  serializeLineMessage,
} from "../src/mcp-stdio.js";
import type { KnowledgeBasePluginConfig } from "../src/types.js";

const tempRoots: string[] = [];

async function createTempVault(): Promise<KnowledgeBasePluginConfig> {
  const vaultRoot = await fs.mkdtemp(path.join(os.tmpdir(), "openclaw-llm-kb-mcp-stdio-"));
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

function parseContentLengthResponse(payload: string): unknown {
  const headerEnd = payload.indexOf("\r\n\r\n");
  expect(headerEnd).toBeGreaterThan(-1);

  const header = payload.slice(0, headerEnd);
  const match = /Content-Length:\s*(\d+)/i.exec(header);
  expect(match?.[1]).toBeTruthy();

  const contentLength = Number(match?.[1]);
  const body = payload.slice(headerEnd + 4, headerEnd + 4 + contentLength);
  return JSON.parse(body);
}

afterEach(async () => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) {
      await fs.rm(root, { recursive: true, force: true });
    }
  }
});

describe("stdio MCP framing", () => {
  it("accepts newline-delimited JSON-RPC and responds with newline framing", async () => {
    const config = await createTempVault();
    const writes: string[] = [];
    const session = createStdioJsonRpcSession(createKnowledgeBaseMcpServer(config), {
      write(payload) {
        writes.push(payload);
      },
    });

    const initialize = serializeLineMessage({
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "vitest", version: "1.0.0" },
      },
    });

    await session.feed(Buffer.from(initialize.slice(0, initialize.length - 1), "utf8"));
    expect(writes).toEqual([]);

    await session.feed(Buffer.from("\n", "utf8"));
    expect(session.getFraming()).toBe("line");
    expect(writes).toHaveLength(1);
    expect(writes[0]?.startsWith("Content-Length:")).toBe(false);

    const initializeResponse = JSON.parse(writes[0].trim());
    expect(initializeResponse).toMatchObject({
      jsonrpc: "2.0",
      id: 1,
      result: {
        serverInfo: {
          name: "llm-knowledge-bases-mcp",
        },
      },
    });

    writes.length = 0;
    await session.feed(
      Buffer.from(
        serializeLineMessage({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/list",
        }),
        "utf8",
      ),
    );

    const toolsListResponse = JSON.parse(writes[0].trim());
    expect(toolsListResponse).toMatchObject({
      jsonrpc: "2.0",
      id: 2,
      result: {
        tools: expect.arrayContaining([expect.objectContaining({ name: "kb_status" })]),
      },
    });
  });

  it("still accepts Content-Length framing and mirrors it in responses", async () => {
    const config = await createTempVault();
    const writes: string[] = [];
    const session = createStdioJsonRpcSession(createKnowledgeBaseMcpServer(config), {
      write(payload) {
        writes.push(payload);
      },
    });

    const request = serializeContentLengthMessage({
      jsonrpc: "2.0",
      id: 7,
      method: "initialize",
      params: {
        protocolVersion: "2025-03-26",
        capabilities: {},
        clientInfo: { name: "vitest", version: "1.0.0" },
      },
    });

    await session.feed(Buffer.from(request.slice(0, 24), "utf8"));
    expect(writes).toEqual([]);

    await session.feed(Buffer.from(request.slice(24), "utf8"));
    expect(session.getFraming()).toBe("content-length");
    expect(writes).toHaveLength(1);
    expect(writes[0]?.startsWith("Content-Length:")).toBe(true);

    expect(parseContentLengthResponse(writes[0])).toMatchObject({
      jsonrpc: "2.0",
      id: 7,
      result: {
        serverInfo: {
          name: "llm-knowledge-bases-mcp",
        },
      },
    });
  });
});
