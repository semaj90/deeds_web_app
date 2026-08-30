/**
 * Direct Cline/IDE integration endpoint
 * POST /api/cline/chat
 *
 * Streams context + query directly to llama-server:8090 with KV caching
 * No ACE orchestration, no database roundtrips — optimized for local IDE tool calling
 *
 * Usage:
 *   curl -N http://localhost:5173/api/cline/chat \
 *     -H "Content-Type: application/json" \
 *     -d '{
 *       "model": "gemma4-legal-iq4xs-direct.gguf",
 *       "messages": [{"role": "user", "content": "explain this code"}],
 *       "stream": true,
 *       "use_kv_cache": true
 *     }'
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { streamDirectToLlamaServer, wrapLlamaStreamAsSSE, kvCacheMonitor } from '$lib/server/ai/context-prompt-streamer.js';

const LLAMA_BASE_URL = process.env.LLAMA_SERVER_URL || 'http://127.0.0.1:8090';

const clineChatRequestSchema = z.object({
  model: z.string().min(1),
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'system']),
        content: z.string()
      })
    )
    .min(1),
  stream: z.boolean().optional().default(true),
  temperature: z.number().optional().default(0.3),
  max_tokens: z.number().int().optional().default(2048),
  use_kv_cache: z.boolean().optional().default(true)
});

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return error(401, 'Unauthorized');
  }

  try {
    const rawBody = await request.json().catch(() => ({}));
    const parsed = clineChatRequestSchema.safeParse(rawBody);

    if (!parsed.success) {
      return error(400, `Invalid request: ${parsed.error.issues[0]?.message || 'validation failed'}`);
    }

    const { model, messages, stream: shouldStream, temperature, max_tokens, use_kv_cache } = parsed.data;

    // Non-streaming response
    if (!shouldStream) {
      const response = await fetch(`${LLAMA_BASE_URL}/v1/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages,
          temperature,
          max_tokens,
          stream: false,
          cache_prompt: use_kv_cache,
          cache_reuse: 256,
        }),
      });

      if (!response.ok) {
        return error(response.status, `llama-server error: ${response.statusText}`);
      }

      const data = await response.json();

      // Record cache stats if available
      if (data.usage && use_kv_cache) {
        kvCacheMonitor.recordCacheHit(
          model,
          data.usage.prompt_tokens || 0,
          data.usage.prompt_tokens_cached || 0,
          data.usage.completion_tokens || 0
        );
      }

      return json(data);
    }

    // Streaming response with KV cache
    const encoder = new TextEncoder();
    const responseStream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const chunk of streamDirectToLlamaServer(
            {
              llamaBaseUrl: LLAMA_BASE_URL,
              model,
              temperature,
              maxTokens: max_tokens,
              cachePrompt: use_kv_cache,
              kvCacheTtl: 256,
            },
            messages,
            use_kv_cache
          )) {
            const sseChunk = `data: ${JSON.stringify({
              id: `chatcmpl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              object: 'chat.completion.chunk',
              created: Math.floor(Date.now() / 1000),
              model,
              choices: [
                {
                  index: 0,
                  delta: { content: chunk.choices?.[0]?.delta?.content ?? '' },
                  finish_reason: null,
                },
              ],
            })}\n\n`;

            controller.enqueue(encoder.encode(sseChunk));
          }

          // Send completion marker
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                id: `chatcmpl-${Date.now()}`,
                object: 'chat.completion.chunk',
                created: Math.floor(Date.now() / 1000),
                model,
                choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
              })}\n\n`
            )
          );

          controller.close();
        } catch (err) {
          console.error('[cline/chat] Stream error:', err);
          controller.error(err);
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
    console.error('[cline/chat]', err);
    return error(500, err instanceof Error ? err.message : 'Internal error');
  }
};

/**
 * GET /api/cline/chat/stats
 * Monitor KV cache effectiveness
 */
export const GET: RequestHandler = async () => {
  return json({
    kvCache: kvCacheMonitor.getAllStats(),
    timestamp: new Date().toISOString(),
  });
};
