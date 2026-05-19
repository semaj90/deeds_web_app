/**
 * POST /api/v1/chat/completions — OpenAI-compatible chat completions facade.
 *
 * Routes through the full ACE/KAG/RAG context-assembler + code-llm-index
 * PRIOR ANSWER cache + bifrostChat cascade. Lets OpenWebUI / Continue / Cursor
 * / Aider / any OpenAI-compat client talk to the YorHA agent brain.
 *
 * v1 contract:
 *   - stream: true supported via SSE (OpenAI-compatible stream chunks)
 *   - tools / tool_choice: accepted but ignored (use /api/ai/agent for tool loops)
 *   - temperature, max_tokens, top_p: pass-through to bifrostChat
 *   - file_path / case_id / raw: custom YorHA extensions
 *
 * Auth: requires locals.user (session cookie OR x-dev-bypass header in dev).
 *
 * Degraded contract: errors return OpenAI-shape error envelope:
 *   { error: { message, type, code } }
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { openAIChatCompletionRequestSchema } from '$lib/server/ai/openai-types.js';
import { BudgetExceededError, runChatCompletion } from '$lib/server/ai/openai-facade.js';
import {
  formatOpenAISseChunk,
  streamFromProviderAndCache,
} from '$lib/server/ai/streaming-cache.js';

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json(
      { error: { message: 'Unauthorized', type: 'invalid_request_error', code: 'unauthorized' } },
      { status: 401 }
    );
  }

  // Parse + validate
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(
      { error: { message: 'Invalid JSON', type: 'invalid_request_error', code: 'invalid_json' } },
      { status: 400 }
    );
  }
  const parsed = openAIChatCompletionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return json(
      {
        error: {
          message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
          type: 'invalid_request_error',
          code: 'invalid_params',
        },
      },
      { status: 400 }
    );
  }
  const req = parsed.data;

  if (req.stream) {
    const completionId = `chatcmpl-yorha-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of streamFromProviderAndCache(req, {
            userId: (locals.user as { id?: string } | null)?.id,
            useMcp: req.use_mcp,
          })) {
            if (!chunk.content) continue;
            controller.enqueue(
              encoder.encode(
                formatOpenAISseChunk({
                  id: completionId,
                  model: req.model,
                  content: chunk.content,
                  done: false,
                })
              )
            );
          }
          controller.enqueue(encoder.encode('data: [DONE]\n\n'));
        } catch (error) {
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                error: {
                  message: (error as Error)?.message ?? 'Stream failed',
                  type: 'server_error',
                  code: 'completion_failed',
                },
              })}\n\n`
            )
          );
        } finally {
          controller.close();
        }
      },
    });

    return new Response(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      },
    });
  }

  // Run through ACE + bifrostChat
  try {
    const userId = (locals.user as { id?: string } | null)?.id;
    const result = await runChatCompletion(req, { userId, useMcp: req.use_mcp });
    return json(result);
  } catch (err) {
    const msg = (err as Error)?.message ?? 'Unknown error';
    if (err instanceof BudgetExceededError) {
      console.error('[/api/v1/chat/completions] budget exceeded:', msg);
      return json(
        {
          error: {
            message: msg,
            type: 'invalid_request_error',
            code: 'context_window_exceeded',
          },
        },
        { status: 400 }
      );
    }
    console.error('[/api/v1/chat/completions]', msg);
    return json(
      {
        error: {
          message: msg,
          type: 'server_error',
          code: 'completion_failed',
        },
      },
      { status: 500 }
    );
  }
};
