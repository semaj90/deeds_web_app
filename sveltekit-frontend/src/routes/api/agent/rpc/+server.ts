/**
 * JSON-RPC 2.0 endpoint for Gemma4 agent tool calls.
 *
 * Supported methods:
 * - tools/list
 * - tools/call
 * - tools/diagnostics (debug endpoint)
 * - legacy direct tool method names
 *
 * The gateway is read-only and bounded. It exposes a small manifest of tools
 * plus normalized results for OpenCode / Gemma4 planning layers.
 *
 * Routing:
 * - Registered tools (tool-registry.ts) → in-process dispatch
 * - MCP tools (trace.*) → proxy to :8788
 * - Gemma4 agent tools → future: proxy to agent service
 */

import type { RequestHandler } from './$types';
import '$lib/agent/register-tools';
import {
  buildToolGatewayManifest,
  handleToolGatewayRequest,
  type JsonRpcRequest,
} from '$lib/agent/tool-gateway';
import { ToolDiagnostics } from '$lib/agent/tool-diagnostic';
import { recordAgentTrace } from '$lib/server/observability/agent-trace-recorder';
import { ENV } from '$lib/server/env.server';

/**
 * Handle POST requests: tools/list, tools/call, or direct tool method names
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  let body: Record<string, unknown>;

  try {
    body = await request.json();
  } catch {
    return Response.json(
      {
        jsonrpc: '2.0',
        error: { code: -32700, message: 'Parse error' },
        id: null,
      },
      { status: 400 }
    );
  }

  const method = String(body.method ?? '');
  const params = (body.params as Record<string, unknown> | undefined) ?? {};

  // Log incoming request for diagnostics
  ToolDiagnostics.logRequest(method, params);

  // Handle diagnostics endpoint
  if (method === 'tools/diagnostics') {
    const diagnostic = params.type ? String(params.type) : 'summary';

    if (diagnostic === 'log') {
      const toolName = params.tool ? String(params.tool) : undefined;
      const phase = params.phase ? String(params.phase) : undefined;
      return Response.json({
        jsonrpc: '2.0',
        id: body.id ?? null,
        result: ToolDiagnostics.getLog(toolName, phase as any, 100),
      });
    }

    if (diagnostic === 'summary') {
      return Response.json({
        jsonrpc: '2.0',
        id: body.id ?? null,
        result: ToolDiagnostics.getSummary(),
      });
    }

    if (diagnostic === 'report') {
      return Response.json({
        jsonrpc: '2.0',
        id: body.id ?? null,
        result: ToolDiagnostics.exportReport(),
      });
    }

    if (diagnostic === 'clear') {
      ToolDiagnostics.clear();
      return Response.json({
        jsonrpc: '2.0',
        id: body.id ?? null,
        result: { ok: true, message: 'Diagnostics log cleared' },
      });
    }
  }

  const response = await handleToolGatewayRequest({
    jsonrpc: typeof body.jsonrpc === 'string' ? body.jsonrpc : undefined,
    method,
    params,
    id: (body.id as string | number | null | undefined) ?? null,
  } as JsonRpcRequest);

  // Log result for diagnostics
  if (response.error) {
    ToolDiagnostics.logDispatch(method, 'tool-gateway', params, response.error.message);
  } else {
    ToolDiagnostics.logResult(method, response.result, response.result);
  }

  if (locals.user && ENV.AGENT_TRACE_ENABLED !== 'false' && response.result && !response.error) {
    const ok = Boolean((response.result as { ok?: boolean })?.ok ?? true);

    recordAgentTrace({
      query: method,
      retrievalStrategy: 'structural',
      selectedConcepts: ['rpc-tool', `tool:${method}`],
      selectedPackets: [],
      toolsCalled: [method],
      outcome: ok ? 'success' : 'failure',
      reward: ok ? 1.0 : 0.0,
      taskId: 'global',
      traceSource: 'gemma4',
    }).catch((err) => console.error('Failed to record agent trace:', err));
  }

  return Response.json(response);
};

/**
 * Handle GET requests: return tools/list manifest or diagnostics
 */
export const GET: RequestHandler = async ({ url }) => {
  const diagnostic = url.searchParams.get('diagnostic');

  // Diagnostic endpoints
  if (diagnostic === 'summary') {
    return Response.json({
      diagnostics: ToolDiagnostics.getSummary(),
    });
  }

  if (diagnostic === 'report') {
    return Response.json(ToolDiagnostics.exportReport());
  }

  if (diagnostic === 'log') {
    const toolName = url.searchParams.get('tool') ?? undefined;
    const phase = url.searchParams.get('phase') ?? undefined;
    return Response.json({
      log: ToolDiagnostics.getLog(toolName, phase as any),
    });
  }

  // Default: return tools manifest
  const manifest = buildToolGatewayManifest();
  return Response.json({
    ...manifest,
    method: 'tools/list',
  });
};

