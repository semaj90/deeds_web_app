import { json, error } from '@sveltejs/kit';
import { z } from 'zod';
import { createHash, randomUUID } from 'node:crypto';
import { db } from '$lib/server/db/client.js';
import { sql } from 'drizzle-orm';
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

  // Map packet cache_hit to cacheTier enum expected by traceRouterDecision
  const cacheTierMap: Record<string, Parameters<typeof traceRouterDecision>[0]['cacheTier']> = {
    redis:   'valkey-exact',
    bifrost: 'valkey-semantic',
    qdrant:  'qdrant-fallback',
    none:    'none',
  };
  const cacheTier = cacheTierMap[result.packet?.cache_hit ?? 'none'] ??
    ((hitLane?.lane as string | undefined)?.includes('qdrant') ? 'qdrant-fallback' : 'none');
  const parsedUserId = Number(locals.user.id);
  const packetOwnerUserId = Number.isSafeInteger(parsedUserId) && parsedUserId > 0 ? parsedUserId : null;

  let packetUuid: string | null = null;
  try {
    const requestedPacketUuid = randomUUID();
    const persisted = await db.execute(sql`
      INSERT INTO route_runtime_packets (
        packet_uuid, user_id, route, query_hash, query_preview, source_refs,
        feature_ids, lane_ids, cluster_id, som_cluster, qdrant_hits,
        latency_ms, cache_hit, cache_tier, raw
      ) VALUES (
        ${requestedPacketUuid}::uuid,
        ${packetOwnerUserId},
        '/api/ace/route',
        ${queryHash},
        ${parsed.data.query.slice(0, 120)},
        ${JSON.stringify(result.packet.source_refs)}::jsonb,
        ${JSON.stringify(result.packet.feature_ids)}::jsonb,
        ${JSON.stringify(result.packet.lane_ids)}::jsonb,
        ${result.packet.cluster_id},
        ${result.packet.som_cluster},
        ${result.packet.qdrant_point_ids.length},
        ${durationMs},
        ${cacheHit},
        ${cacheTier},
        ${JSON.stringify({ schema: 'atlas.ace-route-telemetry.v1' })}::jsonb
      )
      RETURNING packet_uuid
    `);
    const storedPacketUuid = (persisted.rows[0] as { packet_uuid?: unknown } | undefined)?.packet_uuid;
    packetUuid = typeof storedPacketUuid === 'string' ? storedPacketUuid : null;
  } catch (cause) {
    console.error('[ace-route] packet feedback anchor persistence failed:', cause);
  }

  // Fire-and-forget Langfuse trace — never blocks response
  traceRouterDecision({
    query: parsed.data.query,
    queryHash,
    // Prefer first source_ref (file path) over semantic feature_id label so route_packet_rewards
    // can join against code_relations_v1.source_file. Fall back to featureHint/feature_ids if no
    // file-path source_ref is available.
    featureId: (() => {
      const firstRef = result.packet?.source_refs?.[0];
      if (firstRef && (firstRef.startsWith('src/') || firstRef.startsWith('scripts/'))) return firstRef;
      return parsed.data.featureHint ?? result.packet?.feature_ids?.[0];
    })(),
    cacheHit,
    cacheTier,
    sourceRefCount: result.packet?.source_refs?.length,
    packetUuid: packetUuid ?? undefined,
    durationMs,
    routeLanes: result.trace.map((t) => ({
      name: t.lane,
      hit: t.hit,
      latency_ms: t.latency_ms,
    })),
  }).catch(() => {});

  return json({
    packet: result.packet,
    packetUuid,
    trace: result.trace,
  });
};
