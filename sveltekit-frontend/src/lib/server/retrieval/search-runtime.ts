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
import { hydrateCandidates as hydrateFromPostgres } from './hydrate-candidates.js';
import { getQdrantManager } from '$lib/server/vector/qdrant-manager.js';

// Startup assertion: verify Qdrant collection is canonical 384-dimensional
async function validateQdrantDimensions(): Promise<void> {
  try {
    const qdrant = getQdrantManager();
    if (typeof (qdrant as any)?.getCollection !== 'function') {
      console.warn('Qdrant dimension validation skipped: getCollection() is not available on this client surface.');
      return;
    }
    const collectionInfo = await qdrant.getCollection('codebase_chunks_384');

    // Check vector dimension
    const vectorSize = (collectionInfo as any)?.config?.params?.vectors?.size;
    if (vectorSize && vectorSize !== 384) {
      throw new Error(
        `Qdrant collection 'codebase_chunks_384' has ${vectorSize} dimensions, expected 384. ` +
        `Retrieval will fail. Rebuild collection from canonical 384-dim Postgres embeddings.`
      );
    }
  } catch (error) {
    if ((error as Error).message.includes('404') || (error as Error).message.includes('not found')) {
      console.warn(
        'Qdrant collection codebase_chunks_384 not found. Will attempt fallback to codebase_chunks_768.'
      );
    } else {
      throw error;
    }
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
  filters: z.record(z.unknown()).optional(),
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
  scoreSource: 'postgres_trigram' | 'qdrant' | 'exact_symbol' | 'ast_tree' | 'schema' | 'rg_keyword';
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
    candidatesReranked: number;
    durationMs: number;
    stages: {
      retrieve: number;
      fuse: number;
      hydrate: number;
      rerank: number;
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
 * Single entry point for all retrieval operations
 */
export class SearchRuntime {
  private userId?: string;
  private caseId?: string;

  constructor(config: { userId?: string; caseId?: string }) {
    this.userId = config.userId;
    this.caseId = config.caseId;
  }

  /**
   * Unified search entrypoint
   * Orchestrates: query → retrieve → fuse → rerank → render → return
   */
  async search(queryInput: SearchQuery): Promise<SearchResult> {
    const startTime = Date.now();
    const stageTiming = { retrieve: 0, fuse: 0, hydrate: 0, rerank: 0 };

    try {
      // Validate query
      const query = SearchQuerySchema.parse(queryInput);

      // Stage 1: Retrieve candidates from multiple sources
      const retrieveStart = Date.now();
      const candidates = await this.retrieveCandidates(query);
      stageTiming.retrieve = Date.now() - retrieveStart;

      if (candidates.length === 0) {
        return {
          packets: [],
          metadata: {
            query: query.text,
            candidatesRetrieved: 0,
            candidatesFused: 0,
            candidatesReranked: 0,
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

      // Stage 3: Hydrate candidates into feature envelopes
      const hydrateStart = Date.now();
      const envelopes = await this.hydrateCandidates(fused.slice(0, query.topK));
      stageTiming.hydrate = Date.now() - hydrateStart;

      // Stage 4: Rerank with the canonical executor
      const rerankStart = Date.now();
      const reranked = await this.rerankCandidates(envelopes, query);
      stageTiming.rerank = Date.now() - rerankStart;

      // Stage 5: Finalize and return
      // Domain classification and title generation happen in enrichment/promotion service, not here
      const finalPackets = reranked.slice(0, query.topK);

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

      return {
        packets: finalPackets,
        metadata: {
          query: query.text,
          candidatesRetrieved: candidates.length,
          candidatesFused: fused.length,
          candidatesReranked: reranked.length,
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
   * Stage 1: Retrieve candidates deterministically from multiple sources
   * Sources (in parallel): PostgreSQL lexical fallback, Qdrant ANN, exact symbol matches, AST matches
   * Returns top-K candidates before fusion
   */
  private async retrieveCandidates(query: SearchQuery): Promise<Candidate[]> {
    return retrieveAllCandidates(query.text);
  }

  /**
   * Stage 2: Fuse candidates with RRF (Reciprocal Rank Fusion)
   * Only one fusion implementation. No other score combiners exist.
   */
  private async fuseCandidates(candidates: Candidate[]): Promise<FusedCandidate[]> {
    // Group by source and get ranking within each
    const sourceRanks = new Map<string, Map<string, number>>();

    const sources = ['postgres_trigram', 'qdrant', 'exact_symbol', 'ast_tree', 'schema'] as const;
    for (const source of sources) {
      const sourceCards = candidates.filter(c => c.scoreSource === source);
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
    for (const [packetKey, candidate] of new Map(candidates.map(c => [c.packetKey, c]))) {
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
    const sorted = Array.from(candidates).sort((a, b) => {
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
  private getRetrievalSources(candidates: Candidate[]): Array<'postgres_trigram' | 'qdrant' | 'exact_symbol' | 'ast_tree'> {
    const sources = new Set<'postgres_trigram' | 'qdrant' | 'exact_symbol' | 'ast_tree'>();
    for (const c of candidates) {
      if (c.scoreSource !== 'schema') {
        sources.add(c.scoreSource as 'postgres_trigram' | 'qdrant' | 'exact_symbol' | 'ast_tree');
      }
    }
    return Array.from(sources);
  }
}

/**
 * Factory for creating search runtime instances
 */
export function createSearchRuntime(config?: { userId?: string; caseId?: string }): SearchRuntime {
  return new SearchRuntime(config ?? {});
}
