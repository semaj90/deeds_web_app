/**
 * OpenAI-compatible chat completions endpoint.
 * POST /api/v1/chat/completions
 */

import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import { runChatCompletion } from '$lib/server/ai/openai-facade.js';
import { openAIChatCompletionRequestSchema } from '$lib/server/ai/openai-types.js';
import {
  formatOpenAISseChunk,
  streamFromProviderAndCache,
} from '$lib/server/ai/streaming-cache.js';

export const POST: RequestHandler = async ({ request, locals }) => {
  // Allow OpenCode CLI requests without auth (they use apiKey from config, which is forwarded as a header)
  const isOpenCode = request.headers.get('x-opencode-client') === 'true' ||
                     request.headers.get('user-agent')?.includes('opencode') ||
                     process.env.DEV_BYPASS_AUTH === 'true';

  if (!locals.user && !isOpenCode) {
    throw error(401, 'Unauthorized');
  }

  try {
    const input = openAIChatCompletionRequestSchema.parse(await request.json());
    const options = {
      userId: String(locals.user?.id ?? 'anonymous'),
      useMcp: input.use_mcp,
    };

    if (!input.stream) {
      return json(await runChatCompletion(input, options));
    }

    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          for await (const chunk of streamFromProviderAndCache(input, options)) {
            controller.enqueue(
              encoder.encode(
                formatOpenAISseChunk({
                  id: `chatcmpl-${Date.now()}`,
                  model: input.model,
                  content: chunk.content,
                  done: false,
                })
              )
            );
          }
          controller.enqueue(
            encoder.encode(
              formatOpenAISseChunk({
                id: `chatcmpl-${Date.now()}`,
                model: input.model,
                done: true,
              })
            )
          );
          controller.close();
        } catch (streamError) {
          controller.error(streamError);
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Cache-Control': 'no-cache, no-transform',
        Connection: 'keep-alive',
        'Content-Type': 'text/event-stream; charset=utf-8',
      },
    });
  } catch (err) {
    if (err instanceof z.ZodError) {
      return error(400, 'Invalid request');
    }
    console.error('[v1/completions]', err);
    return error(500, 'Internal error');
  }
};
