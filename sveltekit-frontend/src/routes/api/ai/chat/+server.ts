import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { traceLLM } from '$lib/server/observability/langfuse.js';
import { z } from 'zod';
import { routeInference } from '$lib/server/inference/inference-router.js';

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

    const result = await traceLLM(
      'ai-chat',
      { model: 'inference-router', prompt: message.slice(0, 500) },
      async (gen) => {
        const routed = await routeInference({
          prompt: message,
          systemPrompt,
          temperature,
        });
        gen.end({ output: (routed.text || '').slice(0, 1000) });
        return routed;
      }
    );

    return json({
      response: result.text || '',
      model: result.model || 'gemma4-legal:latest',
      backend: result.backend,
      performance: { latencyMs: result.latencyMs },
    });
  } catch (err) {
    console.error('[/api/ai/chat] Error:', err);
    return json({ error: 'AI service unavailable' }, { status: 503 });
  }
};
