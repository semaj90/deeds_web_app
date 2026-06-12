/**
 * Tool gateway for Gemma4 / OpenCode.
 *
 * This is the narrow JSON-RPC boundary that exposes only bounded, read-only
 * tools and returns a normalized response shape for callers.
 */

import { TOOL_MANIFEST } from './tool-manifest';
import { getToolNames, runTool, type ToolResult } from './tool-registry';

export type JsonRpcId = string | number | null;

export interface JsonRpcRequest {
  jsonrpc?: string;
  method: string;
  params?: Record<string, unknown>;
  id?: JsonRpcId;
}

export interface JsonRpcError {
  code: number;
  message: string;
}

export interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: JsonRpcId;
  result?: unknown;
  error?: JsonRpcError;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function normalizeId(id: JsonRpcId | undefined): JsonRpcId {
  return id ?? null;
}

function toolListResult(): JsonRpcResponse {
  return {
    jsonrpc: '2.0',
    id: null,
    result: {
      tools: TOOL_MANIFEST,
      available_tools: getToolNames(),
    },
  };
}

async function callRegisteredTool(name: string, args: Record<string, unknown>): Promise<ToolResult> {
  return runTool({ name, arguments: args });
}

/**
 * Handle a JSON-RPC request for the agent tool gateway.
 *
 * Supported methods:
 * - `tools/list`
 * - `tools/call`
 * - direct tool names for legacy compatibility
 */
export async function handleToolGatewayRequest(request: JsonRpcRequest): Promise<JsonRpcResponse> {
  const id = normalizeId(request.id);

  if (!request.method) {
    return {
      jsonrpc: '2.0',
      id,
      error: { code: -32600, message: 'Invalid Request' },
    };
  }

  if (request.method === 'tools/list') {
    return {
      jsonrpc: '2.0',
      id,
      result: {
        tools: TOOL_MANIFEST,
        available_tools: getToolNames(),
      },
    };
  }

  if (request.method === 'tools/call') {
    const params = isPlainObject(request.params) ? request.params : {};
    const name = String(params.name ?? '').trim();
    const args = isPlainObject(params.arguments) ? params.arguments : {};

    if (!name) {
      return {
        jsonrpc: '2.0',
        id,
        error: { code: -32602, message: 'Invalid params: tool name is required' },
      };
    }

    const result = await callRegisteredTool(name, args);
    return {
      jsonrpc: '2.0',
      id,
      result,
    };
  }

  const result = await callRegisteredTool(request.method, isPlainObject(request.params) ? request.params : {});
  return {
    jsonrpc: '2.0',
    id,
    result,
  };
}

export function buildToolGatewayManifest(): JsonRpcResponse {
  return toolListResult();
}

