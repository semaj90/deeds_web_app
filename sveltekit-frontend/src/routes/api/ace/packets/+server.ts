/**
 * POST /api/ace/packets
 *
 * Ingest a raw NES/CHROM packet into the Postgres provenance store.
 *
 * Steps:
 *   1. Insert packet into route_runtime_packets (raw jsonb + telemetry fields)
 *   2. Send packet to Gemma4 packet compiler → facts + edges + state
 *   3. Bulk-insert facts → route_packet_facts
 *   4. Bulk-insert edges → route_packet_edges
 *   5. Insert state snapshot → route_state_snapshots
 *
 * GET /api/ace/packets?feature_id=<id>&limit=<n>
 *   Returns state memory for a given feature_id.
 */

import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db/client';
import { sql } from 'drizzle-orm';
import { compilePacketWithGemma4 } from '$lib/server/features/ai/ace/gemma4-packet-compiler.js';

const ingestSchema = z.object({
  query_hash:  z.string().optional(),
  prompt_hash: z.string().optional(),
  reward:      z.number().optional(),
  feature_id:  z.string().optional(),
  som_cluster: z.string().optional(),
}).passthrough();

export async function POST({ request, locals }) {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const parsed = ingestSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: 'Invalid packet', details: parsed.error.format() }, { status: 400 });
  }

  const packet = parsed.data;

  // 1. Insert base packet row
  const inserted = await db.execute(sql`
    INSERT INTO route_runtime_packets
      (query_hash, prompt_hash, raw, reward)
    VALUES (
      ${packet.query_hash ?? null},
      ${packet.prompt_hash ?? null},
      ${JSON.stringify(packet)}::jsonb,
      ${packet.reward ?? null}
    )
    RETURNING id, packet_uuid, feature_id, som_cluster
  `);

  const row = inserted.rows[0] as {
    id: number;
    packet_uuid: string;
    feature_id: string | null;
    som_cluster: string | null;
  };
  const packetUuid = row.packet_uuid;

  // 2. Compile with Gemma4 (non-blocking errors degrade gracefully)
  let compiled = { facts: [] as ReturnType<typeof Object.values>, edges: [] as ReturnType<typeof Object.values>, state: {} as Record<string, unknown> };
  try {
    compiled = await compilePacketWithGemma4(packet) as typeof compiled;
  } catch (e) {
    console.warn('[ace/packets] Gemma4 compiler error:', (e as Error).message);
  }

  // 3. Insert facts
  for (const fact of (compiled.facts as Array<Record<string, unknown>>)) {
    await db.execute(sql`
      INSERT INTO route_packet_facts
        (packet_uuid, fact_type, fact_key, fact_value, score, metadata)
      VALUES (
        ${packetUuid}::uuid,
        ${String(fact.fact_type ?? '')},
        ${String(fact.fact_key ?? '')},
        ${fact.fact_value != null ? String(fact.fact_value) : null},
        ${fact.score != null ? Number(fact.score) : null},
        ${JSON.stringify(fact.metadata ?? {})}::jsonb
      )
    `);
  }

  // 4. Insert edges
  for (const edge of (compiled.edges as Array<Record<string, unknown>>)) {
    await db.execute(sql`
      INSERT INTO route_packet_edges
        (packet_uuid, src, dst, edge_type, weight, metadata)
      VALUES (
        ${packetUuid}::uuid,
        ${String(edge.src ?? '')},
        ${String(edge.dst ?? '')},
        ${String(edge.edge_type ?? '')},
        ${edge.weight != null ? Number(edge.weight) : 1},
        ${JSON.stringify(edge.metadata ?? {})}::jsonb
      )
    `);
  }

  // 5. Insert state snapshot
  const state = (compiled.state ?? {}) as Record<string, unknown>;
  await db.execute(sql`
    INSERT INTO route_state_snapshots
      (packet_uuid, state_key, compressed_state, token_map)
    VALUES (
      ${packetUuid}::uuid,
      ${String(state.next_route_recommendation ?? 'default')},
      ${JSON.stringify(state)}::jsonb,
      ${JSON.stringify({ token_hints: Array.isArray(state.token_hints) ? state.token_hints : [] })}::jsonb
    )
  `);

  return json({
    ok: true,
    packetUuid,
    rowId: row.id,
    featureId: row.feature_id,
    factsWritten: (compiled.facts as unknown[]).length,
    edgesWritten: (compiled.edges as unknown[]).length,
    compiled,
  });
}

export async function GET({ url, locals }) {
  if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

  const featureId = url.searchParams.get('feature_id');
  const packetUuid = url.searchParams.get('packet_uuid');
  const limit = Math.min(Number(url.searchParams.get('limit') ?? '5'), 50);

  if (!featureId && !packetUuid) {
    return json({ error: 'Provide feature_id or packet_uuid' }, { status: 400 });
  }

  // State memory recall query
  const rows = featureId
    ? await db.execute(sql`
        SELECT
          p.id,
          p.packet_uuid,
          p.captured_at,
          p.feature_id,
          p.som_cluster,
          s.state_key,
          s.compressed_state,
          s.token_map
        FROM route_runtime_packets p
        JOIN route_state_snapshots s ON s.packet_uuid = p.packet_uuid
        WHERE p.feature_id = ${featureId}
        ORDER BY p.captured_at DESC
        LIMIT ${limit}
      `)
    : await db.execute(sql`
        SELECT
          p.id,
          p.packet_uuid,
          p.captured_at,
          p.feature_id,
          p.som_cluster,
          s.state_key,
          s.compressed_state,
          s.token_map,
          array_agg(
            json_build_object(
              'fact_type', f.fact_type,
              'fact_key',  f.fact_key,
              'fact_value',f.fact_value,
              'score',     f.score
            )
          ) FILTER (WHERE f.id IS NOT NULL) AS facts,
          array_agg(
            json_build_object(
              'src',       e.src,
              'dst',       e.dst,
              'edge_type', e.edge_type,
              'weight',    e.weight
            )
          ) FILTER (WHERE e.id IS NOT NULL) AS edges
        FROM route_runtime_packets p
        JOIN route_state_snapshots s ON s.packet_uuid = p.packet_uuid
        LEFT JOIN route_packet_facts f ON f.packet_uuid = p.packet_uuid
        LEFT JOIN route_packet_edges e ON e.packet_uuid = p.packet_uuid
        WHERE p.packet_uuid = ${packetUuid}::uuid
        GROUP BY p.id, p.packet_uuid, p.captured_at, p.feature_id, p.som_cluster,
                 s.state_key, s.compressed_state, s.token_map
        LIMIT 1
      `);

  return json({ ok: true, rows: rows.rows });
}
