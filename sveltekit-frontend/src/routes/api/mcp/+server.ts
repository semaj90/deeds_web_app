/**
 * Unified HTTP MCP Bridge Gateway
 *
 * Implements the Model Context Protocol over HTTP/SSE.
 *
 * GET /api/mcp   -> Initializes SSE stream for discovery and notifications.
 * POST /api/mcp  -> Primary endpoint for tool execution (JSON-RPC).
 */

import { error, text, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { server, setupToolHandlers } from '../../../mcp/server.js';
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

// Ensure tools are registered
setupToolHandlers();

const AUTH_TOKEN = process.env.MCP_AUTH_TOKEN;

/**
 * GET Handler: SSE Discovery & Notification Channel
 */
export const GET: RequestHandler = async ({ url, request }) => {
  // 1. Auth Check
  if (AUTH_TOKEN) {
    const authHeader = request.headers.get('Authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : url.searchParams.get('token');
    if (token !== AUTH_TOKEN) {
      throw error(401, 'Unauthorized: Invalid MCP Auth Token');
    }
  }

  // 2. Initialize SSE Stream
  // We use a ReadableStream to stream MCP events (discovery, progress, logs) to the client.
  const stream = new ReadableStream({
    start(controller) {
      // MCP SDK logic for SSE involves sending "endpoint" and standard JSON-RPC
      const encoder = new TextEncoder();

      // Send initial endpoint event as per MCP HTTP spec
      const endpoint = `${url.origin}/api/mcp`;
      controller.enqueue(encoder.encode(`event: endpoint\ndata: ${endpoint}\n\n`));

      // In a real SSEServerTransport, we would subscribe to the server's notification stream here.
      // For now, we provide the discovery base.
    },
    cancel() {
      // Cleanup
    }
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
};

/**
 * POST Handler: Tool Execution Channel
 */
export const POST: RequestHandler = async ({ request }) => {
  // 1. Auth Check
  if (AUTH_TOKEN) {
    const authHeader = request.headers.get('Authorization');
    const body = await request.clone().json().catch(() => ({}));
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : body?.params?._meta?.authToken || body?.params?.arguments?._authToken;

    if (token !== AUTH_TOKEN) {
      throw error(401, 'Unauthorized: Invalid MCP Auth Token');
    }
  }

  try {
    const body = await request.json();

    // 2. Direct Server Handling
    // Instead of a full transport layer, we use the server's internal request handler
    // for high-performance tool execution. This matches the "FastMCP" spirit.
    const response = await (server as any).handleRequest(body);

    return json(response);
  } catch (err: any) {
    console.error('[MCP HTTP] Execution error:', err);
    return json({
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32603,
        message: err.message ?? 'Internal MCP Error'
      }
    }, { status: 500 });
  }
};
