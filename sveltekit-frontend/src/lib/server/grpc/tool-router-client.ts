/**
 * ToolRouter gRPC Client — MCP JSON-RPC ↔ internal gRPC bridge.
 *
 * Architecture (per Google MCP Jan 2026 guidance):
 *   Edge:     MCP 2025-03-26  JSON-RPC 2.0  POST /mcp  { method: "tools/call" }
 *   This:     JSON-RPC → protobuf CallToolRequest → gRPC ToolRouterService
 *   Internal: each tool dispatched by name — face_identify, llm_synths, etc.
 *   Fallback: when TOOL_ROUTER_GRPC_ENABLED=false, routes inline to contextual-tools.ts
 *
 * All addresses resolved via ENV.* getters in env.server.ts.
 *
 * Proto: proto/active/tool_router.proto  (package legal.agent.v1)
 */

import { resolve } from 'path';
import { ENV } from '$lib/server/env.server.js';

// ── MCP JSON-RPC types (2025-03-26 spec) ─────────────────────────────────

/** Mirrors the MCP tools/call params object */
export interface McpToolCallParams {
  name: string;
  arguments: Record<string, unknown>;
  _meta?: {
    traceparent?: string;
    authToken?: string;
    [key: string]: string | undefined;
  };
}

/** MCP tools/call JSON-RPC envelope */
export interface McpToolCallRequest {
  jsonrpc: '2.0';
  id: string | number;
  method: 'tools/call';
  params: McpToolCallParams;
}

/** Single content item in MCP tools/call response */
export interface McpContentItem {
  type: 'text' | 'image' | 'audio' | 'resource';
  text?: string;
  data?: string;        // base64 for image/audio
  mimeType?: string;
  resource?: { uri: string; mimeType?: string; text?: string };
}

/** MCP tools/call result */
export interface McpToolCallResult {
  content: McpContentItem[];
  isError: boolean;
}

/** Full JSON-RPC response envelope */
export interface McpToolCallResponse {
  jsonrpc: '2.0';
  id: string | number;
  result?: McpToolCallResult;
  error?: { code: number; message: string; data?: unknown };
}

// ── Internal proto types (mirror proto/active/tool_router.proto) ──────────

export interface CallToolRequest {
  requestId: string;
  toolName: string;
  argumentsJson: string;
  meta: Record<string, string>;
  actorId: string;
  sessionId: string;
  timeoutMs: number;
}

export interface CallToolResponse {
  requestId: string;
  contentJson: string;
  isError: boolean;
  errorCode: string;
  errorMessage: string;
  durationMs: number;
  span: Record<string, string>;
}

// ── gRPC lazy singleton ──────────────────────────────────────────────────

let _client: unknown = null;
let _loadFailed = false;
let _retryAt = 0;

async function _getClient(): Promise<unknown> {
  const enabled = ENV.TOOL_ROUTER_GRPC_ENABLED;
  if (!enabled) return null;
  if (_loadFailed && Date.now() < _retryAt) return null;
  if (_loadFailed) { _loadFailed = false; _client = null; }
  if (_client) return _client;

  try {
    const grpc = await import('@grpc/grpc-js');
    const protoLoader = await import('@grpc/proto-loader');

    const PROTO_PATH = resolve(process.cwd(), '../proto/active/tool_router.proto');
    const pkg = protoLoader.loadSync(PROTO_PATH, {
      keepCase: false,
      longs: String,
      enums: String,
      defaults: true,
      oneofs: true,
    });
    const grpcPkg = grpc.loadPackageDefinition(pkg) as Record<string, unknown>;
    const legal = grpcPkg['legal'] as Record<string, unknown>;
    const agent = legal['agent'] as Record<string, unknown>;
    const v1 = agent['v1'] as Record<string, unknown>;
    const ServiceCtor = v1['ToolRouter'] as new (addr: string, creds: unknown) => unknown;

    const url = ENV.TOOL_ROUTER_GRPC_URL;
    _client = new ServiceCtor(url, grpc.credentials.createInsecure());
    return _client;
  } catch (err) {
    console.error('[tool-router-grpc] init failed:', err);
    _loadFailed = true;
    _retryAt = Date.now() + 30_000;
    return null;
  }
}

type GrpcCb<T> = (err: Error | null, res: T) => void;
type GrpcUnary<Req, Res> = (req: Req, opts: { deadline: Date }, cb: GrpcCb<Res>) => void;

function _unary<Req, Res>(client: unknown, method: string, req: Req, ms: number): Promise<Res | null> {
  return new Promise((resolve) => {
    const fn = (client as Record<string, GrpcUnary<Req, Res>>)[method];
    if (typeof fn !== 'function') { resolve(null); return; }
    fn.call(client, req, { deadline: new Date(Date.now() + ms) }, (err, res) => {
      resolve(err ? null : res);
    });
  });
}

// ── Core dispatch — gRPC with inline fallback ────────────────────────────

/**
 * Dispatch a single tool call via gRPC ToolRouter.
 * Falls back to executeContextualTool() inline when gRPC is disabled/unavailable.
 *
 * Accepts either:
 *   - a full McpToolCallRequest (JSON-RPC envelope) — used by /mcp HTTP handler
 *   - a plain { name, args } pair — used by contextual-tools.ts case handler
 */
export async function routeToolCall(
  nameOrMcpRequest: string | McpToolCallRequest,
  argsOrContext?: Record<string, unknown>,
  actorId?: string,
  sessionId?: string,
): Promise<CallToolResponse> {
  const start = Date.now();

  let toolName: string;
  let argsObj: Record<string, unknown>;
  let meta: Record<string, string> = {};
  let requestId: string;

  if (typeof nameOrMcpRequest === 'string') {
    // Direct call from contextual-tools.ts
    toolName = nameOrMcpRequest;
    argsObj = argsOrContext ?? {};
    requestId = crypto.randomUUID();
  } else {
    // Full MCP JSON-RPC envelope from /mcp HTTP handler
    const mcp = nameOrMcpRequest;
    toolName = mcp.params.name;
    argsObj = mcp.params.arguments;
    requestId = String(mcp.id);
    if (mcp.params._meta) {
      meta = Object.fromEntries(
        Object.entries(mcp.params._meta).filter(([, v]) => typeof v === 'string')
      ) as Record<string, string>;
    }
  }

  const req: CallToolRequest = {
    requestId,
    toolName,
    argumentsJson: JSON.stringify(argsObj),
    meta,
    actorId: actorId ?? '',
    sessionId: sessionId ?? '',
    timeoutMs: 0,
  };

  // ── gRPC path ────────────────────────────────────────────────────────────
  const client = await _getClient();
  if (client) {
    const res = await _unary<CallToolRequest, CallToolResponse>(
      client, 'callTool', req, 120_000
    );
    if (res) return res;
    // fall through to inline path on gRPC error
  }

  // ── Inline fallback path (no gRPC server needed) ─────────────────────────
  try {
    const { executeContextualTool } = await import('$lib/server/ai/contextual-tools.js');
    const result = await executeContextualTool(toolName, argsObj, {});
    return {
      requestId,
      contentJson: JSON.stringify([{ type: 'text', text: result.result }]),
      isError: !result.ok,
      errorCode: result.ok ? '' : 'TOOL_EXEC_ERROR',
      errorMessage: result.ok ? '' : result.result,
      durationMs: Date.now() - start,
      span: {},
    };
  } catch (err) {
    return {
      requestId,
      contentJson: '[]',
      isError: true,
      errorCode: 'INTERNAL_ERROR',
      errorMessage: err instanceof Error ? err.message : String(err),
      durationMs: Date.now() - start,
      span: {},
    };
  }
}

/**
 * Wrap a routeToolCall result as a proper MCP JSON-RPC response.
 * Used by the /mcp HTTP handler to send back to Copilot/Claude/Gemini clients.
 */
export function toMcpResponse(
  id: string | number,
  grpcRes: CallToolResponse,
): McpToolCallResponse {
  try {
    const content = JSON.parse(grpcRes.contentJson) as McpContentItem[];
    return {
      jsonrpc: '2.0',
      id,
      result: { content, isError: grpcRes.isError },
    };
  } catch {
    return {
      jsonrpc: '2.0',
      id,
      ...(grpcRes.isError
        ? { error: { code: -32603, message: grpcRes.errorMessage } }
        : { result: { content: [{ type: 'text', text: grpcRes.contentJson }], isError: false } }),
    };
  }
}
