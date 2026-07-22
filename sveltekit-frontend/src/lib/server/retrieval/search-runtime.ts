/**
 * Unified Retrieval Runtime — Single Orchestrator for All Search Operations
 *
 * Three-world architecture owner:
 *   OFFLINE: AST → chunks → summaries → embeddings → graph → Postgres/Qdrant/Neo4j
 *   HOT PATH: query → retrieve → fuse (RRF) → rerank (XGBoost) → render (Mixedbread) → Gemma4
 *   PROMOTION: accepted answer → evaluation → persistence → future retrieval
 *
 * Core principle: Nothing else queries Qdrant, reranks, or calls Mixedbread.
 * All search flows through search() → retrieve() → fuse() → rerank() → promote() → return
 */

import { z } from 'zod';
import type { FeatureEnvelope } from './feature-envelope.js';
import { FeatureEnvelopeSchema } from './feature-envelope.js';
import {
  retrieveAllCandidates,
} from './retrieve-candidates.js';
import { rerankCanonicalFeatureEnvelopes } from './canonical-rerank-executor.js';
import { recordPromotionIntent } from './promote-results-outbox.js';
import { logExposureEvents } from './recommendation-events.js';
import { hydrateCandidates as hydrateFromPostgres } from './hydrate-candidates.js';
import { scoreCandidates, type ScorerOptions } from './candidate-scorer.js';
import { postProcessCandidates, type PostProcessConfig } from './post-process-reranker.js';
import { getQdrantManager } from '$lib/server/vector/qdrant-manager.js';
import type { Retriever, Reranker } from './lane-contracts.js';
import { createQdrantDenseRetriever } from './adapters/qdrant-dense-retriever.js';
import { createQdrantBM42Retriever } from './adapters/qdrant-bm42-retriever.js';
import { createDisabledRetriever } from './adapters/disabled-retriever.js';
import { createPostgresExactRetriever } from './adapters/postgres-exact-retriever.js';
import { createPostgresAstRetriever } from './adapters/postgres-ast-retriever.js';
import type { DenseEmbedding } from '$lib/server/vector/vector-contracts.js';
import { ENV } from '$lib/server/env.server.js';
import {
  CODEBASE_QDRANT_COLLECTION_PRIORITY,
  resolvePreferredCodebaseCollection,
} from '$lib/server/config/vector-config.js';
import { SearchMetadataFilterSchema, type SearchMetadataFilter } from './search-contract.js';

const PROJECT_CANONICAL_EMBED_DIM = 384;
const EMBEDDING_HEALTH_CACHE_MS = 60_000;

let embeddingHealthCache:
  | {
      checkedAt: number;
      healthy: boolean;
    }
  | null = null;

async function isEmbeddingHealthy(): Promise<boolean> {
  const cached = embeddingHealthCache;
  if (cached && Date.now() - cached.checkedAt < EMBEDDING_HEALTH_CACHE_MS) {
    return cached.healthy;
  }

  try {
    const res = await fetch(`${ENV.OLLAMA_BASE_URL}/api/tags`, {
      signal: AbortSignal.timeout(1500),
    });
    const healthy = res.ok;
    embeddingHealthCache = {
      checkedAt: Date.now(),
      healthy,
    };
    return healthy;
  } catch {
    embeddingHealthCache = {
      checkedAt: Date.now(),
      healthy: false,
    };
    return false;
  }
}

/**
 * Startup assertion: verify canonical Qdrant collection exists AND has the correct
 * vector dimension (384) on the 'content' named vector.
 *
 * Warnings (non-fatal):
 *  - Collection missing → dense retrieval will return empty results
 *  - Wrong dimension → silently wrong scores; must run re-index
 *  - 'content' named vector absent → adapter will fail at query time
 */
async function validateQdrantDimensions(): Promise<void> {
  try {
    const qdrant = getQdrantManager();

    let activeCollection: string | null = null;

    const collectionsResult = await qdrant.getCollections().catch(() => null);
    if (!collectionsResult) {
      console.warn('[search-runtime] Qdrant dimension validation skipped: getCollections() failed.');
      return;
    }

    const existingNames = new Set(
      (collectionsResult.collections ?? []).map((c: { name: string }) => c.name)
    );

    activeCollection = resolvePreferredCodebaseCollection(existingNames).toString();

    if (!activeCollection) {
      console.warn(
        `[search-runtime] None of ${CODEBASE_QDRANT_COLLECTION_PRIORITY.join(', ')} found in Qdrant. ` +
        'Dense retrieval will return empty results. Run `npm run atlas:qdrant:384:restore:apply`.'
      );
      return;
    }

    if (activeCollection === 'codebase_chunks_384') {
      console.warn(
        '[search-runtime] codebase_chunks_384_hybrid not found. Using dense-only codebase_chunks_384. ' +
        'Run `npm run atlas:backfill:hybrid` to populate the hybrid collection.'
      );
    }

    // Fetch collection info and verify 'content' named vector dimension
    const info = await (qdrant as any).client.getCollection(activeCollection).catch(() => null);
    if (!info) {
      console.warn(`[search-runtime] Could not fetch collection info for ${activeCollection}.`);
      return;
    }

    // Qdrant SDK response shape: info.config.params.vectors.<name>.size
    const vectorsConfig: Record<string, unknown> | undefined =
      (info as any)?.config?.params?.vectors ??
      (info as any)?.result?.config?.params?.vectors;

    if (!vectorsConfig || typeof vectorsConfig !== 'object') {
      console.warn(
        `[search-runtime] ${activeCollection}: could not read vectors config from collection info. ` +
        'Dimension validation skipped.'
      );
      return;
    }

    const contentVec = vectorsConfig['content'] as { size?: number } | undefined;
    if (!contentVec) {
      console.warn(
        `[search-runtime] ${activeCollection}: 'content' named vector is absent. ` +
        'Dense retrieval will fail at query time. Re-create the collection with the content vector.'
      );
      return;
    }

    const actualDim = contentVec.size;
    if (actualDim !== PROJECT_CANONICAL_EMBED_DIM) {
      console.warn(
        `[search-runtime] ${activeCollection}: 'content' vector has dimension ${actualDim}, ` +
        `expected ${PROJECT_CANONICAL_EMBED_DIM}. ` +
        'Search scores will be wrong. Run `npm run atlas:qdrant:384:restore:apply` to rebuild.'
      );
    }
    // Dimension matches — no warning needed
  } catch (error) {
    console.warn('[search-runtime] Qdrant collection validation failed:', (error as Error).message);
  }
}

// Run validation on first module load (non-blocking, logs warnings)
validateQdrantDimensions().catch(err => {
  console.error('⚠️ Qdrant dimension validation failed:', err);
});

/**
 * Canonical query request shape
 */
export const SearchQuerySchema = z.object({
  text: z.string().min(1).max(1000),
  userId: z.string().min(1).optional(),
  caseId: z.string().optional(),
  topK: z.number().int().min(1).max(100).default(20),
  threshold: z.number().min(0).max(1).optional(),
  filters: SearchMetadataFilterSchema.default({}),
  spanContext: z.object({
    traceId: z.string().optional(),
    parentSpanId: z.string().optional(),
  }).optional(),
});

export type SearchQuery = z.infer<typeof SearchQuerySchema>;

/**
 * Candidate representation (before reranking)
 */
export interface Candidate {
  id: string;
  packetKey: string;
  sourceRef: string;
  summary: string;
  content: string;
  score: number;
  scoreSource: 'postgres_trigram' | 'qdrant' | 'exact_symbol' | 'ast_tree' | 'schema';
}

/**
 * Fused candidate (after RRF)
 */
export interface FusedCandidate extends Candidate {
  fusionScore: number;
  rankBefore: number;
}

/**
 * Final result (after reranking + rendering)
 */
export interface SearchResult {
  packets: FeatureEnvelope[];
  metadata: {
    query: string;
    queryEmbedding?: number[];
    candidatesRetrieved: number;
    candidatesFused: number;
    candidatesScored: number;
    candidatesReranked: number;
    candidatesPostProcessed: number;
    durationMs: number;
    stages: {
      retrieve: number;
      fuse: number;
      score: number;
      hydrate: number;
      rerank: number;
      postProcess: number;
      promote?: number;
    };
  };
  provenance: {
    retrievalSources: Array<'postgres_trigram' | 'qdrant' | 'exact_symbol' | 'ast_tree'>;
    fusionMethod: 'rrf';
    rerankModel: string;
    rerankerUsed: boolean;
    promotionAttempted?: boolean;
  };
  promotion?: {
    status: 'success' | 'partial' | 'skipped' | 'failed';
    recordsPromoted: number;
    stages: Array<{
      name: string;
      committed: number;
      failed: number;
    }>;
  };
}

/**
 * Dependency-injection config for SearchRuntime.
 * When `retrievers` is omitted the runtime falls back to `retrieveAllCandidates()`
 * (production default). Tests inject fakes via `retrievers` to avoid touching
 * Qdrant/Postgres/Redis.
 */
export interface SearchRuntimeConfig {
  userId?: string;
  caseId?: string;
  /** Injected retrieval adapters. When absent, production singletons are used. */
  retrievers?: Retriever[];
  /** Injected reranker. When absent, `rerankCanonicalFeatureEnvelopes` is used. */
  reranker?: Reranker;
  /** Options for Stage 3b: candidate scorer. */
  scorerOptions?: ScorerOptions;
  /** Options for Stage 4b: post-process reranker (freshness, dislike, diversity). */
  postProcessConfig?: Partial<PostProcessConfig>;
  /**
   * Per-query freshness map: packetKey → last updated Date.
   * Typically populated from atlas_packets.updated_at during hydration.
   */
  updatedAtMap?: ReadonlyMap<string, Date>;
  /**
   * Per-session disliked packet keys (from user feedback / recommendation ledger).
   * Passed here so post-process doesn't need a DB call.
   */
  dislikedPacketKeys?: ReadonlySet<string>;
}

function applySearchMetadataFilter(
  candidates: Candidate[],
  filters?: SearchMetadataFilter
): Candidate[] {
  if (!filters) return candidates;

  return candidates.filter((candidate) => {
    if (filters.sourceRefs?.length && !filters.sourceRefs.includes(candidate.sourceRef)) {
      return false;
    }

    if (filters.pathPrefixes?.length && !filters.pathPrefixes.some((prefix) => candidate.sourceRef.startsWith(prefix))) {
      return false;
    }

    return true;
  });
}

/** Stage timings extended with scorer and post-process steps. */
interface StageTiming {
  retrieve: number;
  fuse: number;
  score: number;
  hydrate: number;
  rerank: number;
  postProcess: number;
  promote?: number;
}

/**
 * Single entry point for all retrieval operations
 */
export class SearchRuntime {
  private userId?: string;
  private caseId?: string;
  private injectedRetrievers?: Retriever[];
  private injectedReranker?: Reranker;
  private scorerOptions?: ScorerOptions;
  private postProcessConfig?: Partial<PostProcessConfig>;
  private updatedAtMap: ReadonlyMap<string, Date>;
  private dislikedPacketKeys: ReadonlySet<string>;

  constructor(config: SearchRuntimeConfig) {
    this.userId = config.userId;
    this.caseId = config.caseId;
    this.injectedRetrievers = config.retrievers;
    this.injectedReranker = config.reranker;
    this.scorerOptions = config.scorerOptions;
    this.postProcessConfig = config.postProcessConfig;
    this.updatedAtMap = config.updatedAtMap ?? new Map();
    this.dislikedPacketKeys = config.dislikedPacketKeys
      ? new Set(config.dislikedPacketKeys)
      : new Set();
  }

  /**
   * Unified search entrypoint
   * Orchestrates: query → retrieve → fuse → rerank → render → return
   */
  async search(queryInput: SearchQuery): Promise<SearchResult> {
    const startTime = Date.now();
    const stageTiming: StageTiming = {
      retrieve: 0,
      fuse: 0,
      score: 0,
      hydrate: 0,
      rerank: 0,
      postProcess: 0,
    };

    try {
      // Validate query
      const query = SearchQuerySchema.parse(queryInput);
      const embeddingHealthy = await isEmbeddingHealthy();

      // Stage 1: Retrieve candidates from multiple sources
      const retrieveStart = Date.now();
      const candidates = await this.retrieveCandidates(query, { includeVectorLanes: embeddingHealthy });
      stageTiming.retrieve = Date.now() - retrieveStart;

      if (candidates.length === 0) {
        return {
          packets: [],
          metadata: {
            query: query.text,
            candidatesRetrieved: 0,
            candidatesFused: 0,
            candidatesScored: 0,
            candidatesReranked: 0,
            candidatesPostProcessed: 0,
            durationMs: Date.now() - startTime,
            stages: stageTiming,
          },
          provenance: {
            retrievalSources: [],
            fusionMethod: 'rrf',
            rerankModel: 'none',
            rerankerUsed: false,
          },
        };
      }

      // Stage 2: Fuse candidates with RRF
      const fuseStart = Date.now();
      const fused = await this.fuseCandidates(candidates);
      stageTiming.fuse = Date.now() - fuseStart;

      if (!embeddingHealthy) {
        const topPackets = await this.hydrateCandidates(
          fused.slice(0, query.topK).map((candidate) => ({
            id: candidate.packetKey,
            packetKey: candidate.packetKey,
            sourceRef: candidate.sourceRef,
            summary: '',
            content: '',
            score: candidate.score,
            scoreSource: candidate.scoreSource,
            fusionScore: candidate.fusionScore,
            rankBefore: candidate.rankBefore,
          })),
        );

        return {
          packets: topPackets,
          metadata: {
            query: query.text,
            candidatesRetrieved: candidates.length,
            candidatesFused: fused.length,
            candidatesScored: fused.length,
            candidatesReranked: 0,
            candidatesPostProcessed: 0,
            durationMs: Date.now() - startTime,
            stages: {
              ...stageTiming,
              score: 0,
              hydrate: Date.now() - retrieveStart,
              rerank: 0,
              postProcess: 0,
            },
          },
          provenance: {
            retrievalSources: this.getRetrievalSources(candidates),
            fusionMethod: 'rrf',
            rerankModel: 'degraded-no-rerank',
            rerankerUsed: false,
            promotionAttempted: false,
          },
        };
      }

      // Stage 3b: Score — deterministic blended score per candidate (pre-hydration)
      // This stage does NOT reorder; it attaches blendedScore for downstream ranking.
      const scoreStart = Date.now();
      const scored = await scoreCandidates(
        query.text,
        fused.map(c => ({
          packetKey: c.packetKey,
          sourceRef: c.sourceRef,
          fusionScore: c.fusionScore,
          rankBefore: c.rankBefore,
          score: c.score,
          scoreSource: c.scoreSource,
          qdrantPointId: (c as any).qdrantPointId,
          packetId: (c as any).packetId,
        })),
        this.scorerOptions,
      );
      stageTiming.score = Date.now() - scoreStart;

      // Sort by blendedScore before hydration so we hydrate the best candidates first
      const scoredSorted = [...scored].sort(
        (a, b) => b.blendedScore - a.blendedScore || a.packetKey.localeCompare(b.packetKey)
      );

      // Stage 3: Hydrate candidates into feature envelopes (top-K by blended score)
      const hydrateStart = Date.now();
      const envelopes = await this.hydrateCandidates(
        scoredSorted.slice(0, query.topK).map(sc => ({
          id: sc.packetKey,
          packetKey: sc.packetKey,
          sourceRef: sc.sourceRef,
          summary: '',
          content: '',
          score: sc.blendedScore,
          scoreSource: sc.scoreSource as FusedCandidate['scoreSource'],
          fusionScore: sc.fusionScore,
          rankBefore: sc.rankBefore,
        })),
      );
      stageTiming.hydrate = Date.now() - hydrateStart;

      // Stage 4: Rerank with the canonical executor
      const rerankStart = Date.now();
      const reranked = await this.rerankCandidates(envelopes, query);
      stageTiming.rerank = Date.now() - rerankStart;

      // Stage 4b: Post-process — business-rule adjustments (freshness, dislike, diversity)
      // Re-join reranked envelope order with scored candidates to produce ScoredCandidate[]
      const ppStart = Date.now();
      const scoredByKey = new Map(scored.map(s => [s.packetKey, s]));
      const rerankedAsScored = reranked.map((env, idx) => {
        const key = env.packet_key ?? env.chunk_id ?? '';
        const base = scoredByKey.get(key) ?? {
          packetKey: key,
          sourceRef: env.source_ref ?? '',
          fusionScore: 0,
          rankBefore: idx + 1,
          score: 0,
          scoreSource: 'qdrant' as const,
          blendedScore: 0,
          scorerVersion: 'passthrough',
          modelScored: false,
        };
        return { ...base, blendedScore: base.blendedScore || (reranked.length - idx) / reranked.length };
      });

      const postProcessed = postProcessCandidates(
        rerankedAsScored,
        {
          ...this.postProcessConfig,
          dislikedPacketKeys: this.dislikedPacketKeys,
        },
        this.updatedAtMap,
      );
      stageTiming.postProcess = Date.now() - ppStart;

      // Apply post-process ordering back to envelopes
      const envByKey = new Map(
        reranked.map(env => [env.packet_key ?? env.chunk_id ?? '', env])
      );
      const finalPackets = postProcessed
        .slice(0, query.topK)
        .map(pp => envByKey.get(pp.packetKey))
        .filter((env): env is (typeof reranked)[number] => env !== undefined);

      // Stage 6: Promotion (transactional outbox, non-blocking)
      const promoteStart = Date.now();
      stageTiming.promote = 0;

      // Queue promotion jobs in outbox table (async, no wait)
      recordPromotionIntent(finalPackets, {
        queryText: query.text,
        userId: this.userId,
      }).then(enqueuedCount => {
        stageTiming.promote = Date.now() - promoteStart;
        console.log(`Promotion queued: ${enqueuedCount} jobs enqueued from ${finalPackets.length} packets`);
      }).catch(error => {
        console.error('Promotion intent recording failed (non-blocking):', error);
      });

      // Log exposure events for the recommendation ledger (fire-and-forget)
      // Must happen after final ranking so positions are accurate.
      logExposureEvents(
        finalPackets.map((pkt, idx) => ({
          packet_key: pkt.packet_key ?? pkt.chunk_id,
          source_ref: pkt.source_ref ?? '',
          position: idx + 1,
        })),
        {
          query_text: query.text,
          session_key: query.spanContext?.traceId,
          actor_key: this.userId,
        },
      );

      return {
        packets: finalPackets,
        metadata: {
          query: query.text,
          candidatesRetrieved: candidates.length,
          candidatesFused: fused.length,
          candidatesScored: scored.length,
          candidatesReranked: reranked.length,
          candidatesPostProcessed: postProcessed.length,
          durationMs: Date.now() - startTime,
          stages: stageTiming,
        },
        provenance: {
          retrievalSources: this.getRetrievalSources(candidates),
          fusionMethod: 'rrf',
          rerankModel: reranked[0]?.model_version ?? 'mixedbread-ai/mxbai-rerank-base-v2',
          rerankerUsed: reranked.length > 0,
          promotionAttempted: true,
        },
      };
    } catch (error) {
      console.error('Search runtime error:', error);
      throw error;
    }
  }

  /**
   * Stage 1: Retrieve candidates deterministically from multiple sources.
   * When injected retrievers are present (DI / test path), each is called in
   * parallel and their LaneCandidates are projected into the Candidate shape.
   * When no retrievers are injected, falls back to the production singleton path.
   */
  private async retrieveCandidates(
    query: SearchQuery,
    options?: { includeVectorLanes?: boolean }
  ): Promise<Candidate[]> {
    if (!this.injectedRetrievers || this.injectedRetrievers.length === 0) {
      return applySearchMetadataFilter(
        await retrieveAllCandidates(query.text, query.filters, undefined, options),
        query.filters
      );
    }

    const input = { query: query.text, limit: query.topK * 5, filters: query.filters as Record<string, unknown> };
    const perLane = await Promise.all(
      this.injectedRetrievers.map(r => r.retrieve(input).catch(err => {
        console.warn(`[search-runtime] retriever(${r.lane}) failed:`, (err as Error).message);
        return [];
      }))
    );

    // Stamp each lane candidate before projecting — allows fusion-stage tracking
    // and prevents accidental double-fusion detection downstream.
    const stamped = perLane.flat().map(lc => ({
      ...lc,
      fusionStage: 'lane' as const,
    }));

    return applySearchMetadataFilter(stamped.map(lc => ({
      id: lc.qdrantPointId ?? lc.packetId ?? lc.packetKey,
      packetKey: lc.packetKey,
      sourceRef: lc.sourceRef,
      summary: String(lc.metadata?.['summary'] ?? ''),
      content: String(lc.metadata?.['content'] ?? ''),
      score: lc.score ?? 0,
      scoreSource: (lc.lane === 'dense' ? 'qdrant'
        : lc.lane === 'exact' ? 'exact_symbol'
        : lc.lane === 'ast' ? 'ast_tree'
        : 'postgres_trigram') as Candidate['scoreSource'],
    })), query.filters);
  }

  /**
   * Stage 2: Fuse candidates with RRF (Reciprocal Rank Fusion)
   * Only one fusion implementation. No other score combiners exist.
   */
  private async fuseCandidates(candidates: Candidate[]): Promise<FusedCandidate[]> {
    // Drop malformed candidates before grouping
    const valid = candidates.filter(
      c => c.packetKey && c.packetKey.trim() !== '' && c.sourceRef && c.sourceRef.trim() !== ''
    );

    // Group by source and get ranking within each
    const sourceRanks = new Map<string, Map<string, number>>();

    const sources = ['postgres_trigram', 'qdrant', 'exact_symbol', 'ast_tree', 'schema', 'rg_keyword'] as const;
    for (const source of sources) {
      const sourceCards = valid.filter(c => c.scoreSource === source);
      sourceCards.sort((a, b) => b.score - a.score || a.packetKey.localeCompare(b.packetKey));
      const ranked = new Map<string, number>();
      sourceCards.forEach((c, idx) => {
        ranked.set(c.packetKey, idx + 1);
      });
      sourceRanks.set(source, ranked);
    }

    // Apply RRF formula: score = Σ(1 / (k + rank)) for each source
    // k = 60 (standard RRF constant)
    const rrfScores = new Map<string, number>();
    for (const [packetKey] of new Map(valid.map(c => [c.packetKey, c]))) {
      let rrfScore = 0;
      for (const [source, ranks] of sourceRanks) {
        const rank = ranks.get(packetKey);
        if (rank) {
          rrfScore += 1 / (60 + rank);
        }
      }
      rrfScores.set(packetKey, rrfScore);
    }

    // Sort by RRF score and assign new ranks
    const sorted = Array.from(valid).sort((a, b) => {
      const scoreA = rrfScores.get(a.packetKey) ?? 0;
      const scoreB = rrfScores.get(b.packetKey) ?? 0;
      return scoreB - scoreA;
    });

    const unique = new Map<string, FusedCandidate>();
    for (const candidate of sorted) {
      if (!unique.has(candidate.packetKey)) {
        unique.set(candidate.packetKey, {
          ...candidate,
          fusionScore: rrfScores.get(candidate.packetKey) ?? 0,
          rankBefore: unique.size + 1,
        });
      }
    }

    return Array.from(unique.values()).map((c, idx) => ({
      ...c,
      rankBefore: idx + 1,
    }));
  }

  /**
   * Stage 3: Hydrate candidates into feature envelopes
   * Bulk fetch from Postgres to construct complete packet structures
   */
  private async hydrateCandidates(candidates: FusedCandidate[]): Promise<FeatureEnvelope[]> {
    if (candidates.length === 0) return [];
    return hydrateFromPostgres(candidates);
  }

  /**
   * Stage 4: Rerank candidates with XGBoost + Mixedbread
   * XGBoost owns the initial ranking (top-20).
   * Mixedbread owns the final semantic reordering (top-5).
   * Nothing else reranks.
   */
  private async rerankCandidates(
    envelopes: FeatureEnvelope[],
    query: SearchQuery,
  ): Promise<Array<FeatureEnvelope & { model_version?: string; blended_score?: number }>> {
    const result = await rerankCanonicalFeatureEnvelopes(query.text, envelopes as any, {
      authScope: query.userId ?? this.userId ?? 'public',
      rendererVersion: 'search-runtime-v1',
      maxLength: 4096,
      topK: Math.min(query.topK, envelopes.length || query.topK),
    });

    return result.results;
  }

  /**
   * Helper: Extract which sources contributed to the final candidate set
   */
  private getRetrievalSources(candidates: Candidate[]): Array<'postgres_trigram' | 'qdrant' | 'exact_symbol' | 'ast_tree' | 'rg_keyword'> {
    const sources = new Set<'postgres_trigram' | 'qdrant' | 'exact_symbol' | 'ast_tree' | 'rg_keyword'>();
    for (const c of candidates) {
      if (c.scoreSource !== 'schema') {
        sources.add(c.scoreSource as 'postgres_trigram' | 'qdrant' | 'exact_symbol' | 'ast_tree' | 'rg_keyword');
      }
    }
    return Array.from(sources);
  }
}

/**
 * Factory for creating search runtime instances (production path — no injected adapters).
 * Backward-compatible: existing callers require no changes.
 */
export function createSearchRuntime(config?: { userId?: string; caseId?: string }): SearchRuntime {
  return new SearchRuntime(config ?? {});
}

/**
 * Embed function adapter: wraps the project-canonical embedText path into the
 * DenseEmbedding contract expected by QdrantDenseRetrieverConfig.embedFn.
 *
 * Lazily imports embedText to avoid circular deps at module load time.
 */
async function makeEmbedFn(text: string): Promise<DenseEmbedding> {
  const { embedText } = await import('$lib/server/embedding/embed.js');
  const values: number[] = await embedText(text.slice(0, 2000));
  return {
    values,
    model: 'embeddinggemma:latest',
    dimension: values.length,
    version: '1',
  };
}

/**
 * Production factory with explicitly wired DI adapters.
 * Each adapter is fail-closed: returns [] on any error, never throws.
 */
export function createProductionSearchRuntime(config?: { userId?: string; caseId?: string }): SearchRuntime {
  const retrievers: Retriever[] = [
    createQdrantDenseRetriever({
      collection: 'codebase_chunks_384',
      vectorName: 'content',
      embedFn: makeEmbedFn,
      expectedDimension: 384,
    }),
    createQdrantBM42Retriever({
      collection: 'codebase_chunks_384',
      sparseVectorName: 'bm25',
    }),
    createDisabledRetriever('sparse', 'sparse_not_provisioned'),
    createPostgresExactRetriever(),
    createPostgresAstRetriever(),
  ];

  return new SearchRuntime({ ...(config ?? {}), retrievers });
}
