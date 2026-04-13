import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { z } from 'zod';

const chatMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().max(10000),
});

const directChatSchema = z
  .object({
    message: z.string().max(10000).optional(),
    prompt: z.string().max(10000).optional(),
    model: z.string().optional().default('gemma4-legal'),
    temperature: z.number().min(0).max(2).optional().default(0.7),
    history: z.array(chatMessageSchema).max(50).optional().default([]),
  })
  .refine((d) => d.message?.trim() || d.prompt?.trim(), { message: 'Message is required' });

/** POST /api/ai/chat-direct — Direct Ollama endpoint for load testing (bypasses inference router) */
export const POST: RequestHandler = async ({ request }) => {
  try {
    const raw = await request.json();
    const parsed = directChatSchema.safeParse(raw);
    if (!parsed.success) {
      return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
    }

    const body = parsed.data;
    const message = body.message || body.prompt || '';
    const model = body.model || 'gemma4-legal';
    const temperature = body.temperature;

    const start = performance.now();

    // Direct Ollama call (no router, no cache)
    const response = await fetch('http://localhost:11434/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt: message,
        stream: false,
        options: {
          temperature,
          num_predict: 200,
        },
      }),
      signal: AbortSignal.timeout(30000),
    });

    const result = await response.json();
    const latencyMs = Math.round(performance.now() - start);

    return json({
      response: result.response || '',
      model,
      backend: 'ollama-direct',
      performance: { latencyMs },
    });
  } catch (err) {
    console.error('[/api/ai/chat-direct] Error:', err);
    return json({ error: 'AI service unavailable' }, { status: 503 });
  }
};