import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
const safeJsonPost = (await import('$lib/server/utils/safe-json-post.js')).default as unknown as <
  T,
>(
  url: string,
  payload: unknown,
  opts?: { timeoutMs?: number; maxResponseBytes?: number; fallback?: T }
) => Promise<T | undefined>;

const summarizeSchema = z.object({
  content: z.string().min(1).max(200000),
  textHash: z.string().min(1).max(128),
  model: z.string().max(100).default('gemma4-rotorquant:latest'),
  embedModel: z.string().max(100).optional(),
});

/** POST /api/v1/ai/summarize-async — Start async summarization job */
export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
  try {
    const raw = await request.json();
    const parsed = summarizeSchema.safeParse(raw);
    if (!parsed.success) {
      return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
    }

    const { content, textHash } = parsed.data;

    // Check if result is already cached
    const { getRedis } = await import('$lib/server/redis.js');
    const redis = getRedis();
    const cached = await redis.get(`summary:${textHash}`);
    if (cached) {
      return json({ jobId: textHash, status: 'completed', result: JSON.parse(cached) });
    }

    // Create a job entry in Redis
    const jobId = textHash;
    await redis.set(
      `job:${jobId}`,
      JSON.stringify({ status: 'processing', createdAt: Date.now() }),
      'EX',
      600
    );

    (async () => {
      try {
        const { ENV } = await import('$lib/server/env.server.js');

        const data = await safeJsonPost<any>(
          `${ENV.OLLAMA_BASE_URL}/api/generate`,
          {
            model: 'gemma4-rotorquant:latest',
            prompt: `Summarize the following legal text concisely. Focus on key facts, legal issues, and conclusions.\n\nText:\n${content.slice(0, 50000)}`,
            stream: false,
            options: { temperature: 0.3 },
          },
          { timeoutMs: 120_000, maxResponseBytes: 2_000_000 }
        );

        if (data && (data.response || data.result)) {
          const result = { summary: data.response ?? data.result };
          await redis.set(`summary:${textHash}`, JSON.stringify(result), 'EX', 86400);
          await redis.set(
            `job:${jobId}`,
            JSON.stringify({ status: 'completed', result }),
            'EX',
            600
          );
        } else {
          await redis.set(
            `job:${jobId}`,
            JSON.stringify({ status: 'failed', error: `LLM error or empty response` }),
            'EX',
            600
          );
        }
      } catch (err) {
        await redis.set(
          `job:${jobId}`,
          JSON.stringify({
            status: 'failed',
            error: 'Summarization failed',
          }),
          'EX',
          600
        );
      }
    })();

    return json({ jobId, status: 'processing' });
  } catch (err) {
    console.error('[/api/v1/ai/summarize-async] error:', err);
    return json({ error: 'Failed to start summarization' }, { status: 500 });
  }
};
