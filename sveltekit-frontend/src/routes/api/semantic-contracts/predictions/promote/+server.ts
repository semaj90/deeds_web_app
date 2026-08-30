/**
 * POST /api/semantic-contracts/predictions/promote
 *
 * Promote a staged domain prediction to canonical state.
 *
 * Authorization required: PROMOTION_GATE role
 * Request body: { prediction_id: string, target_domain?: string (override) }
 * Response: { status: 'APPROVED', promoted_at: ISO8601, packet_key: string }
 *
 * Workflow:
 *   1. Load prediction from atlas_domain_predictions (status must be ACCEPTED)
 *   2. Verify authorization (require locals.user, PROMOTION_GATE role)
 *   3. Update prediction status → SUPERSEDED, set authorized_by, authorized_at
 *   4. Update atlas_packets.domain_class (if target_domain specified, use it; else use predicted_domain)
 *   5. Invalidate Redis cache for packet
 *   6. Return confirmation
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { requirePromotionGate, getAuthorizedBy } from '$lib/server/auth/promotion-gate';

const PromoteBodySchema = z.object({
  prediction_id: z.string().min(1),
  target_domain: z.string().min(1).optional()
});

export const POST: RequestHandler = async ({ request, locals }) => {
  // 1. Authorization gate
  if (!requirePromotionGate(locals)) {
    return json({ error: 'Unauthorized (missing PROMOTION_GATE role)' }, { status: 403 });
  }

  // 2. Parse + validate request
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = PromoteBodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return json(
      { error: 'Invalid request body', issues: parsed.error.issues },
      { status: 400 }
    );
  }

  const { prediction_id, target_domain } = parsed.data;

  try {
    // 3. Load prediction from Postgres
    const { db } = await import('$lib/server/db/client');
    const { sql } = await import('drizzle-orm');

    const predictions = await db.execute(sql`
      SELECT prediction_id, packet_key, predicted_domain, status, calibrated_confidence
      FROM atlas_domain_predictions
      WHERE prediction_id = ${prediction_id}::uuid
      LIMIT 1
    `);

    const prediction = predictions.rows?.[0] as any;
    if (!prediction) {
      return json({ error: 'Prediction not found' }, { status: 404 });
    }

    if (prediction.status !== 'ACCEPTED') {
      return json(
        { error: `Prediction status is ${prediction.status}, must be ACCEPTED to promote` },
        { status: 400 }
      );
    }

    const domain_to_promote = target_domain || prediction.predicted_domain;
    const authorized_by = getAuthorizedBy(locals);
    const now = new Date().toISOString();

    // 4. Promote to canonical in transaction
    await db.execute(sql`
      BEGIN;

      -- Update prediction status to SUPERSEDED
      UPDATE atlas_domain_predictions
      SET status = 'SUPERSEDED', authorized_by = ${authorized_by}, authorized_at = ${now}, promoted_to_canonical_at = ${now}
      WHERE prediction_id = ${prediction_id}::uuid;

      -- Update canonical packet domain class
      UPDATE atlas_packets
      SET domain_class = ${domain_to_promote}, updated_at = ${now}
      WHERE packet_key = ${prediction.packet_key};

      COMMIT;
    `);

    // 5. Invalidate Redis cache
    try {
      const { getRedis } = await import('$lib/server/redis');
      const redis = getRedis();
      await Promise.all([
        redis.del(`bifrost:packet:${prediction.packet_key}`),
        redis.del(`bifrost:trace:${prediction.packet_key}`),
        redis.del(`centroid:packet:${prediction.packet_key}`),
      ]);
    } catch (redisErr) {
      console.warn('[promote] Redis invalidation failed:', redisErr);
      // Non-blocking: continue if Redis fails
    }

    // 6. Return confirmation
    return json(
      {
        status: 'APPROVED',
        promoted_at: now,
        prediction_id,
        packet_key: prediction.packet_key,
        domain_class: domain_to_promote,
        authorized_by,
      },
      { status: 200 }
    );
  } catch (err) {
    console.error('[promote] Error promoting prediction:', err);
    return json(
      { error: 'Failed to promote prediction', details: (err as Error).message },
      { status: 500 }
    );
  }
};
