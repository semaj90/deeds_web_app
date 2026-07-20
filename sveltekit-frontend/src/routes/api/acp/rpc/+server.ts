/**
 * ACP RPC Endpoint with Tool Calling + KV Caching
 * POST /api/acp/rpc
 *
 * Full agent control plane with:
 * - Tool calling loops
 * - KV cache prefilling
 * - Streaming responses
 * - MCP tool execution
 *
 * Usage:
 *   curl -N http://localhost:5173/api/acp/rpc \
 *     -H "Content-Type: application/json" \
 *     -d '{
 *       "query": "list files in src/lib/server",
 *       "system_prompt": "You are a helpful code assistant",
 *       "tools": true,
 *       "stream": true,
 *       "use_kv_cache": true
 *     }'
 */

import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { runAcpRpcLoop } from '$lib/server/ai/acp-rpc-loop.js';

const LLAMA_BASE_URL = process.env.LLAMA_SERVER_URL || 'http://127.0.0.1:8090';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();
    const {
      query,
      system_prompt = 'You are a helpful assistant with access to tools.',
      tools = true,
      stream = true,
      use_kv_cache = true,
      max_tool_rounds = 3,
    } = body;

    if (!query) {
      return error(400, 'query is required');
    }

    const encoder = new TextEncoder();

    // Streaming response with tool loops
    const responseStream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          let contentBuffer = '';
          let chunkIndex = 0;

          for await (const chunk of runAcpRpcLoop(
            {
              llamaBaseUrl: LLAMA_BASE_URL,
              model: 'gemma4-legal-iq4xs-direct.gguf',
              temperature: 0.3,
              maxTokens: 2048,
              maxToolRounds: max_tool_rounds,
              useKvCache: use_kv_cache,
              kvCacheTtl: 256,
              mcpPort: 8788,
            },
            system_prompt,
            query
          )) {
            if (chunk.content) {
              contentBuffer += chunk.content;
              // Stream incremental content
              const sseChunk = `data: ${JSON.stringify({
                id: `chatcmpl-${Date.now()}-${chunkIndex++}`,
                object: 'chat.completion.chunk',
                choices: [
                  {
                    index: 0,
                    delta: { content: chunk.content },
                    finish_reason: null,
                  },
                ],
              })}\n\n`;
              controller.enqueue(encoder.encode(sseChunk));
            }

            if (chunk.toolCalls) {
              // Notify about tool calls
              const toolCallChunk = `data: ${JSON.stringify({
                id: `chatcmpl-${Date.now()}`,
                object: 'chat.completion.chunk',
                choices: [
                  {
                    index: 0,
                    delta: { tool_calls: chunk.toolCalls },
                    finish_reason: null,
                  },
                ],
              })}\n\n`;
              controller.enqueue(encoder.encode(toolCallChunk));
            }

            if (chunk.done) {
              // Send completion marker
              const completeChunk = `data: ${JSON.stringify({
                id: `chatcmpl-${Date.now()}`,
                object: 'chat.completion.chunk',
                choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
              })}\n\n`;
              controller.enqueue(encoder.encode(completeChunk));
              controller.close();
              break;
            }
          }
        } catch (err) {
          console.error('[acp/rpc] Error:', err);
          const errorChunk = `data: ${JSON.stringify({
            error: err instanceof Error ? err.message : 'Unknown error',
          })}\n\n`;
          controller.enqueue(encoder.encode(errorChunk));
          controller.close();
        }
      },
    });

    return new Response(responseStream, {
      headers: {
        'Content-Type': 'text/event-stream; charset=utf-8',
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
      },
    });
  } catch (err) {
    console.error('[acp/rpc]', err);
    return error(500, err instanceof Error ? err.message : 'Internal error');
  }
};
