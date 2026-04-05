#!/usr/bin/env node

import process from "node:process";

import { normalizeKnowledgeBaseConfig } from "./config.js";
import { createKnowledgeBaseMcpServer, type JsonRpcId, type JsonRpcRequest } from "./mcp.js";

type ParsedArgs = {
  vaultRoot?: string;
  rawDir?: string;
  wikiDir?: string;
  stateDir?: string;
  help: boolean;
};

const USAGE = `Usage: llm-knowledge-bases-mcp --vault-root <absolute-path> [--raw-dir raw] [--wiki-dir wiki] [--state-dir .llm-kb]

Runs the LLM Knowledge Bases MCP server over stdio so clients such as Claude Code
can call the kb_* tool surface.

Environment variable fallbacks:
  LLM_KB_VAULT_ROOT
  LLM_KB_RAW_DIR
  LLM_KB_WIKI_DIR
  LLM_KB_STATE_DIR
`;

function parseArgs(argv: string[]): ParsedArgs {
  const parsed: ParsedArgs = { help: false };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    switch (arg) {
      case "-h":
      case "--help":
        parsed.help = true;
        break;
      case "--vault-root":
        parsed.vaultRoot = argv[index + 1];
        index += 1;
        break;
      case "--raw-dir":
        parsed.rawDir = argv[index + 1];
        index += 1;
        break;
      case "--wiki-dir":
        parsed.wikiDir = argv[index + 1];
        index += 1;
        break;
      case "--state-dir":
        parsed.stateDir = argv[index + 1];
        index += 1;
        break;
      default:
        throw new Error(`Unknown option: ${arg}`);
    }
  }

  return parsed;
}

function writeUsage(): void {
  process.stderr.write(USAGE);
}

function writeMessage(message: unknown): void {
  const payload = JSON.stringify(message);
  process.stdout.write(`Content-Length: ${Buffer.byteLength(payload, "utf8")}\r\n\r\n${payload}`);
}

function writeJsonRpcError(id: JsonRpcId, code: number, message: string): void {
  writeMessage({
    jsonrpc: "2.0",
    id,
    error: { code, message },
  });
}

function fatal(error: unknown): never {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[llm-knowledge-bases-mcp] ${message}\n`);
  process.exit(1);
}

async function main(): Promise<void> {
  let parsedArgs: ParsedArgs;
  try {
    parsedArgs = parseArgs(process.argv.slice(2));
  } catch (error) {
    writeUsage();
    fatal(error);
  }

  if (parsedArgs.help) {
    process.stdout.write(USAGE);
    return;
  }

  const config = normalizeKnowledgeBaseConfig({
    vaultRoot: parsedArgs.vaultRoot ?? process.env.LLM_KB_VAULT_ROOT,
    rawDir: parsedArgs.rawDir ?? process.env.LLM_KB_RAW_DIR,
    wikiDir: parsedArgs.wikiDir ?? process.env.LLM_KB_WIKI_DIR,
    stateDir: parsedArgs.stateDir ?? process.env.LLM_KB_STATE_DIR,
  });

  const server = createKnowledgeBaseMcpServer(config);
  let buffer = Buffer.alloc(0);
  let processing = Promise.resolve();

  const processBuffer = async (): Promise<void> => {
    while (true) {
      const headerEnd = buffer.indexOf("\r\n\r\n");
      if (headerEnd === -1) {
        return;
      }

      const header = buffer.subarray(0, headerEnd).toString("utf8");
      const contentLengthMatch = /Content-Length:\s*(\d+)/i.exec(header);
      if (!contentLengthMatch) {
        throw new Error("Malformed MCP message: missing Content-Length header");
      }

      const contentLength = Number(contentLengthMatch[1]);
      const bodyStart = headerEnd + 4;
      const bodyEnd = bodyStart + contentLength;
      if (buffer.length < bodyEnd) {
        return;
      }

      const body = buffer.subarray(bodyStart, bodyEnd).toString("utf8");
      buffer = buffer.subarray(bodyEnd);

      let request: JsonRpcRequest;
      try {
        request = JSON.parse(body) as JsonRpcRequest;
      } catch (error) {
        writeJsonRpcError(null, -32700, error instanceof Error ? error.message : "Parse error");
        continue;
      }

      const response = await server.handleRequest(request);
      if (response) {
        writeMessage(response);
      }
    }
  };

  process.stdin.on("data", (chunk: Buffer) => {
    buffer = Buffer.concat([buffer, chunk]);
    processing = processing.then(processBuffer).catch(fatal);
  });

  process.stdin.on("end", () => {
    process.exit(0);
  });

  process.stdin.on("error", fatal);
}

main().catch(fatal);
