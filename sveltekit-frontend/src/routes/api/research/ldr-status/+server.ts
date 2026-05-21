import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { getRedis } from '$lib/server/redis.js';
import { startLdrResearch, pollLdrTask, searchLdrHistory, ldrHealthCheck } from '$lib/server/analytics/ldr-client.js';

const querySchema = z.object({
  q:      z.string().min(3).max(500).optional(),
  taskId: z.string().optional(),
  action: z.enum(['start', 'status', 'history', 'health']).optional().default('status'),
});

const bodySchema = z.object({
  query:         z.string().min(3).max(1000),
  maxIterations: z.number().int().min(1).max(10).optional().default(3),
  searchEngines: z.array(z.string()).optional(),
});

/**
 * GET /api/research/ldr-status
 *
 * Actions:
 *   ?action=health                  → { ok: bool, url: string }
 *   ?action=status&taskId={id}      → poll a running task
 *   ?action=history&q={query}       → search history for a query
 *   ?action=status (default)        → list active Redis task refs
 */
export const GET: RequestHandler = async ({ url, locals }) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

  const params = querySchema.safeParse({
    q:      url.searchParams.get('q')      ?? undefined,
    taskId: url.searchParams.get('taskId') ?? undefined,
    action: url.searchParams.get('action') ?? 'status',
  });
  if (!params.success) return json({ error: 'Invalid params' }, { status: 400 });

  const { q, taskId, action } = params.data;

  if (action === 'health') {
    const ok = await ldrHealthCheck();
    return json({ ok, url: process.env.LDR_BASE_URL ?? 'http://127.0.0.1:5000' });
  }

  if (action === 'history' && q) {
    const result = await searchLdrHistory(q).catch(() => null);
    return json({ query: q, result });
  }

  if (action === 'status' && taskId) {
    const result = await pollLdrTask(taskId).catch(() => null);
    return json({ taskId, result });
  }

  // Default: list recent active LDR tasks from Redis
  const redis = getRedis();
  const hashes = await redis.zrevrange('ldr:idx:deep_research', 0, 19, 'WITHSCORES').catch(() => [] as string[]);
  const tasks: Array<{ queryHash: string; score: number; taskRef?: unknown; result?: unknown }> = [];
  for (let i = 0; i < hashes.length; i += 2) {
    const qHash = hashes[i];
    const score = parseFloat(hashes[i + 1] ?? '0');
    const [taskRef, result] = await Promise.all([
      redis.get(`ldr:task:${qHash}`).then(v => v ? JSON.parse(v) : null).catch(() => null),
      redis.get(`ldr:result:${qHash}`).then(v => v ? JSON.parse(v) : null).catch(() => null),
    ]);
    tasks.push({ queryHash: qHash, score, taskRef, result });
  }

  return json({ tasks, count: tasks.length });
};

/**
 * POST /api/research/ldr-status
 *
 * Start a new LDR research task for the given query.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

  let raw: unknown;
  try { raw = await request.json(); } catch { raw = {}; }

  const parsed = bodySchema.safeParse(raw);
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? 'Invalid body' }, { status: 400 });

  const { query, maxIterations, searchEngines } = parsed.data;
  const ref = await startLdrResearch(query, { maxIterations, searchEngines });

  if (!ref) {
    return json({ error: 'LDR service unavailable or disabled' }, { status: 503 });
  }

  return json({ success: true, taskId: ref.taskId, queryHash: ref.queryHash, startedAt: ref.startedAt });
};
