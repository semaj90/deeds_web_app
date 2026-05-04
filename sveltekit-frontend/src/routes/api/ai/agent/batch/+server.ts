/**
 * POST /api/ai/agent/batch — parallel concurrent agentic error analysis
 *
 * Streams batch task results via Server-Sent Events.
 *
 * Body:
 *   {
 *     mode:        'hotspots' | 'tasks',     // hotspots = auto-load top-N from graph
 *     topN?:       number,                    // for mode=hotspots (default 5, max 30)
 *     tasks?:      BatchTask[],               // for mode=tasks
 *     concurrency?:    number,                // override BATCH_FIX_CONCURRENCY (default 3)
 *     bypassCache?:    boolean,
 *   }
 *
 * SSE events:
 *   event: started   data: { totalTasks, concurrency }
 *   event: progress  data: BatchTaskResult     (one per task as it completes)
 *   event: completed data: { totalCompleted, totalFailed, durationMs }
 *   event: error     data: { error }           (fatal — stream aborts)
 */

import { json }          from '@sveltejs/kit';
import { z }             from 'zod';
import type { RequestHandler } from './$types';
import { sseFormat, sseHeaders } from '$lib/server/streaming/sse-utils.js';
import {
  buildBatchTasks,
  runBatchErrorAnalysis,
  type BatchTask,
} from '$lib/server/analysis/batch-error-analysis.js';
import { getAuditHotspots } from '$lib/server/graph/graph-intel.js';

// ── Zod ──────────────────────────────────────────────────────────────────────

const batchTaskSchema = z.object({
  id:       z.string().min(1).max(120),
  dir:      z.string().min(1).max(200),
  reason:   z.array(z.string()).max(10),
  query:    z.string().min(1).max(8000),
  metadata: z.record(z.unknown()).default({}),
});

const requestSchema = z.discriminatedUnion('mode', [
  z.object({
    mode:        z.literal('hotspots'),
    topN:        z.number().int().min(1).max(30).default(5),
    concurrency: z.number().int().min(1).max(8).optional(),
    bypassCache: z.boolean().default(false),
  }),
  z.object({
    mode:        z.literal('tasks'),
    tasks:       z.array(batchTaskSchema).min(1).max(30),
    concurrency: z.number().int().min(1).max(8).optional(),
    bypassCache: z.boolean().default(false),
  }),
]);

// ── Handler ──────────────────────────────────────────────────────────────────

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return json({ error: 'Invalid body', details: parsed.error.format() }, { status: 400 });
  }
  const body = parsed.data;

  // Resolve tasks before opening the stream so 4xx errors return synchronously.
  let tasks: BatchTask[];
  if (body.mode === 'hotspots') {
    const hotspots = await getAuditHotspots(body.topN);
    if (hotspots.length === 0) {
      return json({ error: 'No audit hotspots found. Run `npm run index:codebase:fast` first.' }, { status: 424 });
    }
    tasks = buildBatchTasks(hotspots);
  } else {
    tasks = body.tasks;
  }

  const concurrency = body.concurrency ?? Number(process.env.BATCH_FIX_CONCURRENCY ?? 3);

  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (event: string, data: unknown, id?: string) =>
        controller.enqueue(enc.encode(sseFormat(event, data, id)));

      const startedAt = Date.now();
      send('started', { totalTasks: tasks.length, concurrency, dirs: tasks.map((t) => t.dir) });

      let completed = 0;
      let failed    = 0;
      try {
        for await (const result of runBatchErrorAnalysis(tasks, {
          userId:      locals.user!.id,
          sessionId:   request.headers.get('x-session-id') ?? undefined,
          concurrency,
          bypassCache: body.bypassCache,
        })) {
          if (result.status === 'completed') completed++;
          else if (result.status === 'failed') failed++;
          send('progress', result, result.taskId);
        }
        send('completed', {
          totalCompleted: completed,
          totalFailed:    failed,
          durationMs:     Date.now() - startedAt,
        });
      } catch (err) {
        send('error', { error: (err as Error).message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: sseHeaders() });
};
