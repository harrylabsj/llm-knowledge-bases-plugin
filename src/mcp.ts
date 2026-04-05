import type { KnowledgeBasePluginConfig } from "./types.js";
import { kbLint } from "./tools/kb_lint.js";
import { kbListRaw } from "./tools/kb_list_raw.js";
import { kbMapGaps } from "./tools/kb_map_gaps.js";
import { kbPrepareDerivedNote } from "./tools/kb_prepare_derived_note.js";
import { kbPrepareOutput } from "./tools/kb_prepare_output.js";
import { kbPrepareSource } from "./tools/kb_prepare_source.js";
import { kbPromoteGap } from "./tools/kb_promote_gap.js";
import { kbReadNotes } from "./tools/kb_read_notes.js";
import { kbReadRaw } from "./tools/kb_read_raw.js";
import { kbRebuildIndexes } from "./tools/kb_rebuild_indexes.js";
import { kbSearch } from "./tools/kb_search.js";
import { kbStatus } from "./tools/kb_status.js";
import { kbUpsertDerivedNote } from "./tools/kb_upsert_derived_note.js";
import { kbUpsertOutput } from "./tools/kb_upsert_output.js";
import { kbUpsertSourceNote } from "./tools/kb_upsert_source_note.js";

export type JsonRpcId = string | number | null;

export type JsonRpcRequest = {
  jsonrpc?: string;
  id?: JsonRpcId;
  method?: string;
  params?: unknown;
};

export type JsonRpcResponse = {
  jsonrpc: "2.0";
  id: JsonRpcId;
  result?: unknown;
  error?: {
    code: number;
    message: string;
    data?: unknown;
  };
};

type JsonSchema = Record<string, unknown>;

type McpTool = {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonSchema;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
};

type McpCallToolResult = {
  content: Array<{
    type: "text";
    text: string;
  }>;
  structuredContent?: unknown;
  isError?: boolean;
};

type ToolHandler = (config: KnowledgeBasePluginConfig, args: Record<string, unknown>) => Promise<unknown>;

type ToolDefinition = {
  tool: McpTool;
  handler: ToolHandler;
};

const SERVER_NAME = "llm-knowledge-bases-mcp";
const SERVER_VERSION = "0.3.1";
const FALLBACK_PROTOCOL_VERSION = "2025-03-26";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function textToolResult(text: string, options?: { isError?: boolean }): McpCallToolResult {
  return {
    content: [{ type: "text", text }],
    isError: options?.isError ?? false,
  };
}

function structuredToolResult(result: unknown): McpCallToolResult {
  return {
    content: [
      {
        type: "text",
        text: JSON.stringify(result, null, 2),
      },
    ],
    structuredContent: result,
    isError: false,
  };
}

function jsonRpcError(id: JsonRpcId, code: number, message: string, data?: unknown): JsonRpcResponse {
  return {
    jsonrpc: "2.0",
    id,
    error: {
      code,
      message,
      ...(data === undefined ? {} : { data }),
    },
  };
}

const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    tool: {
      name: "kb_status",
      title: "KB Status",
      description: "Show vault status, path layout, and how many raw files still need compilation.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    handler: async (config) => kbStatus(config),
  },
  {
    tool: {
      name: "kb_list_raw",
      title: "KB List Raw",
      description: "List raw Markdown or text files in the managed vault, optionally filtering to changed items only.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          changed_only: { type: "boolean" },
          limit: { type: "integer", minimum: 1 },
        },
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    handler: async (config, args) =>
      kbListRaw(config, {
        changed_only: typeof args.changed_only === "boolean" ? args.changed_only : undefined,
        limit: typeof args.limit === "number" ? args.limit : undefined,
      }),
  },
  {
    tool: {
      name: "kb_read_raw",
      title: "KB Read Raw",
      description: "Read one raw file from the managed vault and return its content plus the current raw hash.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["raw_path"],
        properties: {
          raw_path: { type: "string" },
        },
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    handler: async (config, args) => {
      if (typeof args.raw_path !== "string") {
        throw new Error("validation_error: raw_path is required");
      }
      return kbReadRaw(config, { raw_path: args.raw_path });
    },
  },
  {
    tool: {
      name: "kb_prepare_source",
      title: "KB Prepare Source",
      description: "Resolve the canonical source note id and target path for a raw file before writing a source note.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["raw_path"],
        properties: {
          raw_path: { type: "string" },
        },
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    handler: async (config, args) => {
      if (typeof args.raw_path !== "string") {
        throw new Error("validation_error: raw_path is required");
      }
      return kbPrepareSource(config, { raw_path: args.raw_path });
    },
  },
  {
    tool: {
      name: "kb_upsert_source_note",
      title: "KB Upsert Source Note",
      description: "Validate and write a source note, then update the manifest entry for its raw file.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["raw_path", "markdown"],
        properties: {
          raw_path: { type: "string" },
          markdown: { type: "string" },
        },
      },
    },
    handler: async (config, args) => {
      if (typeof args.raw_path !== "string") {
        throw new Error("validation_error: raw_path is required");
      }
      if (typeof args.markdown !== "string") {
        throw new Error("validation_error: markdown is required");
      }
      return kbUpsertSourceNote(config, {
        raw_path: args.raw_path,
        markdown: args.markdown,
      });
    },
  },
  {
    tool: {
      name: "kb_prepare_output",
      title: "KB Prepare Output",
      description: "Resolve the canonical output id and target path for an archived answer note.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["title", "query"],
        properties: {
          title: { type: "string" },
          query: { type: "string" },
        },
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    handler: async (config, args) => {
      if (typeof args.title !== "string") {
        throw new Error("validation_error: title is required");
      }
      if (typeof args.query !== "string") {
        throw new Error("validation_error: query is required");
      }
      return kbPrepareOutput(config, {
        title: args.title,
        query: args.query,
      });
    },
  },
  {
    tool: {
      name: "kb_prepare_derived_note",
      title: "KB Prepare Derived Note",
      description: "Resolve the canonical id and target path for a concept, entity, or synthesis note.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "title"],
        properties: {
          kind: {
            type: "string",
            enum: ["concept", "entity", "synthesis"],
          },
          title: { type: "string" },
        },
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    handler: async (config, args) => {
      if (typeof args.kind !== "string") {
        throw new Error("validation_error: kind is required");
      }
      if (typeof args.title !== "string") {
        throw new Error("validation_error: title is required");
      }
      return kbPrepareDerivedNote(config, {
        kind: args.kind,
        title: args.title,
      });
    },
  },
  {
    tool: {
      name: "kb_upsert_output",
      title: "KB Upsert Output",
      description: "Validate and write an archived answer note under wiki/outputs/.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["markdown"],
        properties: {
          markdown: { type: "string" },
        },
      },
    },
    handler: async (config, args) => {
      if (typeof args.markdown !== "string") {
        throw new Error("validation_error: markdown is required");
      }
      return kbUpsertOutput(config, { markdown: args.markdown });
    },
  },
  {
    tool: {
      name: "kb_upsert_derived_note",
      title: "KB Upsert Derived Note",
      description: "Validate and write a concept, entity, or synthesis note under the managed wiki.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["markdown"],
        properties: {
          markdown: { type: "string" },
        },
      },
    },
    handler: async (config, args) => {
      if (typeof args.markdown !== "string") {
        throw new Error("validation_error: markdown is required");
      }
      return kbUpsertDerivedNote(config, { markdown: args.markdown });
    },
  },
  {
    tool: {
      name: "kb_rebuild_indexes",
      title: "KB Rebuild Indexes",
      description: "Regenerate the deterministic wiki index, log, and collection index notes for the knowledge base.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
      },
    },
    handler: async (config) => kbRebuildIndexes(config),
  },
  {
    tool: {
      name: "kb_search",
      title: "KB Search",
      description: "Search source, output, concept, entity, synthesis, index, and log notes using lightweight text scoring.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["query"],
        properties: {
          query: { type: "string" },
          limit: { type: "integer", minimum: 1 },
          types: {
            type: "array",
            items: {
              type: "string",
              enum: ["source", "output", "concept", "entity", "synthesis", "index", "log"],
            },
          },
        },
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    handler: async (config, args) => {
      const query = args.query;
      const limit = args.limit;
      const types = args.types;

      if (typeof query !== "string") {
        throw new Error("validation_error: query is required");
      }

      return kbSearch(config, {
        query,
        limit: typeof limit === "number" ? limit : undefined,
        types: Array.isArray(types)
          ? types.filter(
              (
                type,
              ): type is
                | "source"
                | "output"
                | "concept"
                | "entity"
                | "synthesis"
                | "index"
                | "log" =>
                type === "source" ||
                type === "output" ||
                type === "concept" ||
                type === "entity" ||
                type === "synthesis" ||
                type === "index" ||
                type === "log",
            )
          : undefined,
      });
    },
  },
  {
    tool: {
      name: "kb_read_notes",
      title: "KB Read Notes",
      description: "Read wiki notes through the managed knowledge-base boundary, including derived notes, indexes, and the run log.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        required: ["paths"],
        properties: {
          paths: {
            type: "array",
            items: { type: "string" },
            minItems: 1,
            maxItems: 10,
          },
        },
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    handler: async (config, args) => {
      if (!Array.isArray(args.paths) || args.paths.some((item) => typeof item !== "string")) {
        throw new Error("validation_error: paths is required");
      }
      return kbReadNotes(config, { paths: args.paths });
    },
  },
  {
    tool: {
      name: "kb_map_gaps",
      title: "KB Map Gaps",
      description: "Report the highest-value missing concept, entity, and synthesis pages suggested by the current wiki.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          limit: { type: "integer", minimum: 1 },
        },
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    handler: async (config, args) =>
      kbMapGaps(config, {
        limit: typeof args.limit === "number" ? args.limit : undefined,
      }),
  },
  {
    tool: {
      name: "kb_promote_gap",
      title: "KB Promote Gap",
      description: "Promote one current gap candidate into a real derived note using the shared gap draft logic.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
        properties: {
          note_id: { type: "string" },
          kind: { type: "string", enum: ["concept", "entity", "synthesis"] },
          title: { type: "string" },
        },
        anyOf: [
          { required: ["note_id"] },
          { required: ["kind", "title"] },
        ],
      },
    },
    handler: async (config, args) =>
      kbPromoteGap(config, {
        note_id: typeof args.note_id === "string" ? args.note_id : undefined,
        kind: typeof args.kind === "string" ? args.kind : undefined,
        title: typeof args.title === "string" ? args.title : undefined,
      }),
  },
  {
    tool: {
      name: "kb_lint",
      title: "KB Lint",
      description: "Run deterministic structure checks plus wiki-health warnings for the managed knowledge base without writing fixes.",
      inputSchema: {
        type: "object",
        additionalProperties: false,
      },
      annotations: {
        readOnlyHint: true,
        idempotentHint: true,
      },
    },
    handler: async (config) => kbLint(config),
  },
];

const TOOL_BY_NAME = new Map(TOOL_DEFINITIONS.map((entry) => [entry.tool.name, entry]));

export function listKnowledgeBaseMcpTools(): McpTool[] {
  return TOOL_DEFINITIONS.map((entry) => entry.tool);
}

export function createKnowledgeBaseMcpServer(config: KnowledgeBasePluginConfig) {
  return {
    async handleRequest(request: JsonRpcRequest): Promise<JsonRpcResponse | null> {
      if (!isRecord(request)) {
        return jsonRpcError(null, -32600, "Invalid Request");
      }

      const id = typeof request.id === "string" || typeof request.id === "number" || request.id === null
        ? request.id
        : null;
      const method = typeof request.method === "string" ? request.method : undefined;

      if (!method) {
        return id === undefined ? null : jsonRpcError(id, -32600, "Invalid Request");
      }

      if (method.startsWith("notifications/") || method === "$/cancelRequest") {
        return null;
      }

      if (id === undefined) {
        return null;
      }

      if (method === "initialize") {
        const params = isRecord(request.params) ? request.params : {};
        const protocolVersion =
          typeof params.protocolVersion === "string" ? params.protocolVersion : FALLBACK_PROTOCOL_VERSION;

        return {
          jsonrpc: "2.0",
          id,
          result: {
            protocolVersion,
            capabilities: {
              tools: {
                listChanged: false,
              },
            },
            serverInfo: {
              name: SERVER_NAME,
              version: SERVER_VERSION,
            },
            instructions:
              "Use kb_search before grounded answers, kb_prepare_source before kb_upsert_source_note, and never write vault files outside these tools.",
          },
        };
      }

      if (method === "ping") {
        return {
          jsonrpc: "2.0",
          id,
          result: {},
        };
      }

      if (method === "tools/list") {
        return {
          jsonrpc: "2.0",
          id,
          result: {
            tools: listKnowledgeBaseMcpTools(),
          },
        };
      }

      if (method === "tools/call") {
        const params = isRecord(request.params) ? request.params : {};
        const toolName = typeof params.name === "string" ? params.name : "";
        const args = isRecord(params.arguments) ? params.arguments : {};
        const definition = TOOL_BY_NAME.get(toolName);

        if (!definition) {
          return {
            jsonrpc: "2.0",
            id,
            result: textToolResult(`unknown_tool: ${toolName || "(missing tool name)"}`, {
              isError: true,
            }),
          };
        }

        try {
          const result = await definition.handler(config, args);
          return {
            jsonrpc: "2.0",
            id,
            result: structuredToolResult(result),
          };
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          return {
            jsonrpc: "2.0",
            id,
            result: textToolResult(message, { isError: true }),
          };
        }
      }

      return jsonRpcError(id, -32601, `Method not found: ${method}`);
    },
  };
}
