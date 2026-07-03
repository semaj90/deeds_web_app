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
                  cache_hit_source: 'redis' as const,
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
                    packet_id: packet.packet_id,
                    packet_key: packet.packet_key,
                    packet_ulid: packet.packet_ulid,
                    source_ref: packet.source_ref,
                    title_id: packet.title_id,
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

    // ┌─────────────────────────────────────────────────────────────────────────────
    // │ STAGE A0: BitFrost Hot-Bucket Cache Check (Pre-Qdrant)
    // │ Checks Phase 7 warm-up buckets for exact feature/language/kind matches
    // └─────────────────────────────────────────────────────────────────────────────

    let hotBucketHits: string[] = [];
    let stageA0IdentityRefs: string[] = [];
    let stageA0CacheHitSource: 'bitfrost' | 'ace' | null = null;
    let bitfrostMs = 0;
    let potentialLanguage: string | undefined;
    let potentialKind: string | undefined;

    try {
      const redis = getRedis();
      const tBitfrostStart = performance.now();

      // Extract query intent signals
      const queryLower = query.toLowerCase();
      const queryWords = queryLower.split(/\s+/).filter(w => w.length > 2);
      const queryProfile = QueryProfileRouter.route(query);
      const profileAliases = QueryProfileRouter.getAliases(queryProfile);

      // Stage A0 exact ACE pack cache: ace:ctx:{queryHash}
      const aceContextPack = await getAceContextPackPointer(qHash).catch(() => null);
      if (aceContextPack) {
        const exactRefs = [
          ...(aceContextPack.sourceRefs ?? []),
          ...(aceContextPack.chunkIds ?? []),
          ...(aceContextPack.graphPaths ?? []),
        ]
          .map((value) => cleanText(value))
          .filter(Boolean);
        stageA0IdentityRefs = [...new Set(exactRefs)];
        hotBucketHits = [...stageA0IdentityRefs].slice(0, limit);
        stageA0CacheHitSource = 'ace';
      }

      // Try to infer feature/language/kind from query and profile aliases
      const potentialFeatures = queryWords.slice(0, 2).join('.');
      potentialLanguage = queryWords.find(w => ['typescript', 'javascript', 'python', 'rust', 'go'].includes(w));
      potentialKind = queryWords.find(w => ['function', 'class', 'interface', 'type', 'enum', 'module'].includes(w));

      // Check hot buckets in priority order
      const hotKeys = [
        ...profileAliases.map((alias) => `bitfrost:hot:feature:${alias}`),
        potentialFeatures ? `bitfrost:hot:feature:${potentialFeatures}` : null,
        potentialLanguage ? `bitfrost:hot:language:${potentialLanguage}` : null,
        potentialKind ? `bitfrost:hot:kind:${potentialKind}` : null,
      ].filter((k): k is string => Boolean(k));

      if (hotKeys.length > 0 && hotBucketHits.length < limit) {
        const pipeline = redis.pipeline();
        for (const key of hotKeys) {
          pipeline.smembers(key);
        }
        const results = await pipeline.exec().catch(() => null);

        if (results) {
          // Collect all packet_keys from hot buckets (order by recency is built-in)
          const allHits = new Set<string>();
          for (const [err, members] of results as Array<[Error | null, string[]]>) {
            if (!err && Array.isArray(members)) {
              members.forEach(m => allHits.add(m));
            }
          }
          hotBucketHits = [...new Set([...hotBucketHits, ...Array.from(allHits)])].slice(0, limit);
          if (!stageA0CacheHitSource && hotBucketHits.length > 0) {
            stageA0CacheHitSource = 'bitfrost';
          }
        }
      }

      bitfrostMs = performance.now() - tBitfrostStart;

      if (hotBucketHits.length > 0) {
        console.log(`[hyperrag-packet-rpc] Stage A0 cache hit: ${hotBucketHits.length} packets in ${bitfrostMs.toFixed(1)}ms (source: ${stageA0CacheHitSource})`);
      }
    } catch (err) {
      console.warn('[hyperrag-packet-rpc] Stage A0 hot-bucket check failed:', err);
      bitfrostMs = 0;
    }

    // Placeholder for Stage A0 cache envelopes (will be populated after Postgres rows load)
    const stageA0CacheEnvelopes: Map<string, CanonicalAcePacketEnvelope> = new Map();

    // Skip RRF if we have hot-bucket hits (instant cache)
    const skipRrf = hotBucketHits.length >= limit;

    const [rrfResult, initialFtsHits] = await Promise.all([
      skipRrf ? Promise.resolve(null) : (includeGraph ? multiLaneRetrievalWithRRF(query, getPacketRpcPool(), { topK: limit, minScore: 0.001 }).catch(() => null) : Promise.resolve(null)),
      useFts ? searchCodeLexicalBounded(query, limit) : Promise.resolve([]),
    ]);

  let ftsHits = initialFtsHits;
  if (!ftsHits.length) {
    ftsHits = await fallbackParentAtlas(query, limit);
  }

  const rrfSeeds = rrfResult?.results?.length ? packetSeedCandidatesFromRrf(rrfResult.results) : [];
  const ftsSeeds = packetSeedCandidatesFromFts(ftsHits);
  const allSeeds = [...ftsSeeds, ...rrfSeeds];
  const dedupeMap = new Map<string, (typeof allSeeds)[number]>();
  for (const seed of allSeeds) {
    const key = (
      seed.packet_key ||
      seed.source_refs[0] ||
      seed.file_path ||
      seed.stable_key
    ).toLowerCase();
    const existing = dedupeMap.get(key);
    if (!existing) {
      dedupeMap.set(key, seed);
      continue;
    }
    dedupeMap.set(key, {
      ...existing,
      ...seed,
      source_refs: [...new Set([...existing.source_refs, ...seed.source_refs])],
      lexical_score: Math.max(Number(existing.lexical_score ?? 0), Number(seed.lexical_score ?? 0)),
      dense_score: Math.max(Number(existing.dense_score ?? 0), Number(seed.dense_score ?? 0)),
      packet_key: existing.packet_key ?? seed.packet_key,
      headline: existing.headline ?? seed.headline,
      tags: existing.tags ?? seed.tags,
      content: existing.content ?? seed.content,
      metadata: { ...existing.metadata, ...seed.metadata },
      kind: existing.kind === 'fts' ? existing.kind : seed.kind,
    });
  }
  const dedupedSeeds = Array.from(dedupeMap.values());

    const candidateRefs = [...new Set([
      ...dedupedSeeds.flatMap((seed) => seed.source_refs),
      ...stageA0IdentityRefs,
      ...hotBucketHits,
    ].map((value) => cleanText(value)).filter(Boolean))];
  const [canonicalPackets, parentAtlas, nesPackets] = await Promise.all([
    loadAtlasPacketsByIdentity(candidateRefs),
    loadParentAtlas(candidateRefs),
    loadNesPackets(candidateRefs),
  ]);

  // Build canonical envelopes for Stage A0 cache hits
  // These preserve packet_id/title_id lineage through all downstream stages
  if (hotBucketHits.length > 0 && stageA0CacheHitSource) {
    const context = {
      feature_id: null as string | null,
      som_cell: null as string | null,
      language: potentialLanguage ?? null,
      kind: potentialKind ?? null,
      page_rank_score: 0,
    };

    for (const key of hotBucketHits.slice(0, limit)) {
      const row = canonicalPackets.get(key) ?? canonicalPackets.get(key.toLowerCase());
      if (row) {
        const envelope = buildCanonicalAcePacketEnvelope(row, context);
        stageA0CacheEnvelopes.set(key, envelope);
      }
    }
    if (stageA0CacheEnvelopes.size > 0) {
      console.log(`[hyperrag-packet-rpc] Built ${stageA0CacheEnvelopes.size} canonical envelopes for Stage A0 cache hits (source: ${stageA0CacheHitSource})`);
    }
  }

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

  // Emit Stage A0 cache envelopes first (high priority, instant retrieval)
  for (const [key, envelope] of stageA0CacheEnvelopes) {
    if (packets.length >= limit) break;
    // Convert canonical envelope to RPC packet shape
    const packet: HyperRagPacketRpcPacket = {
      packet_id: envelope.packet_id,
      packet_ulid: envelope.packet_ulid,
      packet_key: envelope.packet_key,
      title_id: envelope.title_id,
      source_ref: envelope.source_ref,
      canonical_source_ref: envelope.source_ref,
      feature_id: envelope.feature_id,
      feature_label: null,
      kind: envelope.kind,
      language: envelope.language,
      som_cell: envelope.som_cell,
      headline: cleanText(envelope.packet_key),
      content: null,
      tags: [],
      fusion_score: 1.0, // Cache hits are perfect matches
      rank: packets.length + 1,
      lexical_score: 1.0,
      dense_score: 1.0,
      qdrant_score: null,
      ner_features: [],
      traces: [
        {
          stage: 'A0',
          source: stageA0CacheHitSource || 'unknown',
          timing: `${bitfrostMs.toFixed(1)}ms`,
          confidence: 0.99,
        },
      ],
      metadata: {
        packet_key: envelope.packet_key,
        source_ref: envelope.source_ref,
        feature_id: envelope.feature_id,
        cached: true,
        cache_source: stageA0CacheHitSource,
      },
    };
    packets.push(packet);
  }

  const seedsToEmit = dedupedSeeds.slice(0, limit - packets.length);
  const neighborsBySeed = includeGraph
    ? await Promise.all(
        seedsToEmit.map(async (seed) => {
          const candidateRoots = [...new Set([
            seed.source_refs[0],
            seed.file_path,
            seed.stable_key,
            toStableFileKey(seed.source_refs[0] ?? seed.file_path ?? seed.stable_key),
          ].map((value) => cleanText(value)).filter(Boolean))];
          const neighborSets = await Promise.all(
            candidateRoots.map((root) => expandNeighbours(root, 1).catch(() => [])),
          );
          return [...new Set(neighborSets.flat().map((neighbor) => cleanText(neighbor)).filter(Boolean))];
        })
      )
    : seedsToEmit.map(() => []);

  for (const [index, seed] of seedsToEmit.entries()) {
    const seedMetadata = getSeedMetadata(seed);
    const candidates = seed.source_refs.length ? seed.source_refs : [seed.file_path ?? seed.stable_key];
    const canonicalPacket =
      candidates.map((candidate) => canonicalPackets.get(candidate) ?? canonicalPackets.get(candidate.toLowerCase())).find(Boolean) ??
      canonicalPackets.get(seed.stable_key) ??
      canonicalPackets.get(seed.stable_key.toLowerCase()) ??
      (seed.file_path ? canonicalPackets.get(seed.file_path) ?? canonicalPackets.get(seed.file_path.toLowerCase()) : undefined);
    const sourceRef =
      canonicalPacket?.source_ref ??
      canonicalPacket?.file_path ??
      candidates.find((candidate) => parentAtlas.has(candidate) || nesPackets.has(candidate)) ??
      candidates[0] ??
      seed.stable_key;
    const atlasRow = parentAtlas.get(sourceRef) ?? candidates.map((candidate) => parentAtlas.get(candidate)).find(Boolean);
    const nesRow = nesPackets.get(sourceRef) ?? candidates.map((candidate) => nesPackets.get(candidate)).find(Boolean);
    const featureId = canonicalFeatureId(
      canonicalPacket?.feature_id,
      nesRow?.feature_id,
      atlasRow?.feature_id,
      canonicalPacket?.payload?.feature_id,
      canonicalPacket?.payload?.featureId,
      canonicalPacket?.metadata?.feature_id,
      canonicalPacket?.metadata?.featureId,
      getMetadata(nesRow).feature_id,
      getMetadata(atlasRow).feature_id,
      seedMetadata.feature_id,
      seedMetadata.featureId,
    );
    const packetKey = (
      canonicalPacket?.packet_key ??
      nesRow?.packet_key ??
      seed.packet_key ??
      cleanText(seedMetadata.packet_key ?? seedMetadata.packetKey) ??
      `hyperrag:${sourceRef || seed.stable_key}`
    );
    const packetId = cleanText(
      canonicalPacket?.packet_id ??
      canonicalPacket?.payload?.packet_id ??
      canonicalPacket?.payload?.packetId ??
      canonicalPacket?.metadata?.packet_id ??
      canonicalPacket?.metadata?.packetId ??
      seedMetadata.packet_id ??
      seedMetadata.packetId ??
      ''
    ) || null;
    const packetUlid = cleanText(
      canonicalPacket?.packet_ulid ??
      canonicalPacket?.payload?.packet_ulid ??
      canonicalPacket?.payload?.packetUlid ??
      canonicalPacket?.metadata?.packet_ulid ??
      canonicalPacket?.metadata?.packetUlid ??
      seedMetadata.packet_ulid ??
      seedMetadata.packetUlid ??
      ''
    ) || null;
    const canonicalSourceRef = canonicalPacket?.source_ref ?? atlasRow?.source_ref ?? nesRow?.source_ref ?? sourceRef;
    const packetType: HyperRagPacketRpcPacket['packet_type'] = nesRow ? 'neschrom97' : 'chrom97';
    const atlasMetadata = getMetadata(atlasRow);
    const nesMetadata = getMetadata(nesRow);
    const inferredDomainClass =
      cleanText(
        seedMetadata.domain_class
        ?? seedMetadata.domainClass
        ?? atlasMetadata.domain_class
        ?? atlasMetadata.domainClass
        ?? nesMetadata.domain_class
        ?? nesMetadata.domainClass
        ?? inferDomainFromSourceRef(canonicalSourceRef),
      ) || null;
    const topologyLabel = cleanText(
      nesRow?.payload?.topology_label
      ?? nesRow?.payload?.topologyLabel
      ?? atlasRow?.payload?.topology_label
      ?? atlasRow?.payload?.topologyLabel
      ?? seedMetadata.topology_label
      ?? seedMetadata.topologyLabel
      ?? seedMetadata.domain_class
      ?? seedMetadata.domain
      ?? seedMetadata.path_label
      ?? seedMetadata.pathLabel
      ?? inferredDomainClass
      ?? null,
    ) || null;
    const titleId = cleanText(
      canonicalPacket?.title_id ??
      canonicalPacket?.payload?.title_id ??
      canonicalPacket?.payload?.titleId ??
      canonicalPacket?.metadata?.title_id ??
      canonicalPacket?.metadata?.titleId ??
      atlasRow?.title_id ??
      nesRow?.title_id ??
      seedMetadata.title_id ??
      seedMetadata.titleId ??
      null,
    ) || null;
    const ontologyLabel = cleanText(
      nesRow?.payload?.ontology_label
      ?? nesRow?.payload?.ontologyLabel
      ?? atlasRow?.payload?.ontology_label
      ?? atlasRow?.payload?.ontologyLabel
      ?? seedMetadata.ontology_label
      ?? seedMetadata.ontologyLabel
      ?? seedMetadata.domain
      ?? seedMetadata.domain_class
      ?? seedMetadata.path_label
      ?? seedMetadata.pathLabel
      ?? inferredDomainClass
      ?? null,
    ) || null;
    const clusterKey = cleanText(
      nesRow?.payload?.cluster_key
      ?? nesRow?.payload?.clusterKey
      ?? atlasRow?.payload?.cluster_key
      ?? atlasRow?.payload?.clusterKey
      ?? seedMetadata.cluster_key
      ?? seedMetadata.clusterKey
      ?? null,
    ) || null;
    const kmeansCluster = cleanText(
      nesRow?.payload?.kmeans_cluster
      ?? nesRow?.payload?.kmeansCluster
      ?? atlasRow?.payload?.kmeans_cluster
      ?? atlasRow?.payload?.kmeansCluster
      ?? seedMetadata.kmeans_cluster
      ?? seedMetadata.kmeansCluster
      ?? nesRow?.payload?.cluster_id
      ?? atlasRow?.payload?.cluster_id
      ?? null,
    ) || null;
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
      packet_id: packetId,
      packet_key: packetKey,
      packet_ulid: packetUlid,
      packet_type: packetType,
      source_ref: sourceRef,
      canonical_source_ref: canonicalSourceRef,
      title_id: titleId,
      feature_id: featureId,
      feature_label: featureLabelFrom(nesRow ?? atlasRow, featureId),
      topology_label: topologyLabel,
      ontology_label: ontologyLabel,
      cluster_key: clusterKey,
      kmeans_cluster: kmeansCluster,
      qdrant_point_id: (
        nesRow?.qdrant_point_id
        ?? cleanText(seedMetadata.qdrant_point_id ?? seedMetadata.qdrantPointId)
        ?? cleanText(atlasRow?.payload?.qdrant_point_id ?? atlasRow?.payload?.qdrantPointId)
      ) || null,
      community_id: cleanText(
        nesRow?.payload?.community_id
        ?? nesRow?.payload?.communityId
        ?? atlasRow?.payload?.community_id
        ?? atlasRow?.payload?.communityId,
      ) || null,
      som_cluster: cleanText(
        nesRow?.som_cluster
        ?? nesRow?.payload?.som_cluster
        ?? nesRow?.payload?.somCluster
        ?? atlasRow?.payload?.som_cluster
        ?? atlasRow?.payload?.somCluster,
      ) || null,
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
      cache_hit_source: stageA0CacheHitSource,
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
        packet_id: packets[0].packet_id,
        packet_key: packets[0].packet_key,
        packet_ulid: packets[0].packet_ulid,
        title_id: packets[0].title_id,
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
        protocol: input.protocol ?? 'http',
        accelerator: input.accelerator ?? 'cpu',
        cudaAvailable: input.cudaAvailable ?? null,
        cuvsEnabled: input.cuvsEnabled ?? null,
        matmulMs: input.matmulMs ?? null,
        embeddingMs: input.embeddingMs ?? null,
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

    if (input.recordTelemetry !== false) {
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
        protocol: input.protocol ?? 'http',
        accelerator: input.accelerator ?? 'cpu',
        cudaAvailable: input.cudaAvailable ?? null,
        cuvsEnabled: input.cuvsEnabled ?? null,
        matmulMs: input.matmulMs ?? null,
        embeddingMs: input.embeddingMs ?? null,
        verdict: result.trace.neo4j_expansions > 0 ? 'PASS' : 'WARN',
        totalMs: latencyMs,
        cacheHitSource: stageA0CacheHitSource,
        ttlRemaining: null,
        error: null,
        payload: {
          route,
          result_count: packets.length,
          packet_keys: packets.map((packet) => packet.packet_key),
          feature_ids: [...new Set(packets.map((packet) => packet.feature_id).filter((value): value is string => Boolean(value)))],
          source_refs: [...new Set(packets.map((packet) => packet.source_ref))],
          cache_hit_source: stageA0CacheHitSource,
          error: null,
          packet_summaries: packets.map((packet) => ({
            packet_id: packet.packet_id,
            packet_key: packet.packet_key,
            packet_ulid: packet.packet_ulid,
            source_ref: packet.source_ref,
            title_id: packet.title_id,
            feature_id: packet.feature_id,
            fusion_score: packet.fusion_score,
            rank: packet.rank,
          })),
        },
      });
    }

    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (input.recordTelemetry !== false) {
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
        protocol: input.protocol ?? 'http',
        accelerator: input.accelerator ?? 'cpu',
        cudaAvailable: input.cudaAvailable ?? null,
        cuvsEnabled: input.cuvsEnabled ?? null,
        matmulMs: input.matmulMs ?? null,
        embeddingMs: input.embeddingMs ?? null,
        verdict: 'FAIL',
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
    }
    throw error;
  }
}

export async function closeHyperRagPacketRpcPool(): Promise<void> {
  const pool = packetRpcPool;
  packetRpcPool = null;
  await pool?.end().catch(() => {});
}
