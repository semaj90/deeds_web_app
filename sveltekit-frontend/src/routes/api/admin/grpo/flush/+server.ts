/**
 * POST /api/admin/grpo/flush
 *
 * Drains the Redis reward-event queue → GrpoTrainRow[] → JSONL file on disk
 * (logs/grpo/<timestamp>.jsonl).  Returns stats so the dashboard can display them.
 *
 * GET  /api/admin/grpo/flush — queue depth + last flush metadata (read-only).
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { flushGrpoQueue } from '$lib/server/analytics/grpo-exporter.js';
import { rewardQueueLength } from '$lib/server/analytics/reward-events.js';

export const GET: RequestHandler = async ({ locals }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

  const queueDepth = await rewardQueueLength();
  return json({ queueDepth, flushed: false });
};

export const POST: RequestHandler = async ({ locals, request }) => {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

  let batchSize = 500;
  try {
    const body = await request.json().catch(() => ({}));
    if (typeof body.batchSize === 'number') batchSize = Math.min(body.batchSize, 2000);
  } catch { /* use default */ }

  const result = await flushGrpoQueue({
    batchSize,
    writeToDisk: true,
    rootDir: process.cwd(),
  });

  return json({
    rowCount:      result.rowCount,
    drainedEvents: result.drainedEvents,
    filePath:      result.filePath,
    durationMs:    result.durationMs,
    flushed:       true,
  });
};