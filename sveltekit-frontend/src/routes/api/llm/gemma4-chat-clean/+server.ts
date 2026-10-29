/**
 * src/routes/api/llm/gemma4-chat-clean/+server.ts
 *
 * Wrapper for local llama-server chat completions that sanitizes leaked reasoning blocks.
 *
 * Proxies requests to llama-server :8090/v1/chat/completions
 * and strips <|channel>thought...thought|> blocks from responses.
 */

import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import { requireUserOrService } from '$lib/server/auth-utils.js';
import { sanitizeOrnithSummary } from '../../../../../../scripts/atlas/lib/ornith-summary-sanitizer.mjs';
import { resolveLoadedLlamaModel } from '$lib/server/ai/llama-server-model-resolver.js';
import { ENV } from '$lib/server/env.server.js';

// Route name is historical: the proxy serves the model discovered from llama-server :8090.
// Only these fields reach llama-server; `model` is always resolved server-side and `stream` is
// not accepted because the response is read as one JSON document and sanitized.
const messageSchema = z.object({
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.string().max(200_000),
});

const bodySchema = z.object({
  messages: z.array(messageSchema).min(1).max(64),
  max_tokens: z.number().int().min(1).max(8192).optional(),
  temperature: z.number().min(0).max(2).optional(),
  top_p: z.number().min(0).max(1).optional(),
  stop: z.array(z.string().max(64)).max(8).optional(),
  stream: z.literal(false).optional(),
});

// Unsafe output (unclosed reasoning, leftover markers) is never passed on as an answer.
function cleanChoiceContent(content: string): string {
  const sanitized = sanitizeOrnithSummary(content);
  return sanitized.safe ? sanitized.summary : '';
}

export const POST: RequestHandler = async (event) => {
  requireUserOrService(event);

  let raw: unknown;
  try {
    raw = await event.request.json();
  } catch {
    return json({ error: 'invalid_json' }, { status: 400 });
  }
  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: 'invalid_request', issues: parsed.error.issues.slice(0, 5) }, { status: 400 });
  }
  const body = parsed.data;

  try {
    const configuredLlamaServer = ENV.LLAMA_SERVER_URL?.trim().replace(/\/+$/, '');
    if (!configuredLlamaServer) {
      return json({ error: 'llama_server_not_configured' }, { status: 503 });
    }

    const loaded = await resolveLoadedLlamaModel(configuredLlamaServer, null);
    const response = await fetch(`${configuredLlamaServer}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...body, model: loaded.resolvedModel }),
    });

    if (!response.ok) {
      return json({ error: `llama-server error: ${response.statusText}` }, { status: response.status });
    }

    const data = await response.json();

    // Sanitize all choice messages
    if (data.choices && Array.isArray(data.choices)) {
      data.choices = data.choices.map((choice: any) => ({
        ...choice,
        message: choice.message
          ? {
              ...choice.message,
              content: choice.message.content
                ? cleanChoiceContent(choice.message.content)
                : undefined,
            }
          : undefined,
      }));
    }

    return json(data);
  } catch (err) {
    console.error('[gemma4-chat-clean]', err);
    return json({ error: 'Internal server error' }, { status: 500 });
  }
};
