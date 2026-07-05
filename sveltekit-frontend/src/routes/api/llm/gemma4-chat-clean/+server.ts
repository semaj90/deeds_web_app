/**
 * src/routes/api/llm/gemma4-chat-clean/+server.ts
 *
 * Wrapper for Gemma4 chat completions that sanitizes leaked thinking blocks.
 *
 * Proxies requests to llama-server :8090/v1/chat/completions
 * and strips <|channel>thought...thought|> blocks from responses.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { sanitizeGemma4Summary } from '../../../../../../scripts/atlas/lib/gemma4-summary-sanitizer.mjs';

const LLAMA_SERVER = 'http://127.0.0.1:8090';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const body = await request.json();

    const response = await fetch(`${LLAMA_SERVER}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
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
                ? sanitizeGemma4Summary(choice.message.content).summary
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
