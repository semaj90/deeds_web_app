import pg from 'pg';
import crypto from 'node:crypto';
import { ENV } from '$lib/server/env.server.js';
import type { FTSResult } from '$lib/server/search/postgres-fts.js';
import { expandNeighbours } from '$lib/server/search/neo4j-rerank.js';
import { recordRetrievalTelemetry, type RetrievalHit } from '../telemetry/retrieval-recorder.js';
import { multiLaneRetrievalWithRRF } from './rrf-integration.js';
import { toStableFileKey } from './subgraph-seed-neighborhood.js';
import { getRedis } from '../redis.js';
import { getAceContextPackPointer } from '../cache/ace-context-pack-cache.js';
import { QueryProfileRouter } from './query-profile-router.js';
import { createSearchRuntime } from './search-runtime.js';
import {
  buildCanonicalAcePacketEnvelope,
  type CanonicalAcePacketEnvelope,
} from '../ace/canonical-packet-envelope.js';

export type HyperRagPacketRpcInput = {
  query: string;
  limit?: number;
  includeGraph?: boolean;
  useFts?: boolean;
  recordTelemetry?: boolean;
  awaitTelemetry?: boolean;
  useExactMatchCache?: boolean;
  protocol?: 'jsonrpc' | 'http' | 'grpc' | 'mcp';
  accelerator?: string;
  cudaAvailable?: boolean;
  cuvsEnabled?: boolean;
  matmulMs?: number;
  embeddingMs?: number;
};

export type HyperRagPacketRpcPacket = {
  packet_id: string | null;
  packet_key: string;
  packet_ulid: string | null;
  packet_type: 'chrom97' | 'neschrom97';
  source_ref: string;
  canonical_source_ref: string;
  title_id: string | null;
  feature_id: string | null;
  feature_label: string | null;
  topology_label: string | null;
  ontology_label: string | null;
  cluster_key: string | null;
  kmeans_cluster: string | number | null;
  qdrant_point_id: string | null;
  community_id: string | null;
  som_cluster: string | null;
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
    cache_hit_source: 'redis' | 'bitfrost' | 'ace' | null;
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
  title_id: string | null;
  feature_id: string | null;
  summary_lod0: string | null;
  summary_lod1: string | null;
  summary: string | null;
  tags: string[] | null;
  payload: Record<string, unknown> | null;
};

type AtlasPacketRow = {
  packet_id: string | null;
  packet_key: string | null;
  packet_ulid: string | null;
  source_ref: string | null;
  source_ref_key: string | null;
  file_path: string | null;
  source_path: string | null;
  title_id: string | null;
  feature_id: string | null;
  feature_label: string | null;
  summary: string | null;
  tags: string[] | null;
  payload: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  topology: Record<string, unknown> | null;
  qdrant_point_id: string | null;
  qdrant_collection: string | null;
  community_id: number | null;
  cluster_id: number | null;
  som_cluster: string | null;
  kmeans_cluster: number | null;
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
    packet_id: string | null;
    packet_key: string;
    packet_ulid: string | null;
    source_ref: string;
    title_id: string | null;
    feature_id: string | null;
    fusion_score: number;
    rank: number;
  }>;
};

type NesPacketRow = {
  packet_id: string | null;
  packet_key: string;
  packet_ulid: string | null;
  source_ref: string | null;
  title_id: string | null;
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getMetadata(value: unknown): Record<string, unknown> {
  if (!isRecord(value)) return {};
  const metadata = value.metadata;
  return isRecord(metadata) ? metadata : {};
}

const COARSE_FEATURE_ID_VALUES = new Set([
  'db',
  'routes',
  'ai',
  'api',
  'ui',
  'graph',
  'search',
  'retrieval',
  'packet',
]);

function isCoarseFeatureId(value: string | null | undefined): boolean {
  if (!value) return false;
  const normalized = cleanText(value).toLowerCase();
  if (!normalized) return false;
  if (COARSE_FEATURE_ID_VALUES.has(normalized)) return true;
  return /^[a-z]{1,4}$/.test(normalized) && !/[./:_-]/.test(normalized);
}

function canonicalFeatureId(...values: unknown[]): string | null {
  for (const value of values) {
    const text = cleanText(value);
    if (!text || isCoarseFeatureId(text)) continue;
    return text;
  }
  return null;
}

function inferDomainFromSourceRef(sourceRef: string | null): string | null {
  if (!sourceRef) return null;
  const normalized = sourceRef.replace(/\\/g, '/');
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length === 0) return null;
  const preferred = parts.find((part) => !['src', 'lib', 'server', 'routes', 'app', 'packages'].includes(part.toLowerCase()));
  return cleanText(preferred ?? parts[parts.length - 2] ?? parts[0]) || null;
}

function splitTags(value: unknown): string[] {
  if (Array.isArray(value)) return [...new Set(value.map(cleanText).filter(Boolean))];
  return [...new Set(cleanText(value).split(/[,\s]+/).map((tag) => tag.trim()).filter(Boolean))];
}

function identityKey(value: unknown): string {
  return cleanText(value).replace(/\\/g, '/');
}

function addIdentityCandidate(out: Set<string>, value: unknown): void {
  const normalized = identityKey(value);
  if (!normalized) return;
  out.add(normalized);
  out.add(normalized.replace(/^C:\/Users\/james\/Videos\/deeds-web-app\//i, ''));
  if (!normalized.startsWith('sveltekit-frontend/') && normalized.startsWith('src/')) {
    out.add(`sveltekit-frontend/${normalized}`);
  }
}

function fileStableKeyPath(value: unknown): string | null {
  const text = identityKey(value);
  if (!text.startsWith('file:')) return null;
  const body = text.slice('file:'.length);
  const idx = body.lastIndexOf(':');
  return idx > 0 ? body.slice(0, idx) : body;
}

function sourceRefCandidates(hit: FTSResult): string[] {
  const out = new Set<string>();
  addIdentityCandidate(out, hit.file_path);
  addIdentityCandidate(out, hit.stable_key);
  const stablePath = fileStableKeyPath(hit.stable_key);
  addIdentityCandidate(out, stablePath);
  return [...out];
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
  metadata: Record<string, unknown>;
  kind: 'rrf';
}> {
  return results.map((row) => {
    const metadata = getMetadata(row);
    const breakdownMetas = (row.breakdown ?? []).map((b) => getMetadata(b)).filter((m): m is Record<string, unknown> => Boolean(m));
    const refs = new Set<string>();
    for (const rawValue of [
      metadata.source_ref,
      metadata.sourceRef,
      metadata.canonical_source_ref,
      metadata.canonicalSourceRef,
      metadata.file_path,
      metadata.filePath,
      metadata.path,
      metadata.packet_key,
      metadata.packetKey,
      metadata.qdrant_point_id,
      row.id,
      ...breakdownMetas.flatMap((m) => [
        m.source_ref,
        m.sourceRef,
        m.canonical_source_ref,
        m.canonicalSourceRef,
        m.file_path,
        m.filePath,
        m.path,
        m.packet_key,
        m.packetKey,
        m.qdrant_point_id,
      ]),
    ]) {
      const normalized = cleanText(rawValue);
      if (normalized) refs.add(normalized);
      const stablePath = fileStableKeyPath(normalized);
      if (stablePath) {
        refs.add(stablePath);
        if (stablePath.startsWith('src/')) refs.add(`sveltekit-frontend/${stablePath}`);
      }
    }

    const denseScore =
      row.breakdown?.find((score) => score.laneName === 'qdrant_vector' || score.laneName === 'turbovec_ann')?.laneScore ??
      0;
    const packetKey = metaString(metadata.packet_key ?? metadata.packetKey ?? row.id) || null;
    const filePath = metaString(
      metadata.source_ref ??
      metadata.sourceRef ??
      metadata.canonical_source_ref ??
      metadata.canonicalSourceRef ??
      metadata.file_path ??
      metadata.filePath ??
      metadata.path
    ) || null;
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
      metadata,
      kind: 'rrf' as const,
    };
  });
}

function envelopeAsContextFields(envelope: CanonicalAcePacketEnvelope): {
  feature_id?: string | null;
  som_cell?: string | null;
  language?: string | null;
  kind?: string | null;
  page_rank_score?: number;
} {
  return {
    feature_id: envelope.feature_id,
    som_cell: envelope.som_cell,
    language: envelope.language,
    kind: envelope.kind,
    page_rank_score: envelope.page_rank_score,
  };
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
  metadata: Record<string, unknown>;
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
    metadata: {},
    kind: 'fts' as const,
  }));
}

function directoryPath(sourceRef: string): string | null {
  const normalized = sourceRef.replace(/\\/g, '/');
  const idx = normalized.lastIndexOf('/');
  return idx > 0 ? normalized.slice(0, idx) : null;
}

function featureLabelFrom(row: ParentAtlasRow | NesPacketRow | AtlasPacketRow | undefined, featureId: string | null): string | null {
  const payload = row?.payload;
  const label = payload?.feature_label ?? payload?.featureLabel ?? payload?.label ?? payload?.title;
  return cleanText(label) || cleanText((row as AtlasPacketRow | undefined)?.feature_label) || featureId;
}

async function recordPacketRpcTelemetry(params: {
  query: string;
  latencyMs: number;
  ftsHits: number;
  vectorHits: number;
  packets: HyperRagPacketRpcPacket[];
  protocol?: 'jsonrpc' | 'http' | 'grpc' | 'mcp';
  accelerator?: string;
  cudaAvailable?: boolean;
  cuvsEnabled?: boolean;
  matmulMs?: number | null;
  embeddingMs?: number | null;
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
      protocol: params.protocol ?? 'http',
      accelerator: params.accelerator ?? 'cpu',
      cudaAvailable: params.cudaAvailable ?? null,
      cuvsEnabled: params.cuvsEnabled ?? null,
      matmulMs: params.matmulMs ?? null,
      embeddingMs: params.embeddingMs ?? null,
      verdict: params.packets.some((packet) => packet.neo4j_neighbors.length > 0) ? 'PASS' : 'WARN',
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
      writeEvalTimes: false,
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

function addAtlasPacketIdentity(out: Map<string, AtlasPacketRow>, value: unknown, row: AtlasPacketRow): void {
  const key = identityKey(value);
  if (!key) return;
  if (!out.has(key)) out.set(key, row);
  const lower = key.toLowerCase();
  if (!out.has(lower)) out.set(lower, row);
}

async function loadAtlasPacketsByIdentity(keys: string[]): Promise<Map<string, AtlasPacketRow>> {
  const identities = [...new Set(keys.map(identityKey).filter(Boolean))];
  if (!identities.length) return new Map();
  try {
    const { rows } = await getPacketRpcPool().query<AtlasPacketRow>(
      `
        select
          packet_id,
          packet_key,
          packet_ulid,
          source_ref,
          source_ref_key,
          file_path,
          source_path,
          title_id,
          feature_id,
          feature_label,
          summary,
          tags,
          payload,
          metadata,
          topology,
          qdrant_point_id,
          qdrant_collection,
          community_id,
          cluster_id,
          som_cluster,
          kmeans_cluster
        from atlas_packets
        where packet_key = any($1::text[])
           or source_ref = any($1::text[])
           or source_ref_key = any($1::text[])
           or file_path = any($1::text[])
           or source_path = any($1::text[])
           or qdrant_point_id = any($1::text[])
        order by updated_at desc nulls last, created_at desc nulls last
        limit 500
      `,
      [identities],
    );

    const out = new Map<string, AtlasPacketRow>();
    for (const row of rows) {
      for (const value of [
        row.packet_key,
        row.packet_id,
        row.packet_ulid,
        row.source_ref,
        row.source_ref_key,
        row.file_path,
        row.source_path,
        row.title_id,
        row.qdrant_point_id,
        row.payload?.packet_key,
        row.payload?.packetKey,
        row.payload?.packet_id,
        row.payload?.packetId,
        row.payload?.packet_ulid,
        row.payload?.packetUlid,
        row.payload?.source_ref,
        row.payload?.sourceRef,
        row.payload?.canonical_source_ref,
        row.payload?.canonicalSourceRef,
        row.payload?.file_path,
        row.payload?.filePath,
        row.payload?.path,
        row.payload?.qdrant_point_id,
        row.payload?.qdrantPointId,
        row.metadata?.packet_key,
        row.metadata?.packetKey,
        row.metadata?.packet_id,
        row.metadata?.packetId,
        row.metadata?.packet_ulid,
        row.metadata?.packetUlid,
        row.metadata?.source_ref,
        row.metadata?.sourceRef,
        row.metadata?.canonical_source_ref,
        row.metadata?.canonicalSourceRef,
        row.metadata?.file_path,
        row.metadata?.filePath,
        row.metadata?.path,
        row.metadata?.qdrant_point_id,
        row.metadata?.qdrantPointId,
      ]) {
        addAtlasPacketIdentity(out, value, row);
      }
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
  protocol?: string | null;
  accelerator?: string | null;
  cudaAvailable?: boolean | null;
  cuvsEnabled?: boolean | null;
  matmulMs?: number | null;
  embeddingMs?: number | null;
  verdict?: string | null;
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
          cache_hit_source, ttl_remaining,
          protocol, accelerator, cuda_available, cuvs_enabled, matmul_ms, embedding_ms, verdict,
          payload
        ) VALUES (
          $1, $2, $3, $4,
          $5, $6, $7,
          $8, $9, $10,
          $11, $12, $13, $14, $15,
          $16, $17, $18, $19, $20,
          $21, $22,
          $23, $24, $25, $26, $27, $28, $29,
          $30, $31
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
        params.protocol ?? null,
        params.accelerator ?? null,
        params.cudaAvailable ?? null,
        params.cuvsEnabled ?? null,
        params.matmulMs ?? null,
        params.embeddingMs ?? null,
        params.verdict ?? null,
        JSON.stringify(params.payload),
      ]
    );
  } catch (err) {
    console.warn('[hyperrag-packet-rpc] recordEvalTimes failed:', err instanceof Error ? err.message : String(err));
  }
}

function getSeedMetadata(seed: unknown): Record<string, any> {
  if (
    seed &&
    typeof seed === 'object' &&
    'metadata' in seed &&
    seed.metadata &&
    typeof seed.metadata === 'object'
  ) {
    return seed.metadata as Record<string, any>;
  }
  return {};
}

export async function hyperragPacketRpc(input: HyperRagPacketRpcInput): Promise<HyperRagPacketRpcResult> {
  const canonicalQuery = cleanText(input.query);
  const canonicalLimit = Math.max(1, Math.min(Number(input.limit ?? 10), 25));

  const runtime = createSearchRuntime({ userId: 'hyperrag-packet-rpc' });
  const runtimeResult = await runtime.search({
    text: canonicalQuery,
    topK: canonicalLimit,
  });

  const canonicalPackets: HyperRagPacketRpcPacket[] = runtimeResult.packets.map((packet, index) => {
    const row = packet as Record<string, unknown>;
    const packetKey = String(row.packet_key ?? row.packetKey ?? row.id ?? row.source_ref ?? `hyperrag:${index}`);
    const sourceRef = String(row.source_ref ?? row.sourceRef ?? row.file_path ?? row.path ?? '');
    const titleId = (row.title_id ?? row.titleId ?? null) as string | null;
    const featureId = (row.feature_id ?? row.featureId ?? null) as string | null;
    const qdrantPointId = (row.qdrant_point_id ?? row.qdrantPointId ?? null) as string | null;
    const domainClass = (row.domain_class ?? row.domainClass ?? row.domain ?? null) as string | null;
    const treeNodeId = (row.tree_node_id ?? row.treeNodeId ?? null) as string | null;
    const summary = String(row.summary ?? row.content ?? row.text ?? '').trim();
    const retrievalScore = Number(row.retrieval_score ?? row.blended_score ?? row.cross_encoder_score ?? row.xgboost_score ?? 0);

    return {
      packet_id: (row.packet_id ?? row.packetId ?? null) as string | null,
      packet_key: packetKey,
      packet_ulid: (row.packet_ulid ?? row.packetUlid ?? null) as string | null,
      packet_type: 'chrom97',
      source_ref: sourceRef || packetKey,
      canonical_source_ref: sourceRef || packetKey,
      title_id: titleId,
      feature_id: featureId,
      feature_label: domainClass,
      topology_label: (row.topology_label ?? row.topologyLabel ?? null) as string | null,
      ontology_label: domainClass,
      cluster_key: (row.cluster_key ?? row.clusterKey ?? null) as string | null,
      kmeans_cluster: (row.kmeans_cluster ?? row.kmeansCluster ?? null) as string | number | null,
      qdrant_point_id: qdrantPointId,
      community_id: (row.community_id ?? row.communityId ?? null) as string | null,
      som_cluster: (row.som_cluster ?? row.somCluster ?? null) as string | null,
      directory_path: (row.directory_path ?? row.directoryPath ?? null) as string | null,
      qdrant_tags: Array.isArray(row.qdrant_tags) ? row.qdrant_tags.map((value) => String(value)) : [],
      neo4j_neighbors: Array.isArray(row.neo4j_neighbors) ? row.neo4j_neighbors.map((value) => String(value)) : [],
      retrieval_lanes: {
        dense: Number(row.dense_score ?? 0),
        fts: Number(row.bm25_score ?? row.lexical_score ?? 0),
        trigram: Number(row.trigram_score ?? 0),
        jsonb: Number(row.jsonb_score ?? 0),
      },
      fusion_score: Number.isFinite(retrievalScore) ? retrievalScore : 0,
      fusion_sources: Array.isArray(row.retrieval_sources) ? row.retrieval_sources.map((value) => String(value)) : [],
      gemma4_summary: summary || null,
      recommended_action: (row.recommended_action ?? row.next_action ?? null) as string | null,
      verification_command: (row.verification_command ?? row.verify_command ?? null) as string | null,
      rank: index + 1,
    };
  });

  const trace = {
    retrieval_strategy: 'fusion' as const,
    cache_hit_source: null as 'redis' | 'bitfrost' | 'ace' | null,
    qdrant_hits: canonicalPackets.filter((packet) => Number(packet.retrieval_lanes.dense) > 0).length,
    postgres_hits: canonicalPackets.filter((packet) => Number(packet.retrieval_lanes.fts) > 0).length,
    rrf_hits: canonicalPackets.length,
    neo4j_expansions: 0,
    duckdb_join_used: false as const,
    latency_ms: runtimeResult.metadata.durationMs,
    fusion_used: true,
    collection_split: {
      runtime_legal: 'legal_documents' as const,
      codebase_topology: 'codebase_chunks_768' as const,
    },
  } satisfies HyperRagPacketRpcResult['trace'];

  return {
    query: canonicalQuery,
    strategy: 'fusion',
    packets: canonicalPackets,
    trace,
  };
}

export async function closeHyperRagPacketRpcPool(): Promise<void> {
  const pool = packetRpcPool;
  packetRpcPool = null;
  await pool?.end().catch(() => {});
}
