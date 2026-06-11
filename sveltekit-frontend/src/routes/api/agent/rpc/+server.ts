/**
 * JSON-RPC 2.0 endpoint for Gemma4 agent tool calls.
 * Implements bounded tool gateway with trace recording.
 *
 * Contract:
 * Request: { jsonrpc: "2.0", method: "tool.name", params: {...}, id: <number|string> }
 * Response: { jsonrpc: "2.0", result: {...}, id: <number|string> }
 *           or { jsonrpc: "2.0", error: { code: <int>, message: <string> }, id: <number|string> }
 */

import type { RequestHandler } from './$types';
import '$lib/agent/register-tools';
import { runTool, getToolNames } from '$lib/agent/tool-registry';
import { recordAgentTrace } from '$lib/server/observability/agent-trace-recorder';
import { ENV } from '$lib/server/env.server';

interface JsonRpcRequest {
  jsonrpc: string;
  method: string;
  params?: Record<string, unknown>;
  id?: string | number;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  result?: unknown;
  error?: { code: number; message: string };
  id?: string | number;
}

export const POST: RequestHandler = async ({ request, locals }) => {
  let body: JsonRpcRequest;

  try {
    body = await request.json();
  } catch (err) {
    return Response.json(
      {
        jsonrpc: '2.0',
        error: { code: -32700, message: 'Parse error' },
        id: null,
      } as JsonRpcResponse,
      { status: 400 }
    );
  }

  // Validate JSON-RPC structure
  if (body.jsonrpc !== '2.0' || !body.method) {
    return Response.json(
      {
        jsonrpc: '2.0',
        error: { code: -32600, message: 'Invalid Request' },
        id: body.id ?? null,
      } as JsonRpcResponse,
      { status: 400 }
    );
  }

  try {
    // Rate limit: 20 tool calls per user per minute
    // (In production: implement Redis token bucket)

    // Execute tool
    const startMs = performance.now();
    const toolResult = await runTool({
      name: body.method,
      arguments: body.params ?? {},
    });
    const durationMs = Math.round(performance.now() - startMs);

    // Record trace if user is authenticated
    if (locals.user && ENV.AGENT_TRACE_ENABLED !== 'false') {
      recordAgentTrace({
        query: body.method,
        retrievalStrategy: 'structural',
        selectedConcepts: ['rpc-tool', `tool:${body.method}`],
        selectedPackets: [],
        toolsCalled: [body.method],
        outcome: toolResult.ok ? 'success' : 'failure',
        reward: toolResult.ok ? 1.0 : 0.0,
        taskId: 'global',
        traceSource: 'gemma4'
      }).catch((err) => console.error('Failed to record agent trace:', err));
    }

    // Return result
    const response: JsonRpcResponse = {
      jsonrpc: '2.0',
      result: toolResult,
      id: body.id,
    };

    return Response.json(response);
  } catch (err: any) {
    return Response.json(
      {
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: err.message || 'Internal error',
        },
        id: body.id,
      } as JsonRpcResponse,
      { status: 500 }
    );
  }
};

/**
 * GET returns tool manifest for introspection
 */
export const GET: RequestHandler = async () => {
  const { TOOL_MANIFEST } = await import('$lib/agent/tool-manifest');
  return Response.json({
    jsonrpc: '2.0',
    method: 'tools/list',
    tools: TOOL_MANIFEST,
    available_tools: getToolNames(),
  });
};
