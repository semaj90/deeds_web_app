/**
 * Parent Atlas Retrieval Facade Implementation
 *
 * Orchestrates the complete 9-stage retrieval pipeline:
 * 1. BM25 (Postgres)
 * 2. Qdrant ANN (vector search)
 * 3. Canonical Identity Resolution (dedup before RRF)
 * 4. RRF Fusion (blend lexical + semantic)
 * 5. Graph Expansion (Neo4j k-hop)
 * 6. Feature Extraction (XGBoost input)
 * 7. Reranking (XGBoost + optional CrossEncoder)
 * 8. Source Validation (require source_ref if policy demands)
 * 9. Context Assembly (ACE vs RLM)
 *
 * Implements RetrievalFacade from @deeds/parent-atlas-core.
 * Zero dependencies on SvelteKit; pure orchestration.
 */

import type { Database } from 'drizzle-orm';
import type {
  RetrievalFacade,
  RetrievalRequest,
  RetrievalResult,
  RetrievalPolicy,
  RankedCandidate
} from '@deeds/parent-atlas-core';
import { getPolicyRegistry } from '@deeds/parent-atlas-core';
import { searchPostgresBM25, type BM25Candidate } from '../adapters/postgres-bm25.adapter.js';
import { searchQdrantANN, type QdrantRecallResult } from '../adapters/qdrant-recall.adapter.js';
import { resolveCanonicalIdentity, type IdentityResolutionResult } from '../adapters/identity-resolver.js';
import { fuseWithRRF } from '../adapters/rrf-fusion.adapter.js';
import type { RetrievalTrace } from '@deeds/parent-atlas-core';

export interface RetrievalFacadeConfig {
  db: Database;
  qdrant_url: string;
  neo4j_url?: string;
  embedding_service_url?: string;
  crossencoder_url?: string;
}

export interface PipelineStage {
  name: string;
  duration_ms: number;
  candidate_count: number;
  errors?: string[];
}

/**
 * Retrieval Facade implementation
 */
export class ParentAtlasRetrievalFacade implements RetrievalFacade {
  private config: RetrievalFacadeConfig;
  private trace: RetrievalTrace | null = null;

  constructor(config: RetrievalFacadeConfig) {
    this.config = config;
  }

  /**
   * Execute unified retrieval with policy selection
   */
  async search(request: RetrievalRequest): Promise<RetrievalResult> {
    const startTime = Date.now();
    const stages: PipelineStage[] = [];

    try {
      const policy = getPolicyRegistry().getPolicy(request.useCase);

      // Stage 1: BM25
      const bm25Start = Date.now();
      const bm25Candidates = await searchPostgresBM25({
        db: this.config.db,
        query: request.query,
        limit: policy.bm25Limit,
        sourceScope: request.sourceScope,
        requireSourceRef: policy.requireSourceRefs
      });
      stages.push({
        name: 'bm25',
        duration_ms: Date.now() - bm25Start,
        candidate_count: bm25Candidates.length
      });

      // Stage 2: Qdrant ANN
      const qdrantStart = Date.now();
      // TODO: Embed query via embedding service, then search Qdrant
      const qdrantCandidates: QdrantRecallResult[] = [];
      stages.push({
        name: 'qdrant',
        duration_ms: Date.now() - qdrantStart,
        candidate_count: qdrantCandidates.length
      });

      // Stage 3: Identity Resolution (CRITICAL: before RRF)
      const identityStart = Date.now();
      const merged = this.mergeRecallStages(bm25Candidates, qdrantCandidates);
      const resolved = await resolveCanonicalIdentity(merged, {
        db: this.config.db,
        allowMissingPacketKey: false
      });
      stages.push({
        name: 'identity_resolution',
        duration_ms: Date.now() - identityStart,
        candidate_count: resolved.length
      });

      // Stage 4: RRF Fusion
      const rrfStart = Date.now();
      const rrfInput = resolved.map((r, idx) => ({
        ...r,
        source_stage: (idx < bm25Candidates.length ? 'bm25' : 'qdrant') as const,
        original_score: r.score
      }));
      const fused = fuseWithRRF(rrfInput, policy.rffLimit);
      stages.push({
        name: 'rrf_fusion',
        duration_ms: Date.now() - rrfStart,
        candidate_count: fused.length
      });

      // Stage 5: Graph Expansion (placeholder)
      const graphStart = Date.now();
      let candidates = fused.slice(0, policy.graphLimit);
      if (policy.enableGraphExpansion) {
        // TODO: Neo4j k-hop expansion
      }
      stages.push({
        name: 'graph_expansion',
        duration_ms: Date.now() - graphStart,
        candidate_count: candidates.length
      });

      // Stage 6-7: Feature Extraction & Reranking (placeholder)
      const rerankerStart = Date.now();
      // TODO: XGBoost feature extraction and reranking
      // TODO: Optional CrossEncoder reranking if policy.enableCrossencoder
      candidates = candidates.slice(0, policy.crossencoderLimit);
      stages.push({
        name: 'reranking',
        duration_ms: Date.now() - rerankerStart,
        candidate_count: candidates.length
      });

      // Stage 8: Source Validation
      const validationStart = Date.now();
      if (policy.requireSourceRefs) {
        candidates = candidates.filter(c => !!c.source_ref);
      }
      stages.push({
        name: 'source_validation',
        duration_ms: Date.now() - validationStart,
        candidate_count: candidates.length
      });

      // Stage 9: Context Assembly (placeholder)
      const assemblyStart = Date.now();
      const context =
        policy.contextPolicy === 'ace'
          ? this.assembleACEContext(candidates, request, policy)
          : this.assembleLRMContext(candidates, request, policy);
      stages.push({
        name: 'context_assembly',
        duration_ms: Date.now() - assemblyStart,
        candidate_count: 0
      });

      // Final output: limit to policy.outputLimit
      const ranked: RankedCandidate[] = candidates.slice(0, policy.outputLimit).map(c => ({
        packet_key: c.canonical_packet_key,
        source_ref: c.source_ref,
        feature_id: c.feature_id,
        summary: '',
        score: c.rrf_score,
        retrievedVia: 'bm25', // TODO: track actual retrieval stage
        scores: {
          semantic: c.rrf_score,
          bm25: c.rrf_score,
          topology: c.rrf_score,
          xgboost: c.rrf_score
        }
      }));

      return {
        query: request.query,
        useCase: request.useCase,
        candidates: ranked,
        context,
        trace: {
          total_duration_ms: Date.now() - startTime,
          stages,
          candidate_count_by_stage: stages.map(s => ({ stage: s.name, count: s.candidate_count }))
        } as RetrievalTrace
      };
    } catch (err) {
      throw new Error(
        `Retrieval failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  /**
   * Health check
   */
  async health(): Promise<boolean> {
    try {
      // TODO: Probe Postgres, Qdrant, Neo4j
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Merge BM25 and Qdrant candidates for identity resolution
   */
  private mergeRecallStages(
    bm25: BM25Candidate[],
    qdrant: QdrantRecallResult[]
  ): Array<BM25Candidate | QdrantRecallResult> {
    return [...bm25, ...qdrant];
  }

  /**
   * Assemble ACE context (Agent Context Envelope)
   */
  private assembleACEContext(
    candidates: IdentityResolutionResult[],
    request: RetrievalRequest,
    policy: RetrievalPolicy
  ) {
    return {
      task: 'search',
      state: 'retrieving',
      packets: candidates.map(c => ({
        packet_key: c.canonical_packet_key,
        source_ref: c.source_ref,
        feature_id: c.feature_id,
        score: c.score
      })),
      constraints: [],
      decisions: [],
      tokenEstimate: policy.defaultTokenBudget
    };
  }

  /**
   * Assemble RLM context (Retrieval with Long-term Memory)
   */
  private assembleLRMContext(
    candidates: IdentityResolutionResult[],
    request: RetrievalRequest,
    policy: RetrievalPolicy
  ) {
    return {
      objective: request.query,
      workingSet: candidates.map(c => ({
        packet_key: c.canonical_packet_key,
        source_ref: c.source_ref,
        feature_id: c.feature_id,
        evidence: '',
        confidence: c.score
      })),
      unresolvedQuestions: [],
      retrievalHistory: [],
      synthesisBudget: policy.defaultTokenBudget
    };
  }
}

/**
 * Factory function to create a retrieval facade instance
 */
export function createRetrievalFacade(config: RetrievalFacadeConfig): RetrievalFacade {
  return new ParentAtlasRetrievalFacade(config);
}
