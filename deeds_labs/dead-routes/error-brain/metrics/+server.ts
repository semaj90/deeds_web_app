/**
 * GET /api/error-brain/metrics
 * POST /api/error-brain/metrics  (start/stop collector)
 *
 * Exposes MetricsCollector + LearningPipeline status from error-analysis services.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { getMetricsCollector } from '$lib/services/error-analysis/MetricsCollector.js';
import { getLearningPipeline } from '$lib/services/error-analysis/LearningPipeline.js';
import { z } from 'zod';

const metricsActionSchema = z.object({
  action: z.enum(['start', 'stop', 'reset', 'force_update']),
});

export const GET: RequestHandler = async () => {
  try {
    const metrics = getMetricsCollector();
    const pipeline = getLearningPipeline();

    return json({
      metrics: metrics.getSnapshot(),
      pipeline: pipeline.getStatus(),
      ts: new Date().toISOString(),
    });
  } catch (e) {
    return json(
      {
        metrics: null,
        pipeline: null,
        error: (e as Error).message,
        ts: new Date().toISOString(),
      },
      { status: 503 }
    );
  }
};

export const POST: RequestHandler = async ({ request }) => {
  const raw = await request.json().catch(() => ({}));
  const parsed = metricsActionSchema.safeParse(raw);
  if (!parsed.success)
    return json(
      { error: 'Unknown action. Use: start, stop, reset, force_update' },
      { status: 400 }
    );
  const { action } = parsed.data;

  const metrics = getMetricsCollector();
  const pipeline = getLearningPipeline();

  if (action === 'start') {
    metrics.start();
    pipeline.start();
    return json({ started: true });
  }

  if (action === 'stop') {
    metrics.stop();
    pipeline.stop();
    return json({ stopped: true });
  }

  if (action === 'reset') {
    metrics.reset();
    return json({ reset: true });
  }

  if (action === 'force_update') {
    await pipeline.forceUpdate();
    return json({ updated: true, status: pipeline.getStatus() });
  }

  return json({ error: 'Unknown action. Use: start, stop, reset, force_update' }, { status: 400 });
};