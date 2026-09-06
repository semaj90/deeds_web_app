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
import { createHash } from 'node:crypto';
import type { FeatureEnvelope } from './feature-envelope.js';
import type { ScorerOptions } from './candidate-scorer.js';
import type { PostProcessConfig } from './post-process-reranker.js';
import type { Retriever, Reranker } from './lane-contracts.js';
import type { DenseEmbedding } from '../vector/vector-contracts.js';
import { ENV } from '../env.server.js';
import { SearchMetadataFilterSchema, type SearchMetadataFilter } from './search-contract.js';
import type { HydrationProofContext, HydrationProofSummary, HydratedCandidatesWithProof } from './hydrate-candidates.js';
import { buildPolicyStateFromRerankSignals } from '../analysis/hmm-policy-bridge.js';
import { buildPolicyStateVector } from '../atlas/policy/policy-state.js';
import { budgetFor } from '../atlas/policy/execution-budget.js';
import { routePolicy } from '../atlas/policy/policy-router.js';
import { appendSearchRuntimeTrainingRow } from '../atlas/policy/policy-training.js';
import { CANONICAL_EMBEDDING_DIMENSION } from '../vector/embedding-dimension-guard.js';
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
 * Startup assertion: verify the active Qdrant collection exists AND has the correct
 * vector dimension for its lane contract on the 'content' named vector.
 *
 * Warnings (non-fatal):
 *  - Collection missing → dense retrieval will return empty results
 *  - Wrong dimension → silently wrong scores; must run re-index
 *  - 'content' named vector absent → adapter will fail at query time
 */
async function validateQdrantDimensions(): Promise<void> {
  try {
    const {
      CODEBASE_QDRANT_COLLECTION_PRIORITY,
      resolvePreferredCodebaseCollection,
    } = await import('$lib/server/config/vector-config.js');
    const { getVectorLaneByCollection } = await import('../vector/lane-registry.js');
    const { getQdrantManager } = await import('$lib/server/vector/qdrant-manager.js');
    const qdrant = getQdrantManager();

    let activeCollection: string | null = null;

    const collectionsResult = await qdrant.getCollections().catch(() => null);
    if (!collectionsResult) {
      console.warn('[search-runtime] Qdrant dimension validation skipped: getCollections() failed.');
      return;
    }

    const existingNames = new Set<string>(
      (collectionsResult.collections ?? []).map((c: { name: string }) => String(c.name))
    );

    const resolvedCollection = resolvePreferredCodebaseCollection(existingNames);
    activeCollection = resolvedCollection ? String(resolvedCollection) : null;

    if (!activeCollection) {
      console.warn(
        `[search-runtime] None of ${CODEBASE_QDRANT_COLLECTION_PRIORITY.join(', ')} found in Qdrant. ` +
        'Dense retrieval will return empty results. Run the Qdrant collection reconciliation / rebuild gate.'
      );
      return;
    }

    if (activeCollection !== 'codebase_chunks_768_v2') {
      console.warn(
        `[search-runtime] canonical dense collection codebase_chunks_768_v2 is not active. Using ${activeCollection} as fallback until v2 is available.`
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

    const expectedDim =
      getVectorLaneByCollection(activeCollection)?.dimension ??
      CANONICAL_EMBEDDING_DIMENSION;

    const actualDim = contentVec.size;
    if (actualDim !== expectedDim) {
      console.warn(
        `[search-runtime] ${activeCollection}: 'content' vector has dimension ${actualDim}, ` +
        `expected ${expectedDim}. ` +
        'Search scores will be wrong. Rebuild or reproject the active collection before trusting retrieval.'
      );
    }
    // Dimension matches — no warning needed
  } catch (error) {
    console.warn('[search-runtime] Qdrant collection validation failed:', (error as Error).message);
  }
}

let searchRuntimeValidated = false;

/**
 * Explicit boot hook for runtime validation.
 * Importing this module must remain side-effect free so retrieval entrypoints
 * can load cheaply during SSR and unit tests.
 */
export async function initializeSearchRuntime(): Promise<void> {
  if (searchRuntimeValidated) return;
  searchRuntimeValidated = true;

  try {
    await validateQdrantDimensions();
  } catch (err) {
    console.error('⚠️ Qdrant dimension validation failed:', err);
  }
}

/**
 * Canonical query request shape
 */
export const SearchQuerySchema = z.object({
  text: z.string().min(1).max(1000),
  userId: z.string().min(1).optional(),
  caseId: z.string().optional(),
  workspaceId: z.string().min(1).optional(),
  workspaceRevision: z.string().min(1).optional(),
  sourceRevision: z.string().min(1).optional(),
  representationId: z.string().min(1).optional(),
  representationRevision: z.number().int().positive().optional(),
  topK: z.number().int().min(1).max(100).default(20),
  rerankTier: z.enum(['deep', 'fast']).optional(),
  threshold: z.number().min(0).max(1).optional(),
  filters: SearchMetadataFilterSchema.default({
    includeGenerated: false,
    includeLegacy: false,
  } as any),
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
  symbolVersionId?: string | null;
  symbol_version_id?: string | null;
  packet_key?: string | null;
  source_ref?: string | null;
  content_hash?: string | null;
  fallback_id?: string | null;
  sourceRef: string;
  summary: string;
  content: string;
  score: number;
  scoreSource:
    | 'postgres_trigram'
    | 'qdrant'
    | 'qdrant_768'
    | 'exact_symbol'
    | 'ast_tree'
    | 'schema'
    | 'rg_keyword';
  embeddingLane?: 'dense_768' | 'bm42'; // dense_768 is canonical dense lane
  workspaceId?: string | null;
  workspaceRevision?: string | null;
  sourceRevision?: string | null;
  representationId?: string | null;
  representationRevision?: number | null;
  qdrantPointId?: string | null;
  /** Physical executor that produced this hit; never an additional logical lane. */
  retrievalExecutor?: string | null;
  treeNodeId?: string | null;
  pageRankScore?: number | null;
  stableSymbolId?: string | null;

  /**
   * Which field `packetKey`/`symbolVersionId` actually resolved from, per
   * `identity-resolution.ts::resolveCanonicalIdentity` — the shared precedence primitive also
   * used by `rrf-integration.ts`. Absent on candidates constructed before this field existed;
   * treat absence the same as `'canonical'` for backward compatibility, never as `'degraded'`.
   *
   * Widened 2026-09-02 (RF-IDENTITY-CALLER-MATRIX-01) to match `identity-resolution.ts`'s 4-way
   * `resolveCanonicalIdentity` status (RF-IDENTITY-SEMANTICS-02). `projection_exact` (content_hash)
   * and `source_group` (source_ref) are deliberately treated identically to `degraded` by every
   * `identityStatus === 'canonical'` check below -- neither is ever promoted to a canonical dedup
   * key. This is a type fix only; no fusion/dedup behavior changed.
   */
  identityStatus?: 'canonical' | 'projection_exact' | 'source_group' | 'degraded';
  identitySource?: 'symbol_version_id' | 'packet_key' | 'content_hash' | 'source_ref' | 'lane_id_fallback';
  /**
   * RF-QDRANT-HYDRATION-02 (2026-09-02): the Postgres-hydrated, `ProjectionRegistryV1`-validated
   * canonical chunk identity for a `semantic_768`/`codebase_chunks_768_v2` dense hit. Populated
   * ONLY when `resolveProjectionsBatch` confirms the Qdrant point's own `postgres_id` payload
   * agrees with its point id (fail-closed -- absent, not guessed, on `PROJECTION_NOT_FOUND` or
   * `CANONICAL_IDENTITY_MISMATCH`). This is observability/evidence only in this step: it is not
   * yet consumed by `resolveCanonicalIdentityV2` or fusion/dedup, which remains on the V1
   * `identityStatus` precedence above. Wiring it into V2-based dedup is a separate, later step.
   */
  canonicalChunkId?: string | null;
}

/**
 * Fused candidate (after RRF)
 */
export interface FusedCandidate extends Candidate {
  fusionScore: number;
  rankBefore: number;
  contributingLanes?: Candidate['scoreSource'][];
  laneEvidence?: LaneEvidence[];
}

export type LogicalRetrievalLane = 'dense' | 'lexical' | 'exact' | 'ast' | 'schema' | 'rg' | 'bm42';

export interface LaneEvidence {
  lane: LogicalRetrievalLane;
  bestRank: number;
  bestScore: number;
  contributionCount: number;
  supportingHitCount: number;
  supportingBackendIds: string[];
  /** Executor provenance retained for auditability; all entries still count as one lane vote. */
  executorIds: string[];
  contributingSources: Candidate['scoreSource'][];
}

export interface RetrievalProofSummary {
  requestedTopK: number;
  oversampleFactor: number;
  rawQdrantCount: number;
  canonicalJoinedCount: number;
  canonicalJoinMissingCount: number;
  workspaceRejectedCount: number;
  workspaceRevisionRejectedCount: number;
  sourceRevisionRejectedCount: number;
  representationRejectedCount: number;
  representationRevisionRejectedCount: number;
  duplicateSymbolVersionCount: number;
  acceptedUniqueSymbolCount: number;
  semanticLaneCount: number;
  lexicalLaneCount: number;
  graphLaneCount: number;
  pagerankLaneCount: number;
  summaryLaneCount: number;
  graphScoreAttachedCount: number;
  graphScoreMissingCount: number;
  summaryResolvedCount: number;
  summaryStaleRejectedCount: number;
  rrfInputLaneCounts: Record<string, number>;
  rrfOutputCount: number;
  finalContextCount: number;
  validationReasons: Record<string, number>;
}

/**
 * Final result (after reranking + rendering)
 */
export interface SearchResult {
  packets: FeatureEnvelope[];
  proof?: RetrievalProofSummary;
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
    retrievalSources: Array<'postgres_trigram' | 'qdrant' | 'qdrant_768' | 'exact_symbol' | 'ast_tree' | 'rg_keyword'>;
    fusionMethod: 'rrf';
    rerankModel: string;
    rerankerUsed: boolean;
    promotionAttempted?: boolean;
    /**
     * KAG hypergraph neighbor evidence (openspec/changes/parent-atlas-ace-rlm-bitfrost-integration,
     * KAG-01/KAG-02/KAG-06), purely additive/informational — NEVER used for
     * scoring, fusion, or reranking above. Populated by
     * `lookupHypergraphNeighbors()` (below) via
     * `kag-hypergraph-reader-v1.ts::readKagHypergraphNeighborsV1()`, which
     * reads real `atlas_ontology_linked_tuples`/`atlas_hyperedges` rows and
     * runs them through `kag-mutual-index-v1.ts::buildKagMutualIndexV1()`.
     *
     * Still commonly `undefined` in practice: both source tables are
     * near-empty in production as of KAG-06 (only proven with fixture rows
     * that were deleted after verification), and the field is only emitted
     * when a canonicalId actually has ≥1 matching hyperedge. Fail-open by
     * construction — a DB error or empty match set omits the field rather
     * than throwing.
     */
    hypergraphNeighbors?: Array<{ canonicalId: string; hyperedgeIds: string[] }>;
    /**
     * True when this SearchRuntime instance was constructed with
     * `readOnly: true` (see `SearchRuntimeConfig.readOnly`) — i.e. this call
     * performed zero writes to the promotion outbox or recommendation
     * ledger. Absent/false means the normal production write path ran.
     * Added for ACE-FEATURE-SOURCE-OWNER-01 / the SearchRuntime zero-write
     * boundary gate: a proof/canary script can assert on this field instead
     * of having to infer "no writes happened" from timing or DB state.
     */
    readOnly?: boolean;
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
  /**
   * When true, `search()` skips all known write side effects entirely -- not
   * just their errors: promotion-outbox enqueue, recommendation-ledger
   * exposure logging, and policy-training JSONL export. Every other stage
   * (retrieve/fuse/score/hydrate/rerank/postProcess/hypergraph lookup) is
   * read-only and is unaffected.
   *
   * Added for the SearchRuntime zero-write read-only execution boundary gate
   * (ACE-FEATURE-SOURCE-OWNER-01 finding, parent-atlas-retrieval-lineage-dag-convergence
   * tasks.md 2026-09-04): a live proof/canary needed to call the real
   * `SearchRuntime.search()` without side effects and previously could not.
   * Defaults to false/undefined -- every existing production call site is
   * unaffected unless it explicitly opts in.
   */
  readOnly?: boolean;
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
  private readOnly: boolean;

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
    this.readOnly = config.readOnly ?? false;
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
      const proofContext = {
        workspaceId: query.workspaceId ?? null,
        workspaceRevision: query.workspaceRevision ?? null,
        sourceRevision: query.sourceRevision ?? null,
        representationId: query.representationId ?? null,
        representationRevision: query.representationRevision ?? null,
      };

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
          proof: this.buildRetrievalProof({
            query,
            rawCandidates: candidates,
            fusedCandidates: [],
            hydrationProof: {
              canonicalJoinedCount: 0,
              canonicalJoinMissingCount: 0,
              workspaceRejectedCount: 0,
              workspaceRevisionRejectedCount: 0,
              sourceRevisionRejectedCount: 0,
              representationRejectedCount: 0,
              representationRevisionRejectedCount: 0,
              graphScoreAttachedCount: 0,
              graphScoreMissingCount: 0,
              summaryResolvedCount: 0,
              summaryStaleRejectedCount: 0,
              validationReasons: {},
            },
            finalPackets: [],
            postProcessedCount: 0,
            rerankedCount: 0,
          }),
          provenance: {
            retrievalSources: [],
            fusionMethod: 'rrf',
            rerankModel: 'none',
            rerankerUsed: false,
            promotionAttempted: false,
            readOnly: this.readOnly,
          },
        };
      }

      // Stage 2: Fuse candidates with RRF
      const fuseStart = Date.now();
    const fused = await this.fuseCandidates(candidates);
      stageTiming.fuse = Date.now() - fuseStart;

      if (!embeddingHealthy) {
        const hydrated = await this.hydrateCandidatesWithProof(
          fused.slice(0, query.topK).map((candidate) => ({
            id: candidate.packetKey,
            packetKey: candidate.packetKey,
            symbolVersionId: candidate.symbolVersionId,
            sourceRef: candidate.sourceRef,
            summary: '',
            content: '',
            score: candidate.score,
            scoreSource: candidate.scoreSource,
            fusionScore: candidate.fusionScore,
            rankBefore: candidate.rankBefore,
            qdrantPointId: candidate.qdrantPointId,
            workspaceId: candidate.workspaceId,
            workspaceRevision: candidate.workspaceRevision,
            sourceRevision: candidate.sourceRevision,
            representationId: candidate.representationId,
            representationRevision: candidate.representationRevision,
            treeNodeId: candidate.treeNodeId,
            pageRankScore: candidate.pageRankScore,
            stableSymbolId: candidate.stableSymbolId,
          })) as any,
          proofContext,
        );
        const topPackets = hydrated.envelopes;
        const hypergraphNeighborsDegraded = await this.lookupHypergraphNeighbors(topPackets);

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
          proof: this.buildRetrievalProof({
            query,
            rawCandidates: candidates,
            fusedCandidates: fused,
            hydrationProof: hydrated.proof,
            finalPackets: topPackets,
            postProcessedCount: topPackets.length,
            rerankedCount: 0,
          }),
          provenance: {
            retrievalSources: this.getRetrievalSources(candidates),
            fusionMethod: 'rrf',
            rerankModel: 'degraded-no-rerank',
            rerankerUsed: false,
            promotionAttempted: false,
            readOnly: this.readOnly,
            ...(hypergraphNeighborsDegraded ? { hypergraphNeighbors: hypergraphNeighborsDegraded } : {}),
          },
        };
      }

      // Stage 3b: Score — deterministic blended score per candidate (pre-hydration)
      // This stage does NOT reorder; it attaches blendedScore for downstream ranking.
      const scoreStart = Date.now();
      const { scoreCandidates } = await import('./candidate-scorer.js');
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
          // Previously dropped here despite blendScores() having a live 0.1 weight for it —
          // pagerank silently contributed zero to every ranked result. See
          // openspec/changes/parent-atlas-retrieval-lod-algorithm-taxonomy.
          //
          // graphScore (atlas_graph_authority_scores) deliberately NOT wired here yet —
          // held pending an authority-provenance audit: atlas_graph_authority_scores also
          // stores pagerank_raw/pagerank_l1 alongside authority_percentile, so it may be the
          // SAME PageRank signal as pageRankScore under a different name. Wiring both would
          // double-count one signal as 0.05·PR + 0.10·"authority" ≈ 0.15·PR. See the
          // "2026-08-08 addendum" in the LOD taxonomy proposal.md — do not re-add graphScore
          // here until that audit reaches a DISTINCT_SIGNAL verdict with evidence.
          pagerankScore: c.pageRankScore ?? undefined,
        })) as any,
        this.scorerOptions,
      );
      stageTiming.score = Date.now() - scoreStart;

      // Sort by blendedScore before hydration so we hydrate the best candidates first
      const scoredSorted = [...scored].sort(
        (a, b) => b.blendedScore - a.blendedScore || a.packetKey.localeCompare(b.packetKey)
      );

      // Stage 3: Hydrate candidates into feature envelopes (top-K by blended score)
      const hydrateStart = Date.now();
      const hydrated = await this.hydrateCandidatesWithProof(
        scoredSorted.slice(0, query.topK).map((sc) => {
          const scoreCandidate = sc as any;
          return {
            id: sc.packetKey,
            packetKey: sc.packetKey,
            symbolVersionId: scoreCandidate.symbolVersionId ?? sc.packetKey,
            sourceRef: sc.sourceRef,
            summary: '',
            content: '',
            score: sc.blendedScore,
            scoreSource: sc.scoreSource as FusedCandidate['scoreSource'],
            fusionScore: sc.fusionScore,
            rankBefore: sc.rankBefore,
            qdrantPointId: scoreCandidate.qdrantPointId,
            workspaceId: scoreCandidate.workspaceId,
            workspaceRevision: scoreCandidate.workspaceRevision,
            sourceRevision: scoreCandidate.sourceRevision,
            representationId: scoreCandidate.representationId,
            representationRevision: scoreCandidate.representationRevision,
            treeNodeId: scoreCandidate.treeNodeId,
            pageRankScore: scoreCandidate.pageRankScore,
            stableSymbolId: scoreCandidate.stableSymbolId,
            contributingLanes: scoreCandidate.contributingLanes ?? [scoreCandidate.scoreSource],
          };
        }) as any,
        proofContext,
      );
      const envelopes = hydrated.envelopes;
      stageTiming.hydrate = Date.now() - hydrateStart;

      // DIAGNOSTIC: hydration boundary — envelope count + typed reject reasons
      console.info('[stage:hydrate] output', {
        inputCount: Math.min(scoredSorted.length, query.topK),
        envelopeCount: envelopes.length,
        proof: hydrated.proof,
        sampleCandidates: scoredSorted.slice(0, 3).map((sc) => ({
          packetKey: sc.packetKey,
          sourceRef: sc.sourceRef,
          scoreSource: sc.scoreSource,
        })),
      });

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
          scoreSource: 'qdrant_768' as const,
          blendedScore: 0,
          scorerVersion: 'passthrough',
          modelScored: false,
        };
        return { ...base, blendedScore: base.blendedScore || (reranked.length - idx) / reranked.length };
      });

      const { postProcessCandidates } = await import('./post-process-reranker.js');
      const ppAudit = { requestId: query.text.slice(0, 64), decisions: [] as import('./post-process-reranker.js').PostProcessDecision[] };
      const postProcessed = postProcessCandidates(
        rerankedAsScored,
        {
          ...this.postProcessConfig,
          dislikedPacketKeys: this.dislikedPacketKeys,
        },
        this.updatedAtMap,
        new Map(),
        ppAudit,
      );
      stageTiming.postProcess = Date.now() - ppStart;

      // DIAGNOSTIC: every input candidate must have an auditable KEEP/DROP decision
      {
        const kept = ppAudit.decisions.filter((d) => d.decision === 'KEEP').length;
        const dropped = ppAudit.decisions.filter((d) => d.decision === 'DROP');
        console.info('[stage:postprocess] decisions', {
          input: rerankedAsScored.length,
          output: postProcessed.length,
          explainedDrops: dropped.length,
          unexplainedDrops: rerankedAsScored.length - kept - dropped.length,
          drops: dropped.map((d) => ({ packetKey: d.packetKey, reason: d.reason, detail: d.detail })),
        });
      }

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

      if (!this.readOnly) {
        // Queue promotion jobs in outbox table (async, no wait)
        const { recordPromotionIntent } = await import('./promote-results-outbox.js');
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
        const { logExposureEvents } = await import('./recommendation-events.js');
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
      }

      const hypergraphNeighbors = await this.lookupHypergraphNeighbors(finalPackets);

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
        proof: this.buildRetrievalProof({
          query,
          rawCandidates: candidates,
          fusedCandidates: fused,
          hydrationProof: hydrated.proof,
          finalPackets,
          postProcessedCount: postProcessed.length,
          rerankedCount: reranked.length,
        }),
        provenance: {
          retrievalSources: this.getRetrievalSources(candidates),
          fusionMethod: 'rrf',
          rerankModel: reranked[0]?.model_version ?? 'mixedbread-ai/mxbai-rerank-base-v2',
          rerankerUsed: reranked.length > 0,
          promotionAttempted: !this.readOnly,
          readOnly: this.readOnly,
          ...(hypergraphNeighbors ? { hypergraphNeighbors } : {}),
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
      const { retrieveAllCandidates } = await import('./retrieve-candidates.js');
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
      symbolVersionId: lc.symbolVersionId ?? lc.packetKey ?? null,
      sourceRef: lc.sourceRef,
      summary: String(lc.metadata?.['summary'] ?? ''),
      content: String(lc.metadata?.['content'] ?? ''),
      score: lc.score ?? 0,
      scoreSource: (
        lc.lane === 'dense'
          ? 'qdrant_768'
          : lc.lane === 'exact'
          ? 'exact_symbol'
          : lc.lane === 'ast'
            ? 'ast_tree'
            : 'postgres_trigram'
      ) as Candidate['scoreSource'],
      workspaceId: typeof lc.workspaceId === 'string' ? lc.workspaceId : undefined,
      workspaceRevision: typeof lc.workspaceRevision === 'string' ? lc.workspaceRevision : undefined,
      sourceRevision: typeof lc.sourceRevision === 'string' ? lc.sourceRevision : undefined,
      representationId: typeof lc.representationId === 'string' ? lc.representationId : undefined,
      representationRevision: typeof lc.representationRevision === 'number' ? lc.representationRevision : undefined,
      qdrantPointId: typeof lc.qdrantPointId === 'string' ? lc.qdrantPointId : undefined,
      retrievalExecutor: typeof lc.metadata?.['retrieval_executor'] === 'string'
        ? String(lc.metadata['retrieval_executor'])
        : typeof lc.metadata?.['executor'] === 'string'
          ? String(lc.metadata['executor'])
          : lc.lane === 'dense' ? 'qdrant' : lc.lane,
      treeNodeId: typeof lc.metadata?.['tree_node_id'] === 'string' ? String(lc.metadata['tree_node_id']) : undefined,
      pageRankScore: typeof lc.metadata?.['page_rank_score'] === 'number' ? lc.metadata['page_rank_score'] as number : undefined,
      stableSymbolId: typeof lc.metadata?.['stable_symbol_id'] === 'string' ? lc.metadata['stable_symbol_id'] as string : undefined,
      embeddingLane:
        lc.metadata?.['embedding_lane'] === 'dense_768'
          ? 'dense_768'
          : lc.metadata?.['embedding_lane'] === 'bm42'
            ? 'bm42'
            : undefined,
    })), query.filters);
  }

  /**
   * Stage 2: Fuse candidates with RRF (Reciprocal Rank Fusion)
   * Only one fusion implementation. No other score combiners exist.
   */
  private async fuseCandidates(candidates: Candidate[]): Promise<FusedCandidate[]> {
    return fuseSearchRuntimeCandidates(candidates);
  }

  private getFusionIdentityKey(candidate: Candidate): string {
    return getFusionIdentityKey(candidate);
  }

  /**
   * Stage 3: Hydrate candidates into feature envelopes
   * Bulk fetch from Postgres to construct complete packet structures
   */
  private async hydrateCandidates(candidates: FusedCandidate[]): Promise<FeatureEnvelope[]> {
    return (await this.hydrateCandidatesWithProof(candidates)).envelopes;
  }

  private async hydrateCandidatesWithProof(
    candidates: FusedCandidate[],
    expected?: HydrationProofContext,
  ): Promise<HydratedCandidatesWithProof> {
    const { hydrateCandidatesWithProof } = await import('./hydrate-candidates.js');
    return hydrateCandidatesWithProof(candidates as any, expected);
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
    const { rerankCanonicalFeatureEnvelopes } = await import('./canonical-rerank-executor.js');
    const policyInput = buildPolicyStateFromRerankSignals({
      query: query.text,
      signals: envelopes.map((envelope) => ({
        denseScore: envelope.dense?.score ?? null,
        lexicalScore: envelope.lexical?.score ?? null,
        astScore: envelope.ast?.score ?? null,
        pageRankScore: envelope.authority?.page_rank ?? envelope.authority?.score ?? null,
        communityScore: envelope.authority?.score ?? null,
        exactPathScore: envelope.ast?.score ?? envelope.metadata?.score ?? null,
      })),
      vramPressure: 0.25,
      contextPressure: Math.min(1, Math.max(0.05, envelopes.length / 24)),
      latencyPressure: query.rerankTier === 'deep' ? 0.55 : 0.25,
      cacheHitRatio: 0.5,
    });
    const policyState = buildPolicyStateVector(policyInput);
    const policyDecision = routePolicy(policyState);
    const executionBudget = budgetFor(policyDecision.budget, policyDecision.stateHint);

    // DIAGNOSTIC: Log input state
    console.info('[stage:rerank] input', {
      candidateCount: envelopes.length,
      packetKeys: envelopes.slice(0, 5).map(e => e.packet_key),
      policyAction: policyDecision.action,
      policyBudget: policyDecision.budget,
      policyStateHint: policyDecision.stateHint,
    });

    const result = await rerankCanonicalFeatureEnvelopes(query.text, envelopes as any, {
      authScope: query.userId ?? this.userId ?? 'public',
      rendererVersion: 'search-runtime-v1',
      maxLength: executionBudget.maxContextTokens,
      topK: Math.min(
        query.topK,
        envelopes.length || query.topK,
        policyDecision.action === 'FAST_RERANK'
          ? executionBudget.maxFastRerankCandidates
          : (executionBudget.maxDeepRerankCandidates || executionBudget.maxFastRerankCandidates),
      ),
      rerankTier: query.rerankTier ?? (policyDecision.action === 'FAST_RERANK' ? 'fast' : 'deep'),
      policyDecision,
      policyState,
      executionBudget,
    });

    // DIAGNOSTIC: Log output state
    console.info('[stage:rerank] output', {
      candidateCount: result.results.length,
      packetKeys: result.results.slice(0, 5).map(r => r.packet_key),
      modelVersion: result.provenance?.modelVersion,
      fallbackReason: result.provenance?.fallbackReason,
      cacheStatus: result.provenance?.cacheStatus,
      policyAction: result.provenance?.policyAction,
      policyBudget: result.provenance?.policyBudget,
      policyStateHint: result.provenance?.policyStateHint,
    });

    // SAFETY: Preserve input if output is empty (fail-open)
    if (result.results.length === 0 && envelopes.length > 0) {
      console.warn('[stage:rerank] reranker returned 0 results for', envelopes.length, 'inputs. Preserving retrieval order.');
      return envelopes.map((envelope, index) => ({
        ...envelope,
        model_version: 'retrieval_order_preserved',
        blended_score: undefined,
      }));
    }

    if (!this.readOnly) {
      void appendSearchRuntimeTrainingRow({
        traceId: query.spanContext?.traceId ?? createHash('sha256').update(query.text).digest('hex').slice(0, 16),
        query: query.text,
        queryHash: createHash('sha256').update(query.text.toLowerCase()).digest('hex').slice(0, 16),
        policyState,
        policyDecision,
        rerankProvenance: result.provenance,
        revisions: {
          workspaceRevision: query.workspaceRevision ?? 'unknown',
          sourceRevision: query.sourceRevision ?? 'unknown',
          representationRevision: String(query.representationRevision ?? 'unknown'),
          featureRevision: policyState.featureRevision,
        },
        labelProvenance: {
          source: result.provenance.crossEncoderUsed ? 'EXECUTION' : 'REPLAY',
          sourceRevision: result.provenance.modelVersion,
          sourceRefs: result.results.slice(0, 3).map((entry) => String(
            (entry as any).source_ref ??
            (entry as any).sourceRef ??
            (entry as any).packet_key ??
            (entry as any).packetKey ??
            (entry as any).feature_id ??
            (entry as any).featureId ??
            ''
          )).filter((value) => value.length > 0),
        },
        candidatePacketKeys: result.results.slice(0, 10).map((entry) => String(
          (entry as any).packet_key ??
          (entry as any).packetKey ??
          (entry as any).feature_id ??
          (entry as any).featureId ??
          ''
        )).filter((value) => value.length > 0),
        sourceRefs: result.results.slice(0, 5).map((entry) => String(
          (entry as any).source_ref ??
          (entry as any).sourceRef ??
          (entry as any).packet_key ??
          (entry as any).packetKey ??
          ''
        )).filter((value) => value.length > 0),
        executionId: result.provenance.cacheKey ?? undefined,
        labelConfidence: result.results.length > 0 ? 1 : 0.5,
      }).catch((error) => {
        console.warn('[stage:rerank] policy training export skipped:', error);
      });
    }

    return result.results;
  }

  /**
   * KAG "next steps" item 1 (openspec/changes/parent-atlas-ace-rlm-bitfrost-integration):
   * looks up real hypergraph neighbor evidence for the final packet set via
   * `kag-hypergraph-reader-v1.ts`. Purely additive/informational — called
   * only after ranking is final, and never allowed to throw into the main
   * search path (fail-open, returns undefined on any error so `provenance`
   * simply omits the field, matching its pre-existing optional contract).
   */
  private async lookupHypergraphNeighbors(
    packets: FeatureEnvelope[],
  ): Promise<Array<{ canonicalId: string; hyperedgeIds: string[] }> | undefined> {
    const canonicalIds = packets
      .map((p) => p.packet_key ?? p.source_ref)
      .filter((v): v is string => Boolean(v));
    if (canonicalIds.length === 0) return undefined;
    try {
      const { readKagHypergraphNeighborsV1 } = await import('../atlas/integration/kag-hypergraph-reader-v1.js');
      const receipt = await readKagHypergraphNeighborsV1(canonicalIds);
      return receipt.neighbors.length > 0 ? receipt.neighbors : undefined;
    } catch (error) {
      console.warn('[search-runtime] hypergraph neighbor lookup failed (non-blocking):', error);
      return undefined;
    }
  }

  /**
   * Helper: Extract which sources contributed to the final candidate set
   */
  private getRetrievalSources(candidates: Candidate[]): Array<'postgres_trigram' | 'qdrant' | 'qdrant_768' | 'exact_symbol' | 'ast_tree' | 'rg_keyword'> {
    const sources = new Set<'postgres_trigram' | 'qdrant' | 'qdrant_768' | 'exact_symbol' | 'ast_tree' | 'rg_keyword'>();
    for (const c of candidates) {
      if (c.scoreSource !== 'schema') {
        sources.add(c.scoreSource as 'postgres_trigram' | 'qdrant' | 'qdrant_768' | 'exact_symbol' | 'ast_tree' | 'rg_keyword');
      }
    }
    return Array.from(sources);
  }

  private buildRetrievalProof(input: {
    query: SearchQuery;
    rawCandidates: Candidate[];
    fusedCandidates: FusedCandidate[];
    hydrationProof: HydrationProofSummary;
    finalPackets: FeatureEnvelope[];
    postProcessedCount: number;
    rerankedCount: number;
  }): RetrievalProofSummary {
    const { query, rawCandidates, fusedCandidates, hydrationProof, finalPackets } = input;
    const rawQdrantCount = rawCandidates.filter((candidate) => candidate.scoreSource === 'qdrant' || candidate.scoreSource === 'qdrant_768').length;
    const semanticLaneCount = rawQdrantCount;
    const lexicalLaneCount = rawCandidates.filter((candidate) => candidate.scoreSource === 'postgres_trigram').length;
    const graphLaneCount = rawCandidates.filter((candidate) => candidate.scoreSource === 'ast_tree').length;
    const pagerankLaneCount = finalPackets.filter((packet) => typeof packet.page_rank_score === 'number' && Number.isFinite(packet.page_rank_score)).length;
    const summaryLaneCount = rawCandidates.filter((candidate) => candidate.scoreSource === 'rg_keyword').length;
    const rrfInputLaneCounts = rawCandidates.reduce<Record<string, number>>((acc, candidate) => {
      const key = candidate.scoreSource;
      acc[key] = (acc[key] ?? 0) + 1;
      return acc;
    }, {});
    const uniqueSymbolKeys = new Set<string>();
    let duplicateSymbolVersionCount = 0;
    for (const candidate of rawCandidates) {
      const key = this.getFusionIdentityKey(candidate);
      if (uniqueSymbolKeys.has(key)) {
        duplicateSymbolVersionCount += 1;
      } else {
        uniqueSymbolKeys.add(key);
      }
    }

    return {
      requestedTopK: query.topK,
      oversampleFactor: rawCandidates.length > 0 ? Math.max(1, Math.ceil(rawCandidates.length / Math.max(1, query.topK))) : 0,
      rawQdrantCount,
      canonicalJoinedCount: hydrationProof.canonicalJoinedCount,
      canonicalJoinMissingCount: hydrationProof.canonicalJoinMissingCount,
      workspaceRejectedCount: hydrationProof.workspaceRejectedCount,
      workspaceRevisionRejectedCount: hydrationProof.workspaceRevisionRejectedCount,
      sourceRevisionRejectedCount: hydrationProof.sourceRevisionRejectedCount,
      representationRejectedCount: hydrationProof.representationRejectedCount,
      representationRevisionRejectedCount: hydrationProof.representationRevisionRejectedCount,
      duplicateSymbolVersionCount,
      acceptedUniqueSymbolCount: fusedCandidates.length,
      semanticLaneCount,
      lexicalLaneCount,
      graphLaneCount,
      pagerankLaneCount,
      summaryLaneCount,
      graphScoreAttachedCount: hydrationProof.graphScoreAttachedCount,
      graphScoreMissingCount: hydrationProof.graphScoreMissingCount,
      summaryResolvedCount: hydrationProof.summaryResolvedCount,
      summaryStaleRejectedCount: hydrationProof.summaryStaleRejectedCount,
      rrfInputLaneCounts,
      rrfOutputCount: fusedCandidates.length,
      finalContextCount: finalPackets.length,
      validationReasons: hydrationProof.validationReasons,
    };
  }
}

/**
 * Same precedence as `identity-resolution.ts`, kept here for exact backward-compatible ranking
 * behavior. RF5-LIVE-REPLAY-01 (2026-09-02) found a real over-merge risk in the `packetKey` tier:
 * `packetKey` is file/packet-granular, not chunk-granular, so two legitimately distinct chunks of
 * the same packet would otherwise collapse into one fused result under this key alone. When
 * `canonicalChunkId` (RF-QDRANT-HYDRATION-02's hydrated, Qdrant-validated chunk identity) is
 * present, it disambiguates the `packetKey` tier by chunk. Absent on every candidate before that
 * wiring existed, so this is purely additive -- zero behavior change when `canonicalChunkId` is
 * unset, which covers 100% of pre-existing candidates/tests. `symbolVersionId` is left untouched:
 * it is already symbol/version-granular and does not need chunk disambiguation.
 */
export function getFusionIdentityKey(candidate: Candidate): string {
  const symbolVersionId = candidate.symbolVersionId?.trim();
  if (symbolVersionId) return symbolVersionId;
  const packetKey = candidate.packetKey?.trim();
  if (packetKey) {
    const canonicalChunkId = candidate.canonicalChunkId?.trim();
    return canonicalChunkId ? `${packetKey}::chunk:${canonicalChunkId}` : packetKey;
  }
  return candidate.id;
}

/**
 * Revision-qualified identity for fusion. A candidate with both source and workspace revisions
 * must not merge with the same packet/chunk key from another revision. Candidates without both
 * revisions retain the pre-existing key for compatibility, but remain visibly unqualified in
 * their candidate envelope and cannot be promoted by this function.
 */
function getRevisionQualifiedFusionIdentityKey(candidate: Candidate): string {
  const identityKey = getFusionIdentityKey(candidate);
  const sourceRevision = candidate.sourceRevision?.trim();
  const workspaceRevision = candidate.workspaceRevision?.trim();
  const isRevision = (value: string | undefined): value is string =>
    Boolean(value && /^sha256:[0-9a-f]{64}$/i.test(value));
  if (!isRevision(sourceRevision) || !isRevision(workspaceRevision)) return identityKey;
  return `revision:${workspaceRevision}::${sourceRevision}::${identityKey}`;
}

function getFusionBackendIdentityKey(candidate: Candidate): string {
  return (
    candidate.fallback_id?.trim() ||
    candidate.qdrantPointId?.trim() ||
    candidate.treeNodeId?.trim() ||
    candidate.id.trim() ||
    getFusionIdentityKey(candidate)
  );
}

function getFusionLogicalLane(candidate: Candidate): LogicalRetrievalLane {
  if (candidate.embeddingLane === 'bm42') return 'bm42';
  if (candidate.embeddingLane === 'dense_768') return 'dense';

  switch (candidate.scoreSource) {
    case 'postgres_trigram':
      return 'lexical';
    case 'qdrant':
    case 'qdrant_768':
      return 'dense';
    case 'exact_symbol':
      return 'exact';
    case 'ast_tree':
      return 'ast';
    case 'schema':
      return 'schema';
    case 'rg_keyword':
      return 'rg';
    default:
      return 'lexical';
  }
}

function compareIdentityKeys(a: Candidate, b: Candidate): number {
  const keyA = getRevisionQualifiedFusionIdentityKey(a);
  const keyB = getRevisionQualifiedFusionIdentityKey(b);
  if (keyA !== keyB) return keyA.localeCompare(keyB);

  const backendA = getFusionBackendIdentityKey(a);
  const backendB = getFusionBackendIdentityKey(b);
  if (backendA !== backendB) return backendA.localeCompare(backendB);

  return a.scoreSource.localeCompare(b.scoreSource) || a.sourceRef.localeCompare(b.sourceRef) || a.id.localeCompare(b.id);
}

function compareRepresentativeCandidates(a: Candidate, b: Candidate): number {
  const scoreDelta = b.score - a.score;
  if (Math.abs(scoreDelta) > 1e-12) return scoreDelta;
  return compareIdentityKeys(a, b);
}

function compareLaneOrder(a: LogicalRetrievalLane, b: LogicalRetrievalLane): number {
  const order: LogicalRetrievalLane[] = ['dense', 'lexical', 'exact', 'ast', 'schema', 'rg', 'bm42'];
  return order.indexOf(a) - order.indexOf(b);
}

function compareFusedCandidates(a: FusedCandidate, b: FusedCandidate): number {
  const scoreDelta = b.fusionScore - a.fusionScore;
  if (Math.abs(scoreDelta) > 1e-12) return scoreDelta;
  if (a.identityStatus !== b.identityStatus) {
    return a.identityStatus === 'canonical' ? -1 : 1;
  }
  const laneA = a.laneEvidence?.[0]?.lane ?? getFusionLogicalLane(a);
  const laneB = b.laneEvidence?.[0]?.lane ?? getFusionLogicalLane(b);
  const laneDelta = compareLaneOrder(laneA, laneB);
  if (laneDelta !== 0) return laneDelta;
  const keyA = a.identityStatus === 'canonical' ? getFusionIdentityKey(a) : getFusionBackendIdentityKey(a);
  const keyB = b.identityStatus === 'canonical' ? getFusionIdentityKey(b) : getFusionBackendIdentityKey(b);
  if (keyA !== keyB) return keyA.localeCompare(keyB);
  return a.scoreSource.localeCompare(b.scoreSource) || a.sourceRef.localeCompare(b.sourceRef) || a.id.localeCompare(b.id);
}

/**
 * Stage 2 fusion core, extracted to a standalone module-level function so it's directly
 * unit-testable without instantiating `SearchRuntime` (which requires live Postgres/Qdrant
 * config). Behavior is unchanged from the original private-method implementation except for two
 * fixes: (1) within-lane ranking now keeps the best rank on a duplicate identity instead of
 * letting a later, worse-ranked duplicate silently overwrite it; (2) `identityStatus`/
 * `identitySource` (from `retrieve-candidates.ts`'s `deriveIdentity` tagging) now propagate onto
 * the fused output instead of being dropped.
 */
export function fuseSearchRuntimeCandidates(candidates: Candidate[]): FusedCandidate[] {
  // Drop malformed candidates before grouping
  const valid = candidates.filter(
    c => c.packetKey && c.packetKey.trim() !== '' && c.sourceRef && c.sourceRef.trim() !== ''
  );

  interface LaneGroup {
    lane: LogicalRetrievalLane;
    outputKey: string;
    identityStatus: 'canonical' | 'projection_exact' | 'source_group' | 'degraded';
    canonicalKey: string | null;
    backendKey: string;
    representative: Candidate;
    bestRank: number;
    bestScore: number;
    supportingHitCount: number;
    supportingBackendIds: Set<string>;
    executorIds: Set<string>;
    contributingSources: Set<Candidate['scoreSource']>;
  }

  interface AggregatedCandidate {
    outputKey: string;
    identityStatus: 'canonical' | 'projection_exact' | 'source_group' | 'degraded';
    representative: Candidate;
    fusionScore: number;
    laneEvidence: LaneEvidence[];
    contributingSources: Set<Candidate['scoreSource']>;
  }

  const laneBuckets = new Map<LogicalRetrievalLane, Candidate[]>();
  for (const candidate of valid) {
    const lane = getFusionLogicalLane(candidate);
    const bucket = laneBuckets.get(lane) ?? [];
    bucket.push(candidate);
    laneBuckets.set(lane, bucket);
  }

  const laneGroups: LaneGroup[] = [];
  for (const lane of ['dense', 'lexical', 'exact', 'ast', 'schema', 'rg', 'bm42'] as const) {
    const laneCards = [...(laneBuckets.get(lane) ?? [])].sort((a, b) => {
      const scoreDelta = b.score - a.score;
      if (Math.abs(scoreDelta) > 1e-12) return scoreDelta;
      return compareIdentityKeys(a, b);
    });

    const groups = new Map<string, LaneGroup>();
    laneCards.forEach((candidate, index) => {
      const identityStatus = candidate.identityStatus ?? 'canonical';
      const canonicalKey = identityStatus === 'canonical' ? getRevisionQualifiedFusionIdentityKey(candidate) : null;
      const backendKey = getFusionBackendIdentityKey(candidate);
      const executorId = candidate.retrievalExecutor?.trim() || candidate.scoreSource;
      const outputKey = identityStatus === 'canonical'
        ? `canonical:${canonicalKey}`
        : `degraded:${backendKey}::${lane}`;

      const existing = groups.get(outputKey);
      if (!existing) {
        groups.set(outputKey, {
          lane,
          outputKey,
          identityStatus,
          canonicalKey,
          backendKey,
          representative: candidate,
          bestRank: index + 1,
          bestScore: candidate.score,
          supportingHitCount: 1,
          supportingBackendIds: new Set([backendKey]),
          executorIds: new Set([executorId]),
          contributingSources: new Set([candidate.scoreSource]),
        });
        return;
      }

      existing.supportingHitCount += 1;
      existing.supportingBackendIds.add(backendKey);
      existing.executorIds.add(executorId);
      existing.contributingSources.add(candidate.scoreSource);
    });

    laneGroups.push(...groups.values());
  }

  const aggregates = new Map<string, AggregatedCandidate>();
  for (const group of laneGroups) {
    const contribution = 1 / (60 + group.bestRank);
    const laneEvidence: LaneEvidence = {
      lane: group.lane,
      bestRank: group.bestRank,
      bestScore: group.bestScore,
      contributionCount: 1,
      supportingHitCount: group.supportingHitCount,
      supportingBackendIds: Array.from(group.supportingBackendIds).sort(),
      executorIds: Array.from(group.executorIds).sort(),
      contributingSources: Array.from(group.contributingSources).sort(),
    };

    const outputKey = group.identityStatus === 'canonical'
      ? `canonical:${group.canonicalKey ?? getRevisionQualifiedFusionIdentityKey(group.representative)}`
      : group.outputKey;

    const existing = aggregates.get(outputKey);
    if (!existing) {
      aggregates.set(outputKey, {
        outputKey,
        identityStatus: group.identityStatus,
        representative: group.representative,
        fusionScore: contribution,
        laneEvidence: [laneEvidence],
        contributingSources: new Set(group.contributingSources),
      });
      continue;
    }

    existing.fusionScore += contribution;
    existing.contributingSources = new Set([...existing.contributingSources, ...group.contributingSources]);
    existing.laneEvidence.push(laneEvidence);
    if (compareRepresentativeCandidates(group.representative, existing.representative) < 0) {
      existing.representative = group.representative;
    }
  }

  return Array.from(aggregates.values())
    .map((aggregate) => {
      const orderedLaneEvidence = [...aggregate.laneEvidence].sort((a, b) => compareLaneOrder(a.lane, b.lane));
      const contributionSources = Array.from(aggregate.contributingSources).sort();
      return {
        ...aggregate.representative,
        fusionScore: aggregate.fusionScore,
        rankBefore: 0,
        contributingLanes: contributionSources,
        laneEvidence: orderedLaneEvidence,
        identityStatus: aggregate.identityStatus,
      };
    })
    .sort(compareFusedCandidates)
    .map((candidate, idx) => ({
      ...candidate,
      rankBefore: idx + 1,
    }));
}

/**
 * Factory for creating search runtime instances (production path — no injected adapters).
 * Backward-compatible: existing callers require no changes.
 */
export function createSearchRuntime(config?: { userId?: string; caseId?: string; readOnly?: boolean }): SearchRuntime {
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

function projectEmbedding(values: number[], dimension: number): number[] {
  if (values.length <= dimension) return values;
  const projected = values.slice(0, dimension);
  let norm = 0;
  for (let i = 0; i < projected.length; i++) {
    norm += projected[i] * projected[i];
  }
  norm = Math.sqrt(norm);
  return norm > 0 ? projected.map((value) => value / norm) : projected;
}

async function makeProjected384EmbedFn(text: string): Promise<DenseEmbedding> {
  const embedding = await makeEmbedFn(text);
  const values = projectEmbedding(embedding.values, 384);
  return {
    ...embedding,
    values,
    dimension: 384,
  };
}

/**
 * Production factory with explicitly wired DI adapters.
 * Each adapter is fail-closed: returns [] on any error, never throws.
 */
export function createProductionSearchRuntime(config?: { userId?: string; caseId?: string; readOnly?: boolean }): SearchRuntime {
  return new SearchRuntime({ ...(config ?? {}) });
}
