import pg from 'pg';
import crypto from 'node:crypto';
import { ENV } from '$lib/server/env.server.js';
import type { FTSResult } from '$lib/server/search/postgres-fts.js';
import { expandNeighbours } from '$lib/server/search/neo4j-rerank.js';
import { recordRetrievalTelemetry, type RetrievalHit } from '../telemetry/retrieval-recorder.js';
import { multiLaneRetrievalWithRRF } from './rrf-integration.js';
import { toStableFileKey } from './subgraph-seed-neighborhood.js';
import { getRedis } from '../redis.js';

export type HyperRagPacketRpcInput = {
  query: string;
  limit?: number;
  includeGraph?: boolean;
  useFts?: boolean;
  recordTelemetry?: boolean;
  awaitTelemetry?: boolean;
  useExactMatchCache?: boolean;
};

export type HyperRagPacketRpcPacket = {
  packet_key: string;
  packet_type: 'chrom97' | 'neschrom97';
  source_ref: string;
  canonical_source_ref: string;
  feature_id: string | null;
  feature_label: string | null;
  directory_path: string | null;
  qdrant_tags: string[];
  neo4j_neighbors: string[];
  retrieval_lanes: {
    dense: number;
    fts: number;
    trigram: number;
    jsonb: number;
  };
  fusion_score: number;
  fusion_sources: string[];
  gemma4_summary: string | null;
  recommended_action: string | null;
  verification_command: string | null;
  rank: number;
};

export type HyperRagPacketRpcResult = {
  query: string;
  strategy: 'fusion';
  packets: HyperRagPacketRpcPacket[];
  trace: {
    retrieval_strategy: 'fusion' | 'fts-only';
    qdrant_hits: number;
    postgres_hits: number;
    rrf_hits: number;
    neo4j_expansions: number;
    duckdb_join_used: false;
    latency_ms: number;
    fusion_used: boolean;
    collection_split: {
      runtime_legal: 'legal_documents';
      codebase_topology: 'codebase_chunks_768';
    };
  };
};

type ParentAtlasRow = {
  source_ref: string | null;
  rel_path: string | null;
  feature_id: string | null;
  summary_lod0: string | null;
  summary_lod1: string | null;
  summary: string | null;
  tags: string[] | null;
  payload: Record<string, unknown> | null;
};

type QueryEvalTelemetryPayload = {
  route: string;
  result_count: number;
  packet_keys: string[];
  feature_ids: string[];
  source_refs: string[];
  cache_hit_source: string | null;
  error: string | null;
  packet_summaries: Array<{
    packet_key: string;
    source_ref: string;
    feature_id: string | null;
    fusion_score: number;
    rank: number;
  }>;
};

type NesPacketRow = {
  packet_key: string;
  source_ref: string | null;
  feature_id: string | null;
  summary: string | null;
  qdrant_point_id: string | null;
  som_cluster: string | null;
  payload: Record<string, unknown> | null;
};

let packetRpcPool: pg.Pool | null = null;

function getPacketRpcPool(): pg.Pool {
  if (!packetRpcPool) {
    packetRpcPool = new pg.Pool({
      connectionString: ENV.DATABASE_URL,
      max: 1,
      connectionTimeoutMillis: 3000,
      idleTimeoutMillis: 5000,
      statement_timeout: 3000,
    });
  }
  return packetRpcPool;
}

function cleanText(value: unknown): string {
  return String(value ?? '').trim();
}

function splitTags(value: unknown): string[] {
  if (Array.isArray(value)) return [...new Set(value.map(cleanText).filter(Boolean))];
  return [...new Set(cleanText(value).split(/[,\s]+/).map((tag) => tag.trim()).filter(Boolean))];
}

function sourceRefCandidates(hit: FTSResult): string[] {
  return [...new Set([hit.file_path, hit.stable_key].map(cleanText).filter(Boolean))];
}

function metaString(value: unknown): string {
  return cleanText(value);
}

function packetSeedCandidatesFromRrf(
  results: Array<{
    id: string;
    combinedScore: number;
    sources: string[];
    text?: string;
    metadata?: Record<string, unknown>;
    breakdown?: Array<{ laneName: string; laneScore: number; metadata?: Record<string, unknown> }>;
  }>
): Array<{
  stable_key: string;
  file_path: string | null;
  source_refs: string[];
  lexical_score: number;
  dense_score: number;
  packet_key: string | null;
  headline: string | null;
  tags: string | null;
  content: string | null;
  kind: 'rrf';
}> {
  return results.map((row) => {
    const metadata = (row.metadata ?? {}) as Record<string, unknown>;
    const breakdownMetas = (row.breakdown ?? []).map((b) => b.metadata ?? {}).filter((m): m is Record<string, unknown> => Boolean(m));
    const refs = new Set<string>();
    for (const rawValue of [
      row.id,
      metadata.packet_key,
      metadata.packetKey,
      metadata.source_ref,
      metadata.sourceRef,
      metadata.canonicalSourceRef,
      metadata.file_path,
      metadata.filePath,
      metadata.path,
      metadata.qdrant_point_id,
      ...breakdownMetas.flatMap((m) => [
        m.packet_key,
        m.packetKey,
        m.source_ref,
        m.sourceRef,
        m.canonicalSourceRef,
        m.file_path,
        m.filePath,
        m.path,
        m.qdrant_point_id,
      ]),
    ]) {
      const normalized = cleanText(rawValue);
      if (normalized) refs.add(normalized);
    }

    const denseScore =
      row.breakdown?.find((score) => score.laneName === 'qdrant_vector' || score.laneName === 'turbovec_ann')?.laneScore ??
      0;
    const packetKey = metaString(metadata.packet_key ?? metadata.packetKey ?? row.id) || null;
    const filePath = metaString(metadata.file_path ?? metadata.filePath ?? metadata.path) || null;
    return {
      stable_key: metaString(row.id),
      file_path: filePath,
      source_refs: [...refs],
      lexical_score: 0,
      dense_score: Number(denseScore ?? row.combinedScore ?? 0),
      packet_key: packetKey,
      headline: metaString(row.text ?? metadata.summary ?? metadata.content) || null,
      tags: metaString(metadata.tags) || null,
      content: metaString(row.text ?? metadata.summary ?? metadata.content) || null,
      kind: 'rrf' as const,
    };
  });
}

function packetSeedCandidatesFromFts(hits: FTSResult[]): Array<{
  stable_key: string;
  file_path: string | null;
  source_refs: string[];
  lexical_score: number;
  dense_score: number;
  packet_key: string | null;
  headline: string | null;
  tags: string | null;
  content: string | null;
  kind: 'fts';
}> {
  return hits.map((hit) => ({
    stable_key: cleanText(hit.stable_key),
    file_path: cleanText(hit.file_path) || null,
    source_refs: sourceRefCandidates(hit),
    lexical_score: Number(hit.lexical_score ?? 0),
    dense_score: 0,
    packet_key: cleanText(hit.stable_key) || null,
    headline: cleanText(hit.headline) || null,
    tags: cleanText(hit.tags) || null,
    content: cleanText(hit.content) || null,
    kind: 'fts' as const,
  }));
}

function directoryPath(sourceRef: string): string | null {
  const normalized = sourceRef.replace(/\\/g, '/');
  const idx = normalized.lastIndexOf('/');
  return idx > 0 ? normalized.slice(0, idx) : null;
}

function featureLabelFrom(row: ParentAtlasRow | NesPacketRow | undefined, featureId: string | null): string | null {
  const payload = row?.payload;
  const label = payload?.feature_label ?? payload?.featureLabel ?? payload?.label ?? payload?.title;
  return cleanText(label) || featureId;
}

async function recordPacketRpcTelemetry(params: {
  query: string;
  latencyMs: number;
  ftsHits: number;
  vectorHits: number;
  packets: HyperRagPacketRpcPacket[];
  timings?: {
    bm25_ms?:    number;
    qdrant_ms?:  number;
    redis_ms?:   number;
    neo4j_ms?:   number;
    fusion_ms?:  number;
    rerank_ms?:  number;
  };
}): Promise<void> {
  try {
    const packetKeys = params.packets.map((packet) => packet.packet_key).filter(Boolean);
    const featureIds = [...new Set(params.packets.map((packet) => packet.feature_id).filter((featureId): featureId is string => Boolean(featureId)))];

    const hits: RetrievalHit[] = params.packets.map(p => ({
      packet_key: p.packet_key,
      feature_id: p.feature_id,
      source_ref: p.source_ref,
      fusion_score: p.fusion_score,
      retrieval_strategy: 'fusion',
    }));

    await recordRetrievalTelemetry({
      query: params.query,
      latencyMs: params.latencyMs,
      vectorHits: params.vectorHits,
      trigramHits: 0,
      ftsHits: params.ftsHits,
      selectedPacketKey: packetKeys[0] ?? null,
      selectedPacketKeys: packetKeys,
      selectedFeatureId: featureIds[0] ?? null,
      featureIds: featureIds,
      fusionScore: params.packets[0]?.retrieval_lanes.fts ?? null,
      cacheHit: false,
      surface: 'hyperrag-packet-rpc',
      environment: 'phase-3d-retrieval-telemetry',
      retrievalStrategy: 'fusion',
      hitsPayload: {
        hits,
        counts: {
          packet_hits: params.packets.length,
          cache_hits: 0,
          neo4j_expansions: params.packets.reduce((sum, p) => sum + (p.neo4j_neighbors?.length ?? 0), 0),
        }
      },
      timings: params.timings,
      domainClass: params.packets[0] ? 'retrieval_pipeline' : null,
      sourceRef: params.packets[0]?.source_ref ?? null,
    });
  } catch (err) {
    console.warn('[hyperrag-packet-rpc] telemetry record failed:', err instanceof Error ? err.message : String(err));
  }
}

async function loadParentAtlas(sourceRefs: string[]): Promise<Map<string, ParentAtlasRow>> {
  if (!sourceRefs.length) return new Map();
  try {
    const { rows } = await getPacketRpcPool().query<ParentAtlasRow>(
      `
        select source_ref, rel_path, feature_id, summary_lod0, summary_lod1, summary, tags, payload
        from parent_atlas_documents
        where source_ref = any($1::text[])
           or rel_path = any($1::text[])
        limit 250
      `,
      [sourceRefs],
    );

    const out = new Map<string, ParentAtlasRow>();
    for (const row of rows) {
      if (row.source_ref) out.set(row.source_ref, row);
      if (row.rel_path) out.set(row.rel_path, row);
    }
    return out;
  } catch {
    return new Map();
  }
}

async function loadNesPackets(sourceRefs: string[]): Promise<Map<string, NesPacketRow>> {
  if (!sourceRefs.length) return new Map();
  try {
    const { rows } = await getPacketRpcPool().query<NesPacketRow>(
      `
        select packet_key, source_ref, feature_id, summary, qdrant_point_id, som_cluster, payload
        from nes_chrom_packets
        where source_ref = any($1::text[])
        order by updated_at desc nulls last, created_at desc nulls last
        limit 250
      `,
      [sourceRefs],
    );

    const out = new Map<string, NesPacketRow>();
    for (const row of rows) {
      if (row.source_ref && !out.has(row.source_ref)) out.set(row.source_ref, row);
    }
    return out;
  } catch {
    return new Map();
  }
}

async function searchCodeLexicalBounded(query: string, limit: number): Promise<FTSResult[]> {
  const client = await getPacketRpcPool().connect();
  try {
    await client.query('begin');
    await client.query(`set local statement_timeout = '3000ms'`);
    const { rows } = await client.query<FTSResult>(
      'SELECT * FROM search_code_lexical($1, $2, $3)',
      [query, limit, null],
    );
    await client.query('commit');
    return rows;
  } catch {
    await client.query('rollback').catch(() => {});
    return [];
  } finally {
    client.release();
  }
}

async function fallbackParentAtlas(query: string, limit: number): Promise<FTSResult[]> {
  try {
    const { rows } = await getPacketRpcPool().query<{
      source_ref: string;
      rel_path: string | null;
      summary_lod0: string | null;
      summary_lod1: string | null;
      summary: string | null;
      tags: string[] | null;
    }>(
      `
        select source_ref, rel_path, summary_lod0, summary_lod1, summary, tags
        from parent_atlas_documents
        where source_ref is not null
          and source_ref <> $1
        order by updated_at desc nulls last, id desc
        limit $2
      `,
      ['', limit],
    );

    return rows.map((row, index) => ({
      stable_key: row.source_ref,
      file_path: row.rel_path ?? row.source_ref,
      symbol_name: null,
      symbol_kind: null,
      language: null,
      content: row.summary_lod0 ?? row.summary_lod1 ?? row.summary ?? '',
      tags: (row.tags ?? []).join(','),
      topo_class: null,
      graph_authority_score: 0,
      lexical_score: Math.max(0.01, 1 - index / Math.max(1, limit)),
      headline: row.summary_lod0 ?? row.summary_lod1 ?? row.summary ?? '',
    }));
  } catch {
    return [];
  }
}

async function recordQueryEvalTimes(params: {
  queryHash: string | null;
  route: string;
  resultCount: number;
  qdrantMs: number | null;
  bm25Ms: number | null;
  pgvectorMs: number | null;
  redisMs: number | null;
  bitfrostMs: number | null;
  neo4jMs: number | null;
  turbovecMs: number | null;
  rrfMs: number | null;
  gemma4Ms: number | null;
  totalMs: number | null;
  cacheHitSource: string | null;
  ttlRemaining: number | null;
  error: string | null;
  payload: QueryEvalTelemetryPayload;
}): Promise<void> {
  try {
    await getPacketRpcPool().query(
      `
        INSERT INTO atlas_retrieval_eval_times (
          query_hash, route, result_count, error,
          packet_key, feature_id, source_ref,
          domain_class, ontology_label, topology_label,
          qdrant_ms, bm25_ms, pg_bm25_ms, pgvector_ms, redis_ms, bitfrost_ms,
          neo4j_ms, turbovec_ms, rerank_ms, gemma4_ms, total_ms,
          cache_hit_source, ttl_remaining, payload
        ) VALUES (
          $1, $2, $3, $4,
          $5, $6, $7,
          $8, $9, $10,
          $11, $12, $13, $14, $15,
          $16, $17, $18, $19, $20,
          $21, $22, $23, $24
        )
      `,
      [
        params.queryHash,
        params.route,
        params.resultCount,
        params.error,
        null,
        null,
        null,
        'retrieval_pipeline',
        'hyperrag_fusion',
        'core_search_entrypoint',
        params.qdrantMs,
        params.bm25Ms,
        params.bm25Ms,
        params.pgvectorMs,
        params.redisMs,
        params.bitfrostMs,
        params.neo4jMs,
        params.turbovecMs,
        params.rrfMs,
        params.gemma4Ms,
        params.totalMs,
        params.cacheHitSource,
        params.ttlRemaining,
        JSON.stringify(params.payload),
      ]
    );
  } catch (err) {
    console.warn('[hyperrag-packet-rpc] recordEvalTimes failed:', err instanceof Error ? err.message : String(err));
  }
}

export async function hyperragPacketRpc(input: HyperRagPacketRpcInput): Promise<HyperRagPacketRpcResult> {
  const startedAt = Date.now();
  const query = cleanText(input.query);
  const limit = Math.max(1, Math.min(Number(input.limit ?? 10), 25));
  const includeGraph = input.includeGraph !== false;
  const useFts = input.useFts !== false;

  if (!query) {
    throw new Error('query is required');
  }

  const useCache = input.useExactMatchCache !== false;
  const qHash = crypto.createHash('sha256').update(query.trim().toLowerCase()).digest('hex').slice(0, 16);
  const cacheKey = `hyperrag:query:${qHash}`;
  const route = '/api/hyperrag/packet-rpc';

  let redisMs = 0;
  try {
    if (useCache) {
      const redis = getRedis();
      const tRedisStart = performance.now();
      const pipeline = redis.pipeline();
      pipeline.get(cacheKey);
      pipeline.get(`${cacheKey}:prov`);
      pipeline.ttl(cacheKey);
      const redisResults = await pipeline.exec().catch(() => null);
      redisMs = performance.now() - tRedisStart;

      if (redisResults) {
        const [resErr, resVal] = redisResults[0] || [];
        const [provErr, provVal] = redisResults[1] || [];
        const [ttlErr, ttlVal] = redisResults[2] || [];

        if (!resErr && resVal) {
          try {
            const cachedLlmResponse = JSON.parse(String(resVal)) as { content?: string };
            const parsed = JSON.parse(cachedLlmResponse.content ?? '{}') as HyperRagPacketRpcResult;
            if (parsed && Array.isArray(parsed.packets)) {
              const ttlRemaining = typeof ttlVal === 'number' ? ttlVal : null;
              const totalMs = Date.now() - startedAt;
              const cachedResult = {
                ...parsed,
                trace: {
                  ...parsed.trace,
                  latency_ms: totalMs,
                }
              };

              await recordQueryEvalTimes({
                queryHash: qHash,
                route,
                resultCount: cachedResult.packets.length,
                qdrantMs: 0,
                bm25Ms: 0,
                pgvectorMs: 0,
                redisMs,
                bitfrostMs: 0,
                neo4jMs: 0,
                turbovecMs: 0,
                rrfMs: 0,
                gemma4Ms: 0,
                totalMs,
                cacheHitSource: 'redis',
                ttlRemaining,
                error: null,
                payload: {
                  route,
                  result_count: cachedResult.packets.length,
                  packet_keys: cachedResult.packets.map((packet) => packet.packet_key),
                  feature_ids: [...new Set(cachedResult.packets.map((packet) => packet.feature_id).filter((value): value is string => Boolean(value)))],
                  source_refs: [...new Set(cachedResult.packets.map((packet) => packet.source_ref))],
                  cache_hit_source: 'redis',
                  error: null,
                  packet_summaries: cachedResult.packets.map((packet) => ({
                    packet_key: packet.packet_key,
                    source_ref: packet.source_ref,
                    feature_id: packet.feature_id,
                    fusion_score: packet.fusion_score,
                    rank: packet.rank,
                  })),
                },
              });

              return cachedResult;
            }
          } catch (err) {
            console.warn('[hyperrag-packet-rpc] Cache parse failed in RPC:', err);
          }
        }
      }
    }

    const [rrfResult, initialFtsHits] = await Promise.all([
      includeGraph ? multiLaneRetrievalWithRRF(query, getPacketRpcPool(), { topK: limit, minScore: 0.001 }).catch(() => null) : Promise.resolve(null),
      useFts ? searchCodeLexicalBounded(query, limit) : Promise.resolve([]),
    ]);

  let ftsHits = initialFtsHits;
  if (!ftsHits.length) {
    ftsHits = await fallbackParentAtlas(query, limit);
  }

  const rrfSeeds = rrfResult?.results?.length ? packetSeedCandidatesFromRrf(rrfResult.results) : [];
  const ftsSeeds = packetSeedCandidatesFromFts(ftsHits);
  const allSeeds = [...ftsSeeds, ...rrfSeeds];
  const dedupedSeeds = Array.from(
    new Map(
      allSeeds.map((seed) => {
        const key =
          seed.packet_key ||
          seed.source_refs[0] ||
          seed.file_path ||
          seed.stable_key;
        return [key.toLowerCase(), seed] as const;
      })
    ).values()
  );

  const candidateRefs = [...new Set(dedupedSeeds.flatMap((seed) => seed.source_refs))];
  const [parentAtlas, nesPackets] = await Promise.all([
    loadParentAtlas(candidateRefs),
    loadNesPackets(candidateRefs),
  ]);

  let neo4jExpansions = 0;
  const fusionLookup = new Map<string, { score: number; sources: string[] }>();
  if (rrfResult?.results?.length) {
    for (const row of rrfResult.results) {
      const score = Number(row.combinedScore ?? 0);
      const sources = Array.isArray(row.sources) ? row.sources.map((source) => String(source)) : [];
      const metadata = (row.metadata ?? {}) as Record<string, unknown>;
      const keys = [
        String(row.id ?? '').trim(),
        String(row.text ?? '').trim(),
        String(metadata.packet_key ?? metadata.packetKey ?? '').trim(),
        String(metadata.source_ref ?? metadata.sourceRef ?? metadata.canonicalSourceRef ?? '').trim(),
        String(metadata.file_path ?? metadata.filePath ?? metadata.path ?? '').trim(),
        String(metadata.qdrant_point_id ?? '').trim(),
      ].filter(Boolean);
      for (const key of keys) {
        const normalized = key.toLowerCase();
        if (!fusionLookup.has(key)) fusionLookup.set(key, { score, sources });
        if (!fusionLookup.has(normalized)) fusionLookup.set(normalized, { score, sources });
      }
    }
  }
  const packets: HyperRagPacketRpcPacket[] = [];
  const seedsToEmit = dedupedSeeds.slice(0, limit);
  const neighborsBySeed = includeGraph
    ? await Promise.all(
        seedsToEmit.map((seed) =>
          expandNeighbours(
            toStableFileKey(seed.source_refs[0] ?? seed.file_path ?? seed.stable_key),
            1,
          ).catch(() => [])
        )
      )
    : seedsToEmit.map(() => []);

  for (const [index, seed] of seedsToEmit.entries()) {
    const candidates = seed.source_refs.length ? seed.source_refs : [seed.file_path ?? seed.stable_key];
    const sourceRef =
      candidates.find((candidate) => parentAtlas.has(candidate) || nesPackets.has(candidate)) ??
      candidates[0] ??
      seed.stable_key;
    const atlasRow = parentAtlas.get(sourceRef) ?? candidates.map((candidate) => parentAtlas.get(candidate)).find(Boolean);
    const nesRow = nesPackets.get(sourceRef) ?? candidates.map((candidate) => nesPackets.get(candidate)).find(Boolean);
    const featureId = nesRow?.feature_id ?? atlasRow?.feature_id ?? null;
    const packetKey = nesRow?.packet_key ?? `hyperrag:${sourceRef || seed.stable_key}`;
    const canonicalSourceRef = atlasRow?.source_ref ?? nesRow?.source_ref ?? sourceRef;
    const packetType: HyperRagPacketRpcPacket['packet_type'] = nesRow ? 'neschrom97' : 'chrom97';
    const neighbors = neighborsBySeed[index] ?? [];
    neo4jExpansions += neighbors.length;
    const fusionHit =
      fusionLookup.get(packetKey) ??
      fusionLookup.get(sourceRef) ??
      fusionLookup.get(seed.stable_key) ??
      (seed.file_path ? fusionLookup.get(seed.file_path) : undefined) ??
      fusionLookup.get(seed.stable_key.toLowerCase()) ??
      (seed.file_path ? fusionLookup.get(seed.file_path.toLowerCase()) : undefined);
    const fusionScore = fusionHit?.score ?? 0;
    const recommendedAction =
      fusionScore >= 0.85
        ? 'Use this packet as primary evidence and patch the source file only if the cited line is stale.'
        : 'Use this packet as evidence, then verify the nearest source_ref and graph neighbors.';

    packets.push({
      packet_key: packetKey,
      packet_type: packetType,
      source_ref: sourceRef,
      canonical_source_ref: canonicalSourceRef,
      feature_id: featureId,
      feature_label: featureLabelFrom(nesRow ?? atlasRow, featureId),
      directory_path: directoryPath(atlasRow?.rel_path ?? sourceRef),
      qdrant_tags: splitTags(seed.tags).concat(splitTags(atlasRow?.tags)).filter((tag, tagIndex, all) => all.indexOf(tag) === tagIndex),
      neo4j_neighbors: neighbors,
      retrieval_lanes: {
        dense: Number(seed.dense_score || fusionHit?.score || 0),
        fts: Number(seed.lexical_score ?? 0),
        trigram: 0,
        jsonb: atlasRow || nesRow ? 1 : 0,
      },
      fusion_score: fusionScore,
      fusion_sources: fusionHit?.sources ?? [],
      gemma4_summary: nesRow?.summary ?? atlasRow?.summary_lod0 ?? atlasRow?.summary_lod1 ?? atlasRow?.summary ?? seed.headline ?? null,
      recommended_action: recommendedAction,
      verification_command: 'npm run smoke:hyperrag-packet-rpc',
      rank: index + 1,
    });
  }

  packets.sort((a, b) => {
    const fusionDelta = (b.fusion_score ?? 0) - (a.fusion_score ?? 0);
    if (fusionDelta !== 0) return fusionDelta;
    const denseDelta = (b.retrieval_lanes.dense ?? 0) - (a.retrieval_lanes.dense ?? 0);
    if (denseDelta !== 0) return denseDelta;
    const lexicalDelta = (b.retrieval_lanes.fts ?? 0) - (a.retrieval_lanes.fts ?? 0);
    if (lexicalDelta !== 0) return lexicalDelta;
    return a.rank - b.rank;
  });

  packets.forEach((packet, rank) => {
    packet.rank = rank + 1;
  });

  const latencyMs = Date.now() - startedAt;
  const result: HyperRagPacketRpcResult = {
    query,
    strategy: 'fusion',
    packets,
    trace: {
      retrieval_strategy: rrfResult?.results?.length ? 'fusion' : 'fts-only',
      qdrant_hits: packets.filter((packet) => packet.qdrant_tags.length > 0).length,
      postgres_hits: ftsHits.length,
      rrf_hits: rrfResult?.results?.length ?? 0,
      neo4j_expansions: neo4jExpansions,
      duckdb_join_used: false,
      latency_ms: latencyMs,
      fusion_used: Boolean(rrfResult?.results?.length),
      collection_split: {
        runtime_legal: 'legal_documents',
        codebase_topology: 'codebase_chunks_768',
      },
    },
  };

  // Save result to exact-match cache on cache miss
  if (useCache && packets.length > 0) {
    try {
      const redis = getRedis();
      const payload = {
        content: JSON.stringify(result),
        model: 'hyperrag',
        backend: 'hyperrag-fusion',
        promptTokens: 0,
        completionTokens: 0,
        cachedAt: new Date().toISOString(),
      };
      const provenance = {
        packet_key: packets[0].packet_key,
        feature_id: packets[0].feature_id ?? 'unknown',
        source_ref: packets[0].source_ref,
        retrieved_at: new Date().toISOString(),
        retrieved_from: 'hyperrag',
        retrieval_confidence: 0.85,
        retrieval_latency_ms: latencyMs,
      };

      const cachePipeline = redis.pipeline();
      cachePipeline.set(cacheKey, JSON.stringify(payload), 'EX', 3600);
      cachePipeline.set(`${cacheKey}:prov`, JSON.stringify(provenance), 'EX', 3600);
      await cachePipeline.exec();
    } catch (err) {
      console.warn('[hyperrag-packet-rpc] Failed to cache result:', err);
    }
  }

  // Record timing metrics in atlas_retrieval_eval_times
    const timings = rrfResult?.timings ?? {
      bm25_ms: 0,
      qdrant_ms: 0,
      turbovec_ms: 0,
      neo4j_ms: 0,
      redis_ms: redisMs,
      gemma4_ms: 0,
      rrf_ms: 0,
      pgvector_ms: 0,
      concept_overlap_ms: 0,
    };
    const effectiveRedisMs = timings.redis_ms || redisMs || 0;

    if (input.recordTelemetry !== false) {
      const telemetry = recordPacketRpcTelemetry({
        query,
        latencyMs,
        ftsHits: ftsHits.length,
        vectorHits: result.trace.qdrant_hits,
        packets,
        timings: {
          bm25_ms: timings.bm25_ms,
          qdrant_ms: timings.qdrant_ms,
          redis_ms: effectiveRedisMs,
          neo4j_ms: timings.neo4j_ms,
          fusion_ms: timings.rrf_ms,
          rerank_ms: timings.gemma4_ms,
        }
      });
      if (input.awaitTelemetry) {
        await telemetry;
      } else {
        void telemetry;
      }
    }

    await recordQueryEvalTimes({
      queryHash: qHash,
      route,
      resultCount: packets.length,
      qdrantMs: timings.qdrant_ms,
      bm25Ms: timings.bm25_ms,
      pgvectorMs: timings.pgvector_ms ?? 0,
      redisMs: effectiveRedisMs,
      bitfrostMs: 0,
      neo4jMs: timings.neo4j_ms,
      turbovecMs: timings.turbovec_ms,
      rrfMs: timings.rrf_ms,
      gemma4Ms: timings.gemma4_ms,
      totalMs: latencyMs,
      cacheHitSource: null,
      ttlRemaining: null,
      error: null,
      payload: {
        route,
        result_count: packets.length,
        packet_keys: packets.map((packet) => packet.packet_key),
        feature_ids: [...new Set(packets.map((packet) => packet.feature_id).filter((value): value is string => Boolean(value)))],
        source_refs: [...new Set(packets.map((packet) => packet.source_ref))],
        cache_hit_source: null,
        error: null,
        packet_summaries: packets.map((packet) => ({
          packet_key: packet.packet_key,
          source_ref: packet.source_ref,
          feature_id: packet.feature_id,
          fusion_score: packet.fusion_score,
          rank: packet.rank,
        })),
      },
    });

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await recordQueryEvalTimes({
      queryHash: qHash,
      route,
      resultCount: 0,
      qdrantMs: 0,
      bm25Ms: 0,
      pgvectorMs: 0,
      redisMs,
      bitfrostMs: 0,
      neo4jMs: 0,
      turbovecMs: 0,
      rrfMs: 0,
      gemma4Ms: 0,
      totalMs: Date.now() - startedAt,
      cacheHitSource: null,
      ttlRemaining: null,
      error: message,
      payload: {
        route,
        result_count: 0,
        packet_keys: [],
        feature_ids: [],
        source_refs: [],
        cache_hit_source: null,
        error: message,
        packet_summaries: [],
      },
    });
    throw error;
  }
}

export async function closeHyperRagPacketRpcPool(): Promise<void> {
  const pool = packetRpcPool;
  packetRpcPool = null;
  await pool?.end().catch(() => {});
}
