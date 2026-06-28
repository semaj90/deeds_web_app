import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { ENV } from '$lib/server/env.server.js';
import { getOllamaChatEndpoint } from '$lib/server/utils/ollama-endpoint.js';
import { z } from 'zod';
import { ollamaFetch } from '$lib/server/ollama.js';
const safeJsonPost = (await import('$lib/server/utils/safe-json-post.js')).default as unknown as <
  T,
>(
  url: string,
  payload: unknown,
  opts?: { timeoutMs?: number; maxResponseBytes?: number; fallback?: T }
) => Promise<T | undefined>;

const evidenceAnalyzeSchema = z
  .object({
    evidenceId: z.string().max(500).optional(),
    content: z.string().max(50000).optional(),
    type: z.string().max(200).optional(),
  })
  .refine((data) => data.content || data.evidenceId, {
    message: 'content or evidenceId required',
  });

/** POST /api/v1/evidence/analyze — Proxy to /api/evidence/analysis + Ollama */
export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const raw = await request.json();
    const parsed = evidenceAnalyzeSchema.safeParse(raw);
    if (!parsed.success) {
      return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
    }
    const { evidenceId, content, type } = parsed.data;

    const textToAnalyze = content || '';

    // Run entity extraction + forensics via Ollama
    const prompt = `Analyze this legal evidence and extract:
1. Key entities (persons, organizations, dates, amounts)
2. Legal relevance (high/medium/low)
3. Evidence type classification
4. Risk indicators
5. Summary (2-3 sentences)

Evidence text:
${textToAnalyze.slice(0, 2000)}`;

    const data = await safeJsonPost<any>(
      `${getOllamaChatEndpoint()}/api/chat`,
      {
        model: 'gemma4-rotorquant:latest',
        messages: [
          {
            role: 'system',
            content: 'You are a legal evidence analyst. Extract structured data from evidence.',
          },
          { role: 'user', content: prompt },
        ],
        stream: false,
        options: { temperature: 0.2 },
      },
      { timeoutMs: 30_000, maxResponseBytes: 1_000_000 }
    );

    if (!data) {
      return json({ error: 'AI analysis unavailable' }, { status: 502 });
    }
    return json({
      analysis: data.message?.content || '',
      evidenceId: evidenceId || null,
      type: type || 'unknown',
      model: 'gemma4-rotorquant:latest',
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[/api/v1/evidence/analyze]', err);
    return json({ error: 'Analysis failed' }, { status: 500 });
  }
};
