import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { ENV } from '$lib/server/env.server.js';
import { traceLLM } from '$lib/server/observability/langfuse.js';
import { bifrostChat } from '$lib/server/ollama.js';
import { z } from 'zod';
import { ollamaFetch } from '$lib/server/ollama.js';
import { TIMEOUTS } from '$lib/server/timeouts.js';
import { llmRouter } from '$lib/server/llm-router.js';

const chatMessageSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().max(10000),
});

const aiChatSchema = z
  .object({
    message: z.string().max(10000).optional(),
    prompt: z.string().max(10000).optional(),
    caseId: z.string().uuid().optional(),
    temperature: z.number().min(0).max(2).optional().default(0.7),
    history: z.array(chatMessageSchema).max(50).optional().default([]),
  })
  .refine((d) => d.message?.trim() || d.prompt?.trim(), { message: 'Message is required' });

const OLLAMA_URL = ENV.OLLAMA_BASE_URL;

/** POST /api/ai/chat — Simple JSON chat endpoint (non-streaming) */
export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const raw = await request.json();
    const parsed = aiChatSchema.safeParse(raw);
    if (!parsed.success) {
      return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
    }
    const body = parsed.data;
    const message = body.message || body.prompt || '';
    const caseId = body.caseId || '';
    const temperature = body.temperature;

    const systemPrompt = caseId
      ? `You are a legal AI assistant for case ${caseId}. Provide concise, professional legal analysis.`
      : 'You are a legal AI assistant. Provide concise, professional legal analysis.';

    const data = await traceLLM(
      'ai-chat',
      { model: 'gemma3-legal:latest', prompt: message.slice(0, 500) },
      async (gen) => {
        // Route through Bifrost gateway when enabled (gets semantic caching)
        if (ENV.BIFROST_ENABLED) {
          try {
            const content = await bifrostChat(
              [
                { role: 'system', content: systemPrompt },
                ...(body.history || []),
                { role: 'user', content: message },
              ],
              'gemma3-legal',
              { temperature, timeoutMs: 30_000 }
            );
            gen.end({ output: content.slice(0, 1000) });
            return { message: { content }, model: 'gemma3-legal:latest' };
          } catch {
            gen.end({ output: 'bifrost-fallthrough', level: 'WARNING' });
            // Fall through to direct Ollama
          }
        }

        const res = await ollamaFetch(`${OLLAMA_URL}/api/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            model: 'gemma3-legal:latest',
            messages: [
              { role: 'system', content: systemPrompt },
              ...(body.history || []),
              { role: 'user', content: message },
            ],
            stream: false,
            options: { temperature },
          }),
          signal: AbortSignal.timeout(TIMEOUTS.USER_FACING),
        });

        if (!res.ok) {
          gen.end({ output: `error:${res.status}`, level: 'WARNING' });
          return null;
        }

        const d = await res.json();
        gen.end({ output: (d.message?.content || '').slice(0, 1000) });
        return d;
      }
    );

    if (!data) {
      // Tertiary fallback: llmRouter (TensorRT → Ollama /api/generate → Gemini)
      try {
        const fullPrompt = [
          ...(body.history ?? []).map(
            (m: { role: string; content: string }) => `${m.role}: ${m.content}`
          ),
          `user: ${message}`,
        ].join('\n');
        const result = await llmRouter.generate({ prompt: fullPrompt, systemPrompt, temperature });
        return json({
          response: result.content,
          model: result.metadata?.model ?? 'llm-router',
          performance: {},
        });
      } catch {
        return json({ error: 'AI service unavailable' }, { status: 503 });
      }
    }

    return json({
      response: data.message?.content || data.response || '',
      model: data.model || 'gemma3-legal:latest',
      performance: {
        total_duration: data.total_duration,
        eval_count: data.eval_count,
      },
    });
  } catch (err) {
    console.error('[/api/ai/chat] Error:', err);
    return json({ error: 'AI service unavailable' }, { status: 503 });
  }
};
