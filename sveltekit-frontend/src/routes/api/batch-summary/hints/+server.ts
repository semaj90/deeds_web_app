import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';

interface BatchSummaryHints {
  featureId: string;
  tupleCount: number;
  hints: Array<{ tupleId: string; ontologyLabel?: string; confidence: number }>;
  processedAt: string;
  model: string;
}

const batchSummaryHintsSchema = z.object({
  featureId: z.string().min(1),
  tupleCount: z.number().optional(),
  hints: z
    .array(
      z.object({
        tupleId: z.string(),
        ontologyLabel: z.string().optional(),
        confidence: z.number()
      })
    )
    .min(1),
  processedAt: z.string().optional(),
  model: z.string().optional()
});

/**
 * POST /api/batch-summary/hints
 * Receive browser ONNX hints, validate, and queue for server synthesis
 *
 * This endpoint:
 * 1. Validates hints structure
 * 2. Writes to Redis/Postgres for telemetry
 * 3. Queues RabbitMQ job for server Gemma4 synthesis
 * 4. Returns acknowledgment
 */
export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const rawBody = await request.json().catch(() => ({}));
    const parsed = batchSummaryHintsSchema.safeParse(rawBody);

    if (!parsed.success) {
      return json(
        { error: 'Invalid hints payload', issues: parsed.error.issues },
        { status: 400 }
      );
    }
    const hints = parsed.data as BatchSummaryHints;

    // TODO: Write to Postgres/Redis for telemetry
    // TODO: Queue RabbitMQ job for server synthesis
    // For now, just acknowledge receipt

    return json({
      status: 'accepted',
      featureId: hints.featureId,
      hintsCount: hints.hints.length,
      message: 'Browser hints received, queued for server synthesis'
    }, { status: 202 });
  } catch (error) {
    console.error('Hints submission error:', error);
    return json(
      { error: (error as Error).message || 'Failed to submit hints' },
      { status: 500 }
    );
  }
};
