/**
 * POST /api/ai/agent
 *
 * Gemma4 tool-calling agent endpoint.
 * Runs an agentic loop: query → Ollama gemma4 with tools →
 *   tool dispatch → result → re-query → ... → final answer.
 *
 * Body:
 *   query         string (required) — the user's question
 *   systemPrompt  string (optional) — override default system prompt
 *   pipeline      string (optional) — pipeline tag for RL analytics (default 'ace')
 *
 * Response:
 *   { answer, toolsUsed, rounds, durationMs, sources }
 *
 * Rate limited to 20 req/user/min (agent calls are GPU-bound).
 */

import { json }             from '@sveltejs/kit';
import { z }                from 'zod';
import { runGemma4Agent }   from '$lib/server/ai/gemma4-agent.js';
import { getRedis }         from '$lib/server/redis.js';
import type { RequestHandler } from './$types';

const RATE_LIMIT      = 20;
const RATE_WINDOW_S   = 60;

const BodySchema = z.object({
  query:        z.string().min(1).max(4000),
  systemPrompt: z.string().max(2000).optional(),
  pipeline:     z.string().max(20).optional().default('ace'),
});

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? 'Bad request' }, { status: 400 });
  }

  // Token-bucket rate-limit
  try {
    const redis  = getRedis();
    const bucket = `ratelimit:agent:${locals.user.id}`;
    const count  = await redis.incr(bucket);
    if (count === 1) await redis.expire(bucket, RATE_WINDOW_S);
    if (count > RATE_LIMIT) {
      return json(
        { error: `Rate limit exceeded — max ${RATE_LIMIT} agent calls per minute` },
        { status: 429 },
      );
    }
  } catch { /* Redis down — allow through */ }

  const { query, systemPrompt, pipeline } = parsed.data;

  try {
    const result = await runGemma4Agent(query, {
      systemPrompt,
      pipeline,
      userId:    locals.user.id,
      sessionId: locals.user.id, // use userId as session anchor; swap for real sessionId if available
    });

    return json(result);
  } catch (err) {
    console.error('[agent] runGemma4Agent failed:', (err as Error).message);
    return json({ error: 'Agent failed — model may be unavailable' }, { status: 503 });
  }
};
