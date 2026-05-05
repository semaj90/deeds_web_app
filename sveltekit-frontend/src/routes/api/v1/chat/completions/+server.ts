/**
 * POST /api/v1/chat/completions — OpenAI-compatible chat completions facade.
 *
 * Routes through the full ACE/KAG/RAG context-assembler + code-llm-index
 * PRIOR ANSWER cache + bifrostChat cascade. Lets OpenWebUI / Continue / Cursor
 * / Aider / any OpenAI-compat client talk to the YorHA agent brain.
 *
 * v1 contract:
 *   - stream: false only (streaming planned for follow-up commit)
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
import { runChatCompletion } from '$lib/server/ai/openai-facade.js';

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json(
      { error: { message: 'Unauthorized', type: 'invalid_request_error', code: 'unauthorized' } },
      { status: 401 },
    );
  }

  // Parse + validate
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(
      { error: { message: 'Invalid JSON', type: 'invalid_request_error', code: 'invalid_json' } },
      { status: 400 },
    );
  }
  const parsed = openAIChatCompletionRequestSchema.safeParse(body);
  if (!parsed.success) {
    return json(
      {
        error: {
          message: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '),
          type:    'invalid_request_error',
          code:    'invalid_params',
        },
      },
      { status: 400 },
    );
  }
  const req = parsed.data;

  // Streaming not yet supported on this surface
  if (req.stream) {
    return json(
      {
        error: {
          message: 'stream:true not supported on /api/v1/chat/completions yet — use /api/sse/chat for streaming or set stream:false',
          type:    'invalid_request_error',
          code:    'streaming_not_supported',
        },
      },
      { status: 400 },
    );
  }

  // Run through ACE + bifrostChat
  try {
    const userId = (locals.user as { id?: string } | null)?.id;
    const result = await runChatCompletion(req, { userId });
    return json(result);
  } catch (err) {
    const msg = (err as Error)?.message ?? 'Unknown error';
    console.error('[/api/v1/chat/completions]', msg);
    return json(
      {
        error: {
          message: msg,
          type:    'server_error',
          code:    'completion_failed',
        },
      },
      { status: 500 },
    );
  }
};
