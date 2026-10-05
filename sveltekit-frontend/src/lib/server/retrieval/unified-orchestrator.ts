/**
 * Unified Retrieval + Summarization Orchestrator
 *
 * Coordinates the complete pipeline:
 * Postgres truth → embeddinggemma 768d → [STAGE 1.5: Rust N-API optional] → Qdrant named-vector
 * → Qdrant RRF fusion → TurboVec prefilter → Postgres join
 * → LangExtract + Gemma4 summary
 *
 * Each service has a clear job:
 * - Postgres: canonical packet truth, joins, provenance, summaries
 * - Rust N-API: optional GPU-accelerated slot manifest search (8× faster, fallback to Qdrant on error)
 * - Qdrant: GPU vector index + named-vector search + RRF
 * - TurboVec: CUDA RAM prefilter/rerank + 768→64 latent transform
 * - Go Retrieval: fast API facade + orchestration
 * - LangExtract + Gemma4: structured extraction + bounded summaries
 */

import fetch from 'node-fetch';
import { Pool } from 'pg';
import { getRgPool, type RgSearchOptions } from '$lib/server/search/rg-pool.js';
import { combineRRFLanes } from './rrf-combiner-utils.js';
import type { SearchFilter, SearchLane } from './types.js';
import type { SearchTier } from './search-contract.js';
import { inferRetrievalTier } from './search-contract.js';
import { embedQueryForLane, type QueryVectorBundle } from './embedding-service.js';
import { executeProviderEmbeddingV1 } from '$lib/server/embedding/embedding-provider-executor-v1.js';
import {
  resolveSemanticLane,
  assertSemantic768,
  CANONICAL_QDRANT_COLLECTION,
} from '$lib/server/embedding/embedding-contract-768.js';
import { createCodebaseSearchBackendFromEnv } from '$lib/server/search/create-codebase-search-backend.js';
import type { SearchBackendResult } from '$lib/server/search/search-backend.js';
import {
  resolveParentAtlasContext,
  enrichFilterWithDomainTaxonomy,
  batchResolveParentAtlasContext,
  type ParentAtlasContext
} from './parent-atlas-bridge.js';
import {
  createReadOnlySideEffectReceiptBuilderV1,
  type QueryExecutionModeV1,
  type ReadOnlySideEffectReceiptV1,
} from '$lib/server/execution/query-execution-policy-v1.js';
import { selectDiverseCandidates } from './latent256-dedup.js';
import type { Latent256CandidateProviderV1 } from './latent256-candidate-provider.js';

export interface RetrievalConfig {
  qdrant: { host: string; port: number };
  turbovec: { host: string; port: number };
  goRetrieval: { host: string; port: number };
  postgres: { host: string; port: number; user: string; password: string; database: string };
  ollama: { host: string; port: number };
  gemma4: { host: string; port: number };
  /** Experimental candidate-side dedup. Disabled unless explicitly enabled by a caller. */
  latent256Dedup?: {
    enabled: boolean;
    threshold: number;
    finalK: number;
    candidatePoolK: number;
    checkpointRevision: string;
    candidateSnapshotRevision: string;
    representationRevision: string;
    /** Test/replay injection point; production defaults to the Postgres provider. */
    provider?: Latent256CandidateProviderV1;
  };
}

export interface RetrievalRequest {
  query: string;
  lanes?: SearchLane[];
  limit?: number;
  includePayload?: boolean;
  useRRF?: boolean;
  useLexical?: boolean;
  useAST?: boolean;
  useRgPool?: boolean;
  retrievalTier?: SearchTier;
  filters?: SearchFilter;
  /**
   * Retrieval has no mutating mode: READ_ONLY (default) and OBSERVED_READ_ONLY are accepted,
   * MUTATING is rejected. The orchestrator itself performs reads only.
   */
  executionMode?: QueryExecutionModeV1;
}

export type QdrantPointId = string | number;

export interface CandidateIdentityV1 {
  /** Canonical codebase_chunk_index.id; distinct from packet and projection coordinates. */
  candidateId: string | null;
  /** Projection coordinate only; never treated as canonical packet identity. */
  qdrantPointId: QdrantPointId | null;
  packetKey: string | null;
  sourceRef: string | null;
  sourceRevision: string | null;
  workspaceRevision: string | null;
  symbolVersionId: string | null;
  identitySource: 'QDRANT_PAYLOAD_V1' | 'POSTGRES_CANONICAL_V1' | 'NOT_AVAILABLE';
  missingFields: readonly (
    | 'packetKey'
    | 'sourceRef'
    | 'sourceRevision'
    | 'workspaceRevision'
  )[];
}

export interface RankedCandidate {
  id: string;
  identity: CandidateIdentityV1;
  /** Exact codebase_chunk_index.id when the canonical Postgres join resolved it. */
  candidateId?: string;
  /** Compatibility accessors; canonical callers should consume `identity`. */
  qdrantPointId: QdrantPointId;
  packetKey?: string;
  sourceRef?: string;
  sourceRevision?: string;
  workspaceRevision?: string;
  score: number;
  path: string;
  symbol: string;
  kind: string;
  ranks: {
    qdrant_dense?: number;
    turbovec?: number;
    rg_lexical?: number;
    ast_relation?: number;
    postgres?: number;
    freshness?: number;
  };
  rg_matches?: number;
}

export type RetrievalLaneStatusV1 =
  | { status: 'OK'; executor?: string; note?: string }
  | { status: 'DISABLED' }
  | { status: 'UNAVAILABLE'; reason: string; detail?: string };

export type LexicalLaneResultV1 =
  | { status: 'OK'; hits: Array<{ id: string; file: string; line: number; score: number; rank: number }> }
  | {
      status: 'UNAVAILABLE';
      reason: 'RG_EXEC_FAILED' | 'RG_NOT_FOUND' | 'INVALID_QUERY';
      detail?: string;
      hits: [];
    };

export interface RetrievalResult {
  candidates: RankedCandidate[];
  /** Implementation telemetry of the stages that ran (all reads). Not independent proof of zero writes. */
  read_only_receipt?: ReadOnlySideEffectReceiptV1;
  /** Per-lane availability. An unavailable lane contributes zero votes and is never reported as OK. */
  lanes?: { semantic: RetrievalLaneStatusV1; lexical: RetrievalLaneStatusV1 };
  /** NO_EVIDENCE: no lane produced a candidate; nothing is fabricated. */
  evidence_status?: 'OK' | 'NO_EVIDENCE';
  timing: {
    embedding: number;
    qdrant_search: number;
    qdrant_rrf?: number;
    turbovec_transform: number;
    postgres_join: number;
    total: number;
  };
  stages_completed: string[];
  fallback_used: boolean;
}

export interface SummarizationRequest {
  candidates: RankedCandidate[];
  query: string;
  max_tokens?: number;
  temperature?: number;
}

export interface SummarizationResult {
  summary: string;
  extracted_entities: string[];
  key_relations: Array<{ from: string; relation: string; to: string }>;
  confidence: number;
  model: string;
  timing: number;
}

const DEFAULT_CONFIG: RetrievalConfig = {
  qdrant: { host: '127.0.0.1', port: 6333 },
  turbovec: { host: '127.0.0.1', port: 8791 },
  goRetrieval: { host: '127.0.0.1', port: 8100 },
  postgres: {
    host: process.env.POSTGRES_HOST || '127.0.0.1',
    port: parseInt(process.env.POSTGRES_PORT || '5434'),
    user: process.env.POSTGRES_USER || 'legal_admin',
    password: process.env.POSTGRES_PASSWORD || '',
    database: process.env.POSTGRES_DB || 'legal_ai_db'
  },
  ollama: { host: '127.0.0.1', port: 11434 },
  gemma4: { host: '127.0.0.1', port: 8090 }
};

let unifiedRetrievalRuntimeInitialized = false;

/**
 * Explicit boot hook for orchestrator startup policy.
 * Keep module import side-effect free; perform environment-dependent setup here.
 */
export async function initializeUnifiedRetrievalRuntime(config?: Partial<RetrievalConfig>): Promise<RetrievalConfig> {
  if (config) {
    Object.assign(DEFAULT_CONFIG.qdrant, config.qdrant ?? {});
    Object.assign(DEFAULT_CONFIG.turbovec, config.turbovec ?? {});
    Object.assign(DEFAULT_CONFIG.goRetrieval, config.goRetrieval ?? {});
    Object.assign(DEFAULT_CONFIG.postgres, config.postgres ?? {});
    Object.assign(DEFAULT_CONFIG.ollama, config.ollama ?? {});
    Object.assign(DEFAULT_CONFIG.gemma4, config.gemma4 ?? {});
  }

  unifiedRetrievalRuntimeInitialized = true;
  return DEFAULT_CONFIG;
}

const RRF_CONSTANT_K = 60;
const RRF_LANE_WEIGHTS = {
  dense_vector: 1.0,
  turbovec: 0.8,
  lexical: 0.6
} as const;

function buildQdrantFilter(filters?: SearchFilter): Record<string, unknown> | undefined {
  if (!filters) return undefined;

  const must: Record<string, unknown>[] = [];

  if (filters.source_ref) {
    must.push({ key: 'source_ref', match: { value: filters.source_ref } });
  }

  if (filters.source_ref_pattern) {
    must.push({ key: 'source_ref', match: { text: filters.source_ref_pattern } });
  }

  if (filters.directory_path) {
    must.push({ key: 'directory_path', match: { text: filters.directory_path } });
  }

  if (filters.feature_ids?.length) {
    must.push({ key: 'feature_id', match: { any: filters.feature_ids } });
  }

  if (filters.kmeans_cluster_ids?.length) {
    must.push({ key: 'kmeans_cluster_id', match: { any: filters.kmeans_cluster_ids } });
  }

  if (filters.som_row !== undefined) {
    must.push({ key: 'som_row', match: { value: filters.som_row } });
  }

  if (filters.som_col !== undefined) {
    must.push({ key: 'som_col', match: { value: filters.som_col } });
  }

  if (filters.packet_type) {
    must.push({ key: 'packet_type', match: { value: filters.packet_type } });
  }

  if (filters.language) {
    must.push({ key: 'language', match: { value: filters.language } });
  }

  if (filters.file_extension) {
    must.push({ key: 'file_extension', match: { value: filters.file_extension } });
  }

  if (filters.domain_class) {
    must.push({ key: 'domain_class', match: { value: filters.domain_class } });
  }

  if (filters.jsonb_contains) {
    must.push({ key: 'metadata', match: { value: filters.jsonb_contains } });
  }

  return must.length > 0 ? { must } : undefined;
}

/**
 * STAGE 1: Generate 768-dim embedding via embeddinggemma
 */
async function generateEmbedding(query: string, config: RetrievalConfig): Promise<number[]> {
  const startTime = Date.now();
  try {
    // EMBED-CALLER-CONVERGENCE-01: recipe stays the caller's explicit raw query (unprompted_legacy,
    // unchanged); the provider and host/port stay pinned to this config, so the backend is
    // unchanged. Transport shape, the 30 s timeout, and vector validation are now shared.
    const result = await executeProviderEmbeddingV1({
      text: query,
      mode: 'unprompted_legacy',
      provider: { provider: 'ollama', baseUrl: `http://${config.ollama.host}:${config.ollama.port}`, modelId: 'embeddinggemma:latest' }
    });
    return result.embedding;
  } catch (err) {
    console.error('Embedding stage failed:', err);
    throw err;
  }
}

/**
 * STAGE 1.5: Rust N-API optional GPU-accelerated search
 * Tries native module search; falls back to Qdrant if unavailable or errored.
 */
async function rustNapiSearch(
  queryVector: Float32Array,
  filters?: SearchFilter,
  limit: number = 20
): Promise<Array<{ id: string; score: number; payload: any }> | null> {
  try {
    const backend = createCodebaseSearchBackendFromEnv();
    if (backend.kind !== 'rust_napi') {
      return null; // Rust backend not enabled
    }

    const result: SearchBackendResult = await backend.search({
      queryVector,
      vectorName: 'dense_768',
      limit,
      candidateMultiplier: 1,
      includePayload: true,
      filter: filters ? {
        workspaceRevision: filters.workspace_revision,
        packetKeys: filters.packet_keys,
        featureIds: filters.feature_ids,
        sourceRefPrefixes: filters.source_ref_pattern ? [filters.source_ref_pattern] : undefined,
        artifactKinds: filters.artifact_kinds,
        domainIds: filters.domain_ids
      } : undefined
    });

    if (result.warnings?.length) {
      console.warn('Rust N-API warnings:', result.warnings);
    }

    return result.candidates.map((c) => ({
      id: c.candidateId,
      score: c.rawScore,
      payload: {
        packet_key: c.packetKey,
        source_ref: c.sourceRef,
        feature_id: c.featureId,
        tree_node_id: c.treeNodeId,
        content_hash: c.contentHash,
        artifact_kind: c.payload?.artifactKind,
        domain_ids: c.payload?.domainIds,
        backend: 'rust_napi',
        rust_distance: c.distance,
        rust_rank: result.candidates.indexOf(c) + 1
      }
    }));
  } catch (err) {
    console.warn('Rust N-API search failed, falling back to Qdrant:', err);
    return null; // Fallback to Qdrant
  }
}

/**
 * STAGE 2: Qdrant named-vector search + RRF fusion
 */
async function qdrantSearch(
  queryVectors: QueryVectorBundle,
  config: RetrievalConfig,
  useRRF: boolean,
  useLexical: boolean,
  filters?: SearchFilter,
  retrievalTier?: SearchTier,
  limitOverride?: number,
): Promise<Array<{ id: string; score: number; payload: any }>> {
  const startTime = Date.now();
  try {
    const filter = buildQdrantFilter(filters);
    const limit = limitOverride ?? filters?.per_lane_limit ?? 20;
    // Fail-closed: the semantic lane is 768-dim only. No legacy 384 collection fallback.
    resolveSemanticLane();
    const collections = [CANONICAL_QDRANT_COLLECTION];

    const denseHitsById = new Map<string, { id: string; score: number; payload: any }>();

    const collectionRuns = await Promise.allSettled(collections.map(async (collection) => {
      const queryVector = queryVectors.dense768?.vector;

      if (!queryVector || queryVector.length === 0) {
        throw new Error(`Missing query vector for collection ${collection}`);
      }
      assertSemantic768(Array.from(queryVector));

      const denseRes = await fetch(
        `http://${config.qdrant.host}:${config.qdrant.port}/collections/${collection}/points/query`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            query: Array.from(queryVector),
            using: 'content',
            limit,
            // Request only the bounded payload needed for identity and display. In particular,
            // do not allow arbitrary projection payload to become a ranking contract.
            with_payload: [
              'packet_key',
              'source_ref',
              'source_revision',
              'workspace_revision',
              'symbol_version_id',
              'relative_path'
            ],
            with_vector: false,
            filter,
            score_threshold: 0.3
          })
        }
      );

      if (!denseRes.ok) throw new Error(`Qdrant search failed for ${collection}: ${denseRes.status}`);
       const denseData = await denseRes.json() as { result?: { points?: Array<{ id: string; score: number; payload: any }> } };
       const denseHits = denseData.result?.points || [];

      for (const [idx, hit] of denseHits.entries()) {
        const existing = denseHitsById.get(hit.id);
        const projected = {
          ...hit,
          payload: { ...hit.payload, qdrant_rank: idx + 1, qdrant_collection: collection }
        };
        if (!existing || hit.score > existing.score) {
          denseHitsById.set(hit.id, projected);
        }
      }
    }));

    const fulfilled = collectionRuns.filter((run): run is PromiseFulfilledResult<void> => run.status === 'fulfilled');
    if (fulfilled.length === 0 && denseHitsById.size === 0) {
      throw new Error('Qdrant search failed for all adaptive collections');
    }

    return Array.from(denseHitsById.values()).sort((a, b) => b.score - a.score).slice(0, limit);
  } catch (err) {
    console.error('Qdrant search failed:', err);
    throw err;
  }
}

/**
 * STAGE 2.5: rg-pool lexical search (BM25-like via ripgrep)
 * Provides 0.20 weight for lexical signal in RRF blend
 */
async function rgPoolLexicalSearch(
  query: string,
  config: RetrievalConfig,
  limit: number = 10,
  filters?: SearchFilter,
  onFailure?: (message: string) => void
): Promise<Array<{ id: string; file: string; line: number; score: number; rank: number }>> {
  const startTime = Date.now();
  try {
    const pool = getRgPool();
    const results = await pool.search({
      query: filters?.keywords?.join(' ') || query,
      type: 'ts',
      limit: filters?.per_lane_limit ?? limit,
      cwd: process.cwd()
    });

    return results.map((r, idx) => ({
      id: `${r.file}:${r.line}`,
      file: r.file,
      line: r.line,
      score: 1.0 - (idx / Math.max(results.length, 1)),
      rank: idx + 1
    }));
  } catch (err) {
    console.error('rg-pool lexical search failed:', err);
    onFailure?.(err instanceof Error ? err.message : String(err));
    return [];
  }
}

/** Typed lexical lane: a failed ripgrep run is UNAVAILABLE, never an OK lane with zero hits. */
export async function rgPoolLexicalLaneV1(
  query: string,
  config: RetrievalConfig,
  limit: number = 10,
  filters?: SearchFilter
): Promise<LexicalLaneResultV1> {
  const effectiveQuery = filters?.keywords?.join(' ') || query;
  if (!effectiveQuery.trim()) return { status: 'UNAVAILABLE', reason: 'INVALID_QUERY', hits: [] };
  let failure: string | null = null;
  const hits = await rgPoolLexicalSearch(query, config, limit, filters, (message) => {
    failure = message;
  });
  const failureMessage = failure as string | null;
  if (failureMessage !== null) {
    const detail: string = failureMessage;
    const reason = /rg binary not found|ENOENT/i.test(detail) ? 'RG_NOT_FOUND' : 'RG_EXEC_FAILED';
    return { status: 'UNAVAILABLE', reason, detail, hits: [] };
  }
  return { status: 'OK', hits };
}

/**
 * STAGE 3: TurboVec 768→64 transform + ANN prefilter
 */
async function turboVecPrefilter(
  embedding: number[],
  config: RetrievalConfig,
  limit: number = 10,
  filters?: SearchFilter
): Promise<Array<{ id: string; score: number; rank: number }>> {
  const startTime = Date.now();
  try {
    const res = await fetch(
      `http://${config.turbovec.host}:${config.turbovec.port}/search`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vector: embedding.slice(0, 64), // Use first 64-dim as proxy
          limit: filters?.per_lane_limit ?? limit,
          cluster_filter: filters?.kmeans_cluster_ids,
          threshold: 0.3
        })
      }
    );

    if (!res.ok) throw new Error(`TurboVec search failed: ${res.status}`);
    const data = await res.json() as { ids: string[]; scores: number[] };
    return (data.ids || []).map((id, idx) => ({
      id,
      score: data.scores?.[idx] || 0,
      rank: idx + 1
    }));
  } catch (err) {
    console.error('TurboVec prefilter failed:', err);
    throw err;
  }
}

/**
 * STAGE 2 (executor): Postgres pgvector dense search, READ ONLY. Postgres is canonical truth, so this executor returns the canonical
 * codebase_chunk_index.id and revision columns directly instead of relying on a Qdrant id mapping. Same lane as qdrantSearch (lane != executor); never a second vote.
 * One representation only: semantic_768 = content_embedding_768 (raw vector). The older halfvec column content_embedding uses a different recipe and row population, so
 * cosine scores from the two are not interchangeable and are never merged here; it would be a separate executor if ever enabled. content_embedding_768 has no ANN index,
 * so this is an exact scan (measured slow; an HNSW index is a separate schema decision).
 * Uses the shared repository pool (no per-query Pool). Filters this executor cannot honour fail the lane instead of being silently dropped.
 * packet_key is attached only when exactly one atlas_packets row exists for the source_ref; that binding is source_ref-only and NOT revision-qualified
 * (atlas_packets.chunk_id is a different id space: 0 of codebase_chunk_index.id match), so it is labelled packet_binding=SOURCE_REF_UNIQUE.
 */
const PGVECTOR_EXECUTOR_CAVEAT =
  'SEMANTIC_768_COLUMN_content_embedding_768_EXACT_SCAN: single representation, query recipe parity unproven; content_embedding (halfvec, other recipe) is not merged';

async function postgresPgvectorSearch(
  queryVector: Float32Array,
  _config: RetrievalConfig,
  filters: SearchFilter | undefined,
  limit: number,
): Promise<Array<{ id: string; score: number; payload: any }>> {
  if (queryVector.length !== 768 || Array.from(queryVector).some((x) => !Number.isFinite(x))) throw new Error('QUERY_VECTOR_INVALID');
  const unsupported = Object.entries(filters ?? {}).filter(([k, v]) => v != null && !(Array.isArray(v) && v.length === 0) && !['source_ref_pattern', 'per_lane_limit', 'keywords', 'keyword_variants'].includes(k));
  if (unsupported.length) throw new Error(`PGVECTOR_FILTER_UNSUPPORTED:${unsupported.map(([k]) => k).join(',')}`);
  const refPrefix = filters?.source_ref_pattern ? `${String(filters.source_ref_pattern).replace(/[%_\\]/g, '\\$&')}%` : null;
  const vec = `[${Array.from(queryVector).join(',')}]`;
  const n = Math.min(Math.max(limit, 1), 50);
  // Lazy import: the shared pool owner is only loaded when this executor runs, so the orchestrator stays importable without app DB env.
  const { pool } = await import('$lib/server/db/client');
  const res = await pool.query(
    `SELECT id, relative_path, symbol, kind, source_ref, source_revision, workspace_revision, representation_revision, 1 - (content_embedding_768 <=> $1::vector(768)) AS cosine
       FROM codebase_chunk_index
      WHERE content_embedding_768 IS NOT NULL AND ($3::text IS NULL OR source_ref LIKE $3 ESCAPE '\\')
      ORDER BY content_embedding_768 <=> $1::vector(768) LIMIT $2`,
    [vec, n, refPrefix],
  );
  const merged = res.rows as any[];
  const refs = [...new Set(merged.map((r) => r.source_ref).filter(Boolean))];
  const packetByRef = new Map<string, string | null>();
  if (refs.length) {
    const pk = await pool.query(`SELECT source_ref, min(packet_key) AS packet_key, count(*)::int AS n FROM atlas_packets WHERE source_ref = ANY($1::text[]) GROUP BY source_ref`, [refs]);
    for (const p of pk.rows) packetByRef.set(p.source_ref, p.n === 1 ? p.packet_key : null);
  }
  return merged.map((r, idx) => ({
    id: String(r.id), score: Number(r.cosine),
    payload: { packet_key: packetByRef.get(r.source_ref) ?? undefined, source_ref: r.source_ref ?? undefined, source_revision: r.source_revision ?? undefined,
      workspace_revision: r.workspace_revision ?? undefined, representation_revision: r.representation_revision ?? undefined, relative_path: r.relative_path, symbol: r.symbol, kind: r.kind,
      backend: 'postgres_pgvector', embedding_column: 'content_embedding_768', packet_binding: 'SOURCE_REF_UNIQUE', pgvector_rank: idx + 1 },
  }));
}

/**
 * STAGE 4: Postgres truth join
 * Merge Qdrant results with canonical Postgres metadata
 */
async function postgresJoin(
  qdrantIds: string[],
  config: RetrievalConfig
): Promise<Map<string, { candidateId: string; relative_path: string; symbol: string; kind: string }>> {
  if (qdrantIds.length === 0) return new Map();
  if (!config.postgres.password) {
    // No credential in source: an unconfigured join is an explicit failure, never a guess.
    throw new Error('POSTGRES_ENRICHMENT_UNAVAILABLE:POSTGRES_PASSWORD');
  }
  const pool = new Pool(config.postgres);
  try {

    const res = await pool.query(
      `SELECT id, qdrant_id, relative_path, symbol, kind
         FROM codebase_chunk_index
        WHERE qdrant_id = ANY($1::text[])
        LIMIT 20`,
      [qdrantIds.map((id) => String(id))]
    );

    const map = new Map<string, any>();
    (res.rows || []).forEach((row) => {
      map.set(String(row.qdrant_id), {
        candidateId: String(row.id),
        relative_path: row.relative_path,
        symbol: row.symbol,
        kind: row.kind
      });
    });
    return map;
  } catch (err) {
    console.error('Postgres join failed:', err);
    throw err;
  } finally {
    pool.end().catch(() => {});
  }
}

/**
 * STAGE 5: Unified ranking + scoring
 * Combine all ranks using weighted formula:
 * score = 0.30·qdrant + 0.20·turbovec + 0.20·rg_lexical + 0.15·ast + 0.10·postgres + 0.05·freshness
 */
function laneContribution(rank: number, laneWeight: number): number {
  return laneWeight / (RRF_CONSTANT_K + rank);
}

function buildRrfLaneMap(
  qdrantHits: Array<{ id: string; score: number; payload: any }>,
  turboVecHits: Array<{ id: string; score: number; rank: number }>,
  rgLexicalHits: Array<{ id: string; file: string; line: number; score: number; rank: number }>,
): Map<string, Array<{ id: string; rrfContribution: number; rank: number; metadata?: Record<string, unknown>; text?: string }>> {
  const laneMap = new Map<string, Array<{ id: string; rrfContribution: number; rank: number; metadata?: Record<string, unknown>; text?: string }>>();

  laneMap.set(
    'dense_vector',
    qdrantHits.map((hit, idx) => ({
      id: hit.id,
      rank: idx + 1,
      rrfContribution: laneContribution(idx + 1, RRF_LANE_WEIGHTS.dense_vector),
      metadata: {
        source: 'qdrant_dense',
        score: hit.score,
        payload: hit.payload
      },
      text: hit.payload?.relative_path ?? hit.payload?.source_ref ?? hit.id
    }))
  );

  laneMap.set(
    'turbovec',
    turboVecHits.map((hit) => ({
      id: hit.id,
      rank: hit.rank,
      rrfContribution: laneContribution(hit.rank, RRF_LANE_WEIGHTS.turbovec),
      metadata: { source: 'turbovec', score: hit.score }
    }))
  );

  laneMap.set(
    'lexical',
    rgLexicalHits.map((hit) => ({
      id: hit.id,
      rank: hit.rank,
      rrfContribution: laneContribution(hit.rank, RRF_LANE_WEIGHTS.lexical),
      metadata: { source: 'rg_pool', score: hit.score, file: hit.file, line: hit.line },
      text: `${hit.file}:${hit.line}`
    }))
  );

  return laneMap;
}

export function rankCandidates(
  qdrantHits: Array<{ id: string; score: number; payload: any }>,
  turboVecHits: Array<{ id: string; score: number; rank: number }>,
  rgLexicalHits: Array<{ id: string; file: string; line: number; score: number; rank: number }>,
  postgresMap: Map<string, any>,
  resultLimit = 10,
): RankedCandidate[] {
  const combined = combineRRFLanes(buildRrfLaneMap(qdrantHits, turboVecHits, rgLexicalHits));
  const qdrantById = new Map(qdrantHits.map((hit) => [hit.id, hit]));

  return combined
    .map((result) => {
      const pgData = postgresMap.get(result.id) || {
        candidateId: null,
        relative_path: 'N/A',
        symbol: 'N/A',
        kind: 'N/A'
      };
      const qdrant = qdrantById.get(result.id);
      const payload = qdrant?.payload ?? {};
      const packetKey = typeof payload.packet_key === 'string' && payload.packet_key.length > 0
        ? payload.packet_key
        : typeof payload.packetKey === 'string' && payload.packetKey.length > 0
          ? payload.packetKey
          : undefined;
      const sourceRef = typeof payload.source_ref === 'string' && payload.source_ref.length > 0
        ? payload.source_ref
        : typeof payload.sourceRef === 'string' && payload.sourceRef.length > 0
          ? payload.sourceRef
          : undefined;
      const sourceRevision = typeof payload.source_revision === 'string' && payload.source_revision.length > 0
        ? payload.source_revision
        : typeof payload.sourceRevision === 'string' && payload.sourceRevision.length > 0
          ? payload.sourceRevision
          : undefined;
      const workspaceRevision = typeof payload.workspace_revision === 'string' && payload.workspace_revision.length > 0
        ? payload.workspace_revision
        : typeof payload.workspaceRevision === 'string' && payload.workspaceRevision.length > 0
          ? payload.workspaceRevision
          : undefined;
      const symbolVersionId = typeof payload.symbol_version_id === 'string' && payload.symbol_version_id.length > 0
        ? payload.symbol_version_id
        : typeof payload.symbolVersionId === 'string' && payload.symbolVersionId.length > 0
          ? payload.symbolVersionId
          : null;
      const missingFields = (['packetKey', 'sourceRef', 'sourceRevision', 'workspaceRevision'] as const)
        .filter(field => ({ packetKey, sourceRef, sourceRevision, workspaceRevision }[field] == null));
      const fromPostgres = payload.backend === 'postgres_pgvector';
      const qdrantPointId = fromPostgres ? null : (qdrant?.id ?? null);
      const candidateId = typeof pgData.candidateId === 'string' && pgData.candidateId.length > 0
        ? pgData.candidateId
        : null;
      const identity: CandidateIdentityV1 = {
        candidateId,
        qdrantPointId,
        packetKey: packetKey ?? null,
        sourceRef: sourceRef ?? null,
        sourceRevision: sourceRevision ?? null,
        workspaceRevision: workspaceRevision ?? null,
        symbolVersionId,
        identitySource: fromPostgres ? 'POSTGRES_CANONICAL_V1' : qdrant ? 'QDRANT_PAYLOAD_V1' : 'NOT_AVAILABLE',
        missingFields,
      };
      const breakdown = new Map(result.rrfBreakdown.map((item) => [item.lane, item.contribution]));

      return {
        id: result.id,
        identity,
        ...(candidateId ? { candidateId } : {}),
        qdrantPointId: qdrantPointId ?? result.id,
        packetKey,
        sourceRef,
        sourceRevision,
        workspaceRevision,
        score: result.finalScore,
        path: pgData.relative_path,
        symbol: pgData.symbol,
        kind: pgData.kind,
        rg_matches: breakdown.has('lexical') ? 1 : 0,
        ranks: {
          qdrant_dense: breakdown.get('dense_vector'),
          turbovec: breakdown.get('turbovec'),
          rg_lexical: breakdown.get('lexical')
        }
      } satisfies RankedCandidate;
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, resultLimit);
}

/** Apply the opt-in candidate-side latent pass without fabricating identity for incomplete hits. */
export async function applyConfiguredLatent256Dedup(
  ranked: readonly RankedCandidate[],
  config: RetrievalConfig['latent256Dedup'],
): Promise<RankedCandidate[]> {
  if (!config?.enabled) return [...ranked];

  const dedupCandidates = ranked
    .filter((candidate): candidate is RankedCandidate & {
      candidateId: string;
      packetKey: string;
      sourceRef: string;
      identity: CandidateIdentityV1 & { candidateId: string };
    } =>
      typeof candidate.identity.candidateId === 'string' && candidate.identity.candidateId.length > 0 &&
      typeof candidate.packetKey === 'string' && candidate.packetKey.length > 0 &&
      typeof candidate.sourceRef === 'string' && candidate.sourceRef.length > 0)
    .map(candidate => ({
      candidateId: candidate.identity.candidateId,
      packetKey: candidate.packetKey,
      sourceRef: candidate.sourceRef,
      relevanceScore: candidate.score,
    }));
  // The opt-in pass cannot safely satisfy finalK without enough exact canonical IDs.
  // Preserve the production-ranked result unchanged rather than shrinking it or
  // allowing candidatePoolK < finalK to reach the selector.
  if (dedupCandidates.length < config.finalK) return [...ranked];
  const dedupResult = await selectDiverseCandidates({
    candidates: dedupCandidates,
    finalK: config.finalK,
    candidatePoolK: Math.min(config.candidatePoolK, dedupCandidates.length),
    threshold: config.threshold,
    checkpointRevision: config.checkpointRevision,
    candidateSnapshotRevision: config.candidateSnapshotRevision,
    representationRevision: config.representationRevision,
    provider: config.provider,
  });
  const survivorKeys = new Set(dedupResult.selected.map(candidate => candidate.packetKey));
  return ranked.filter(candidate =>
    !candidate.packetKey ||
    typeof candidate.identity.candidateId !== 'string' ||
    candidate.identity.candidateId.length === 0 ||
    survivorKeys.has(candidate.packetKey)
  );
}

/**
 * STAGE 6: LangExtract + Gemma4 summarization
 */
async function summarizeWithGemma4(
  candidates: RankedCandidate[],
  query: string,
  config: RetrievalConfig,
  options: { max_tokens?: number; temperature?: number } = {}
): Promise<SummarizationResult> {
  const startTime = Date.now();
  const maxTokens = options.max_tokens || 128;
  const temperature = options.temperature ?? 0.3;

  try {
    const context = candidates
      .slice(0, 5)
      .map((c) => `${c.path}::${c.symbol} (${c.kind})`)
      .join(', ');

    const prompt = `
Based on these code references: ${context}

Query: ${query}

Provide a 1-2 sentence summary of the relevant code structure and functionality.`;

    // Loaded lazily: runtime-contract throws at import when ROTORQUANT_MODEL_PATH is unset, which
    // must only affect synthesis, not importing or running retrieval.
    const { LLM_MODEL_ID } = await import('$lib/server/llm/runtime-contract.js');
    const res = await fetch(`http://${config.gemma4.host}:${config.gemma4.port}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: LLM_MODEL_ID,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: maxTokens,
        temperature,
        stream: false
      })
    });

    if (!res.ok) throw new Error(`Gemma4 synthesis failed: ${res.status}`);
    const data = await res.json() as { choices?: Array<{ message?: { content: string } }> };
    const summary = data.choices?.[0]?.message?.content || '';

    return {
      summary,
      extracted_entities: [], // TODO: wire LangExtract
      key_relations: [], // TODO: wire LangExtract
      confidence: 0.85,
      model: LLM_MODEL_ID,
      timing: Date.now() - startTime
    };
  } catch (err) {
    console.error('Gemma4 summarization failed:', err);
    throw err;
  }
}

const READ_STAGE_SUBSYSTEMS: Record<string, string> = {
  embedding: 'embedding',
  rust_napi: 'dense_search',
  qdrant_search: 'dense_search',
  rg_pool_lexical: 'lexical_search',
  turbovec_prefilter: 'turbovec',
  postgres_join: 'postgres',
  parent_atlas_enrichment: 'postgres',
  latent256_candidate_dedup: 'latent256',
};

function buildRetrievalReadReceipt(stages: string[], mode: QueryExecutionModeV1): ReadOnlySideEffectReceiptV1 {
  const builder = createReadOnlySideEffectReceiptBuilderV1(mode);
  for (const stage of stages) {
    const subsystem = READ_STAGE_SUBSYSTEMS[stage];
    if (!subsystem) continue;
    builder.record({ subsystem, operation: stage, reads: 1, attemptedWrites: 0, committedWrites: 0, suppressionReason: null });
  }
  return builder.build();
}

/**
 * MAIN ORCHESTRATOR: Execute complete retrieval + summarization pipeline
 */
export async function executeUnifiedRetrieval(
  request: RetrievalRequest,
  config: RetrievalConfig = DEFAULT_CONFIG
): Promise<RetrievalResult> {
  if (request.executionMode === 'MUTATING') {
    throw new Error('UNIFIED_RETRIEVAL_HAS_NO_MUTATING_MODE');
  }
  const executionMode: QueryExecutionModeV1 = request.executionMode ?? 'READ_ONLY';
  const totalStart = Date.now();
  const stages: string[] = [];
  let fallbackUsed = false;
  const retrievalTier =
    request.retrievalTier ??
    inferRetrievalTier({
      query: request.query,
      exactKeywords: request.filters?.keywords,
      expandedKeywords: request.filters?.keyword_variants
    });
  const latent256Config = config.latent256Dedup;
  if (latent256Config?.enabled && latent256Config.candidatePoolK < latent256Config.finalK) {
    throw new Error('latent256 candidatePoolK must be >= finalK when enabled');
  }
  const retrievalLimit = latent256Config?.enabled
    ? latent256Config.candidatePoolK
    : (request.limit ?? 20);

  try {
    // STAGE 1: Embedding — fail-closed on the canonical semantic_768 lane only.
    // No legacy 384 lane is ever requested or normalized to, regardless of
    // what the caller passes in `request.lanes`.
    resolveSemanticLane();
    let semanticLane: RetrievalLaneStatusV1 = { status: 'OK' };
    let queryVectors: QueryVectorBundle | null = null;
    let embedding: Float32Array | null = null;
    try {
      const dense768 = await embedQueryForLane(request.query, 'dense_768');
      if (!dense768?.vector) throw new Error('Failed to generate query vector bundle');
      queryVectors = { dense384: null, dense768, latent64: null };
      embedding = dense768.vector;
    } catch (err) {
      // Availability failure: the semantic lane is marked unavailable and retrieval continues
      // with the remaining lanes. A returned vector of the wrong shape is a contract violation
      // and still throws below.
      const detail = err instanceof Error ? err.message : String(err);
      semanticLane = { status: 'UNAVAILABLE', reason: 'EMBEDDING_FAILED', detail };
      console.warn('Semantic lane unavailable (embedding failed):', detail);
      stages.push('embedding_unavailable');
    }
    if (embedding) {
      assertSemantic768(Array.from(embedding));
      stages.push('embedding');
    }

    // STAGE 1.5: Rust N-API (optional, fallback to Qdrant)
    let qdrantHits: Array<{ id: string; score: number; payload: any }> = [];
    // Semantic executor (same lane, one vote): Postgres pgvector by default because Qdrant projection is not finished; UNIFIED_SEMANTIC_EXECUTOR=qdrant restores the Qdrant/Rust path.
    const semanticExecutor = process.env.UNIFIED_SEMANTIC_EXECUTOR === 'qdrant' ? 'qdrant' : 'postgres_pgvector';
    const pgMap = new Map<string, { candidateId: string; relative_path: string; symbol: string; kind: string }>();
    if (queryVectors && embedding && semanticExecutor === 'postgres_pgvector') {
      try {
        qdrantHits = await postgresPgvectorSearch(embedding, config, request.filters, retrievalLimit);
        for (const h of qdrantHits) pgMap.set(h.id, { candidateId: h.id, relative_path: h.payload.relative_path, symbol: h.payload.symbol, kind: h.payload.kind });
        semanticLane = { status: 'OK', executor: 'postgres_pgvector', note: PGVECTOR_EXECUTOR_CAVEAT };
        stages.push('postgres_pgvector_search');
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        semanticLane = { status: 'UNAVAILABLE', reason: 'SEMANTIC_SEARCH_FAILED', detail };
        console.warn('Semantic lane unavailable (pgvector search failed):', detail);
        stages.push('semantic_search_unavailable');
        qdrantHits = [];
      }
    } else if (queryVectors && embedding) {
      try {
        const rustHits = await rustNapiSearch(embedding, request.filters, retrievalLimit);
        if (rustHits && rustHits.length > 0) {
          stages.push('rust_napi');
          qdrantHits = rustHits; // Use Rust results
        } else {
          qdrantHits = await qdrantSearch(
            queryVectors,
            config,
            request.useRRF ?? true,
            request.useLexical ?? false,
            request.filters,
            retrievalTier,
            retrievalLimit
          );
          stages.push('qdrant_search');
        }
      } catch (err) {
        const detail = err instanceof Error ? err.message : String(err);
        semanticLane = { status: 'UNAVAILABLE', reason: 'SEMANTIC_SEARCH_FAILED', detail };
        console.warn('Semantic lane unavailable (dense search failed):', detail);
        stages.push('semantic_search_unavailable');
        qdrantHits = [];
      }
    }

    const qdrantIds = qdrantHits.map((h) => h.id);

    // STAGE 2.5: rg-pool lexical search (opt-in via useRgPool)
    let rgLexicalHits: Array<{ id: string; file: string; line: number; score: number; rank: number }> = [];
    let lexicalLane: RetrievalLaneStatusV1 = { status: 'DISABLED' };
    if (request.useRgPool ?? true) {
      const lexical = await rgPoolLexicalLaneV1(request.query, config, retrievalLimit, request.filters);
      rgLexicalHits = lexical.hits;
      // A failed lane is reported as unavailable, not as an executed lane with zero hits.
      if (lexical.status === 'OK') {
        lexicalLane = { status: 'OK' };
        stages.push('rg_pool_lexical');
      } else {
        lexicalLane = { status: 'UNAVAILABLE', reason: lexical.reason, detail: lexical.detail };
        stages.push('rg_pool_lexical_unavailable');
      }
    }

    // STAGE 3: TurboVec prefilter
    // TurboVec is an additive prefilter: an outage drops its votes and is recorded, it never aborts retrieval.
    let turboVecHits: Array<{ id: string; score: number; rank: number }> = [];
    if (embedding) {
      try {
        turboVecHits = await turboVecPrefilter(Array.from(embedding), config, retrievalLimit, request.filters);
        stages.push('turbovec_prefilter');
      } catch (err) {
        console.warn('TurboVec prefilter unavailable (non-blocking):', err instanceof Error ? err.message : err);
        stages.push('turbovec_prefilter_unavailable');
      }
    }

    // STAGE 4: Postgres join
    const postgresMap = pgMap.size > 0 ? pgMap : await postgresJoin(qdrantIds, config);
    stages.push('postgres_join');

    // STAGE 4.5: Parent Atlas enrichment (canonical lineage validation + domain taxonomy)
    let parentAtlasContextMap = new Map<string, ParentAtlasContext>();
    try {
      const sourceRefs = Array.from(
        new Set([
          ...qdrantHits.map(h => h.payload?.source_ref || h.id).filter(Boolean),
          // turboVecHits never carries a payload (TurboVec's /search response is
          // {ids, scores} only, see turboVecPrefilter above) — this branch always
          // evaluated to undefined and contributed nothing; removed rather than
          // widening the type to falsely claim a field that never exists.
          ...rgLexicalHits.map(h => h.file).filter(Boolean)
        ])
      );

      if (sourceRefs.length > 0) {
        parentAtlasContextMap = await batchResolveParentAtlasContext(sourceRefs.slice(0, 100));
        stages.push('parent_atlas_enrichment');
      }
    } catch (err) {
      console.warn('Parent Atlas enrichment failed (non-blocking):', err);
      // Enrichment is non-blocking; ranking proceeds without it
    }

    // STAGE 5: Ranking (now with Parent Atlas context)
    const ranked = rankCandidates(
      qdrantHits,
      turboVecHits,
      rgLexicalHits,
      postgresMap,
      latent256Config?.enabled ? latent256Config.candidatePoolK : 10,
    );

    // Optional candidate-side diversity pass. This is deliberately after canonical ranking,
    // never an independent retrieval lane or RRF vote. Missing packet identity is fail-open:
    // those candidates remain in the result and are not sent to the latent provider.
    let rankedAfterLatent256 = ranked;
    if (config.latent256Dedup?.enabled) {
      rankedAfterLatent256 = await applyConfiguredLatent256Dedup(ranked, config.latent256Dedup);
      stages.push('latent256_candidate_dedup');
    }

    // Enhance ranked candidates with Parent Atlas context
    const enhancedRanked = rankedAfterLatent256.map(candidate => ({
      ...candidate,
      parentAtlasContext: parentAtlasContextMap.get(candidate.path) ?? null
    }));

    stages.push('ranking');

    return {
      candidates: enhancedRanked,
      read_only_receipt: buildRetrievalReadReceipt(stages, executionMode),
      lanes: { semantic: semanticLane, lexical: lexicalLane },
      evidence_status: enhancedRanked.length === 0 ? 'NO_EVIDENCE' : 'OK',
      timing: {
        embedding: 0, // Placeholder
        qdrant_search: 0,
        turbovec_transform: 0,
        postgres_join: 0,
        total: Date.now() - totalStart
      },
      stages_completed: stages,
      fallback_used: fallbackUsed
    };
  } catch (err) {
    console.error('Unified retrieval failed:', err);
    throw err;
  }
}

/**
 * MAIN ORCHESTRATOR: Execute complete retrieval + summarization pipeline
 */
export async function executeUnifiedRetrievalWithSummarization(
  request: RetrievalRequest,
  config: RetrievalConfig = DEFAULT_CONFIG,
  summarizeOptions?: { max_tokens?: number; temperature?: number }
): Promise<RetrievalResult & { summary?: SummarizationResult }> {
  const retrievalResult = await executeUnifiedRetrieval(request, config);

  if (retrievalResult.candidates.length === 0) {
    return retrievalResult;
  }

  const summaryResult = await summarizeWithGemma4(
    retrievalResult.candidates,
    request.query,
    config,
    summarizeOptions
  );

  return {
    ...retrievalResult,
    summary: summaryResult
  };
}

export default {
  generateEmbedding,
  rustNapiSearch,
  qdrantSearch,
  rgPoolLexicalSearch,
  turboVecPrefilter,
  postgresJoin,
  rankCandidates,
  summarizeWithGemma4,
  resolveParentAtlasContext,
  enrichFilterWithDomainTaxonomy,
  batchResolveParentAtlasContext,
  executeUnifiedRetrieval,
  executeUnifiedRetrievalWithSummarization
};
