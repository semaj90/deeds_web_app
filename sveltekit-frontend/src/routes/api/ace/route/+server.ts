import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import { createHash } from 'node:crypto';
import { routeQuery } from '$lib/server/ace/query-router.js';
import { traceRouterDecision } from '$lib/server/observability/langfuse.js';
import type { RequestHandler } from './$types.js';

const schema = z.object({
  query: z.string().min(1).max(4000),
  clusterHint: z.string().optional(),
  featureHint: z.string().optional(),
  limit: z.number().int().min(1).max(50).default(10),
  collection: z.string().default('codebase_chunks_768'),
});

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) throw error(401, 'Unauthorized');

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    throw error(400, 'Invalid JSON');
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) throw error(400, parsed.error.issues[0]?.message ?? 'Invalid request');

  const t0 = Date.now();
  const result = await routeQuery(parsed.data);
  const durationMs = Date.now() - t0;

  const queryHash = createHash('sha256').update(parsed.data.query).digest('hex').slice(0, 16);
  const cacheHit = result.trace.some((t) => t.hit);
  const hitLane = result.trace.find((t) => t.hit);

  // Fire-and-forget Langfuse trace — never blocks response
  traceRouterDecision({
    query: parsed.data.query,
    queryHash,
    featureId: parsed.data.featureHint ?? result.packet?.feature_id,
    cacheHit,
    cacheTier: (hitLane?.lane as Parameters<typeof traceRouterDecision>[0]['cacheTier']) ?? 'none',
    reward: result.packet?.reward,
    sourceRefCount: (result.packet?.source_refs as unknown[])?.length,
    packetUuid: result.packet?.packet_id,
    durationMs,
    routeLanes: result.trace.map((t) => ({
      name: t.lane,
      hit: t.hit,
      latency_ms: t.latency_ms,
    })),
  }).catch(() => {});

  return json({
    packet: result.packet,
    trace: result.trace,
  });
};
