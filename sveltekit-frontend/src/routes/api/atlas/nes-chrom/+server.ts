import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import { getDb, withRetry } from '$lib/db/pool.js';

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 250;

function clampLimit(raw?: string | null) {
  const n = raw ? Number.parseInt(raw, 10) : DEFAULT_LIMIT;
  if (!Number.isFinite(n) || n <= 0) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((entry) => toNonEmptyString(entry)).filter(Boolean) as string[])];
}

function ratio(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return Number((numerator / denominator).toFixed(4));
}

function tally(values: unknown[]) {
  const counts = new Map<string, number>();
  for (const value of values) {
    const normalized = toNonEmptyString(value);
    if (!normalized) continue;
    counts.set(normalized, (counts.get(normalized) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .map(([value, count]) => ({ value, count }));
}

function sampleMissing(rows: Array<Record<string, unknown>>, field: string) {
  return rows.slice(0, 25).map((row) => ({
    packetId: row.id,
    packetKey: row.packet_key,
    queryHash: row.query_hash,
    chunkId: row.chunk_id,
    field,
    createdAt: row.created_at instanceof Date ? row.created_at.toISOString() : String(row.created_at ?? ''),
  }));
}

function buildWhereClause(filters: {
  sourceRef: string | null;
  featureId: string | null;
  queryHash: string | null;
  parentAtlasCardId: string | null;
}) {
  const clauses = [];

  if (filters.sourceRef) {
    clauses.push(sql`(
      p.source_ref = ${filters.sourceRef}
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(COALESCE(p.source_refs, '[]'::jsonb)) AS src(ref)
        WHERE src.ref = ${filters.sourceRef}
      )
      OR EXISTS (
        SELECT 1
        FROM nes_chrom_kag_dag_hits h_filter
        WHERE h_filter.packet_id = p.id
          AND h_filter.source_ref = ${filters.sourceRef}
      )
    )`);
  }

  if (filters.featureId) {
    clauses.push(sql`p.feature_id = ${filters.featureId}`);
  }

  if (filters.queryHash) {
    clauses.push(sql`p.query_hash = ${filters.queryHash}`);
  }

  if (filters.parentAtlasCardId) {
    clauses.push(sql`(
      COALESCE(p.payload->>'parentAtlasCardId', p.payload->>'parent_atlas_card_id') = ${filters.parentAtlasCardId}
      OR EXISTS (
        SELECT 1
        FROM nes_chrom_kag_dag_hits h_filter
        WHERE h_filter.packet_id = p.id
          AND COALESCE(h_filter.metadata->>'parentAtlasCardId', h_filter.metadata->>'parent_atlas_card_id') = ${filters.parentAtlasCardId}
      )
    )`);
  }

  return clauses.length > 0 ? sql`WHERE ${sql.join(clauses, sql` AND `)}` : sql``;
}

export const GET: RequestHandler = async ({ locals, url }) => {
  if (!locals.user) return json({ ok: false, error: 'Unauthorized' }, { status: 401 });

  const filters = {
    sourceRef: toNonEmptyString(url.searchParams.get('sourceRef')),
    featureId: toNonEmptyString(url.searchParams.get('featureId')),
    queryHash: toNonEmptyString(url.searchParams.get('queryHash')),
    parentAtlasCardId: toNonEmptyString(url.searchParams.get('parentAtlasCardId')),
  };
  const limit = clampLimit(url.searchParams.get('limit'));
  const offset = Math.max(0, Number.parseInt(url.searchParams.get('offset') ?? '0', 10) || 0);

  try {
    const relationCheck = await withRetry(async () =>
      getDb().execute(sql`
        SELECT
          to_regclass('public.nes_chrom_packets') AS packet_table,
          to_regclass('public.nes_chrom_kag_dag_hits') AS hit_table
      `)
    );
    const relationRow = relationCheck[0] ?? {};
    const packetTablePresent = Boolean(relationRow.packet_table);
    const hitTablePresent = Boolean(relationRow.hit_table);

    if (!packetTablePresent || !hitTablePresent) {
      return json({
        ok: true,
        degraded: true,
        queryPath: 'api/atlas/nes-chrom',
        filters: { ...filters, limit, offset },
        counts: { packets: 0, hits: 0 },
        packets: [],
        hits: [],
        summary: {
          sourceRefCoverage: 0,
          featureIdCoverage: 0,
          parentAtlasCoverage: 0,
          queryHashCoverage: 0,
          chunkIdCoverage: 0,
        },
        databaseStatus: {
          packetTablePresent,
          hitTablePresent,
          note: 'One or both NES chrom tables are absent in the current database.',
        },
      });
    }

    const whereClause = buildWhereClause(filters);

    const packetResult = await withRetry(async () =>
      getDb().execute(sql`
        SELECT
          p.id,
          p.packet_key,
          p.query_hash,
          p.chunk_id,
          p.source_ref,
          p.source_refs,
          p.feature_id,
          p.packet_type,
          p.lane,
          p.model,
          p.summary,
          p.payload,
          p.qdrant_point_id,
          p.kag_dag_run_id,
          p.kag_node_key,
          p.created_at,
          p.updated_at,
          COALESCE(p.payload->>'parentAtlasCardId', p.payload->>'parent_atlas_card_id') AS parent_atlas_card_id,
          COALESCE(p.payload->>'sourceRef', p.payload->>'source_ref', p.source_ref) AS payload_source_ref,
          COALESCE(p.payload->>'featureId', p.payload->>'feature_id', p.feature_id) AS payload_feature_id
        FROM nes_chrom_packets p
        ${whereClause}
        ORDER BY p.created_at DESC
        LIMIT ${limit}
        OFFSET ${offset}
      `)
    );

    const packets = packetResult.map((row: any) => {
      const payload = row.payload && typeof row.payload === 'object' ? row.payload : {};
      const sourceRefs = toStringArray(row.source_refs);
      const parentAtlasCardId =
        toNonEmptyString(row.parent_atlas_card_id) ??
        toNonEmptyString(payload.parentAtlasCardId) ??
        toNonEmptyString(payload.parent_atlas_card_id);
      return {
        ...row,
        payload,
        source_refs: sourceRefs,
        parent_atlas_card_id: parentAtlasCardId,
        payload_source_ref: toNonEmptyString(row.payload_source_ref),
        payload_feature_id: toNonEmptyString(row.payload_feature_id),
      };
    });

    const packetIds = packets.map((row: any) => row.id);
    const hits = packetIds.length > 0
      ? (
          await withRetry(async () =>
            getDb().execute(sql`
              SELECT
                h.id,
                h.packet_id,
                h.run_id,
                h.chunk_id,
                h.source_ref,
                h.hit_type,
                h.score,
                h.node_key,
                h.evidence,
                h.metadata,
                h.created_at
              FROM nes_chrom_kag_dag_hits h
              WHERE h.packet_id = ANY(${packetIds}::uuid[])
              ORDER BY h.created_at DESC
            `)
          )
        )
      : [];

    const hitsByPacket = new Map<string, any[]>();
    for (const hit of hits as any[]) {
      const packetId = String(hit.packet_id);
      const list = hitsByPacket.get(packetId) ?? [];
      list.push(hit);
      hitsByPacket.set(packetId, list);
    }

    const packetsWithSourceRef = packets.filter((row: any) => toNonEmptyString(row.source_ref) || row.payload_source_ref).length;
    const packetsWithFeatureId = packets.filter((row: any) => toNonEmptyString(row.feature_id) || row.payload_feature_id).length;
    const packetsWithParentAtlas = packets.filter((row: any) => {
      if (row.parent_atlas_card_id) return true;
      const packetHits = hitsByPacket.get(String(row.id)) ?? [];
      return packetHits.some((hit) => {
        const metadata = hit.metadata && typeof hit.metadata === 'object' ? hit.metadata : {};
        return toNonEmptyString(metadata.parentAtlasCardId) || toNonEmptyString(metadata.parent_atlas_card_id);
      });
    }).length;
    const packetsWithQueryHash = packets.filter((row: any) => toNonEmptyString(row.query_hash)).length;
    const packetsWithChunkId = packets.filter((row: any) => toNonEmptyString(row.chunk_id)).length;

    const missingFeatureRows = packets.filter((row: any) => !toNonEmptyString(row.feature_id));
    const missingSourceRows = packets.filter((row: any) => !toNonEmptyString(row.source_ref));
    const sourceRefsPreserved = packets.every((row: any) => row.source_refs.length > 0);
    const sourceRefPreserved = packets.every((row: any) => {
      const sourceRef = toNonEmptyString(row.source_ref);
      if (!sourceRef) return false;
      return row.source_refs.includes(sourceRef);
    });
    const featureIdPreserved = packets.every((row: any) => Boolean(toNonEmptyString(row.feature_id)));
    const parentAtlasCardIdPreserved = packets.every((row: any) => Boolean(row.parent_atlas_card_id));
    const replaySpineIntact = packets.every((row: any) => Boolean(toNonEmptyString(row.source_ref) && toNonEmptyString(row.feature_id)));
    const topSourceRefs = tally(packets.flatMap((row: any) => row.source_refs.length > 0 ? row.source_refs : [row.source_ref]));
    const topFeatureIds = tally(packets.map((row: any) => row.feature_id));

    return json({
      ok: true,
      queryPath: 'api/atlas/nes-chrom',
      filters: { ...filters, limit, offset },
      counts: {
        packets: packets.length,
        hits: hits.length,
      },
      summary: {
        sourceRefCoverage: ratio(packetsWithSourceRef, packets.length),
        featureIdCoverage: ratio(packetsWithFeatureId, packets.length),
        parentAtlasCoverage: ratio(packetsWithParentAtlas, packets.length),
        queryHashCoverage: ratio(packetsWithQueryHash, packets.length),
        chunkIdCoverage: ratio(packetsWithChunkId, packets.length),
      },
      packets,
      hits,
      top: {
        sourceRefs: topSourceRefs.slice(0, 10),
        featureIds: topFeatureIds.slice(0, 10),
      },
      missing: {
        featureId: sampleMissing(missingFeatureRows as any[], 'feature_id'),
        sourceRef: sampleMissing(missingSourceRows as any[], 'source_ref'),
      },
      integrity: {
        sourceRefPreserved,
        sourceRefsPreserved,
        featureIdPreserved,
        parentAtlasCardIdPreserved,
        sourceRefFeatureIdReplaySpineIntact: replaySpineIntact,
      },
      databaseStatus: {
        packetTablePresent: true,
        hitTablePresent: true,
        note: 'NES chrom tables are present in the current database.',
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({
      ok: false,
      error: 'nes_chrom_query_failed',
      message,
    }, { status: 500 });
  }
};
