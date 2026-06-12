/**
 * JSON-RPC 2.0 endpoint for Gemma4 agent tool calls.
 *
 * Supported methods:
 * - tools/list
 * - tools/call
 * - legacy direct tool method names
 *
 * The gateway is read-only and bounded. It exposes a small manifest of tools
 * plus normalized results for OpenCode / Gemma4 planning layers.
 */

import type { RequestHandler } from './$types';
import '$lib/agent/register-tools';
import { buildToolGatewayManifest, handleToolGatewayRequest } from '$lib/agent/tool-gateway';
import { recordAgentTrace } from '$lib/server/observability/agent-trace-recorder';
import { ENV } from '$lib/server/env.server';

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

  const response = await handleToolGatewayRequest({
    jsonrpc: typeof body.jsonrpc === 'string' ? body.jsonrpc : undefined,
    method: String(body.method ?? ''),
    params: (body.params as Record<string, unknown> | undefined) ?? undefined,
    id: (body.id as string | number | null | undefined) ?? null,
  });

  if (locals.user && ENV.AGENT_TRACE_ENABLED !== 'false' && response.result && !response.error) {
    const method = String(body.method ?? '');
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

export const GET: RequestHandler = async () => {
  const manifest = buildToolGatewayManifest();
  return Response.json({
    ...manifest,
    method: 'tools/list',
  });
};

