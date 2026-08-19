/**
 * Atlas ranking layer — factory entry point.
 *
 * Provides createAtlasReranker() which wraps the canonical retrieval-layer
 * rerankers behind the packages/atlas/contracts Reranker interface.
 *
 * Callers in src/lib/server/atlas/** import from here; never import
 * canonical-rerank-executor or runtime-reranker directly from atlas adapters.
 */

export type { RerankCandidate, RerankRequest, RerankResult, RerankResultItem, Reranker } from './reranker.js';
export type {
  AgenticRepairLibrary,
  AgenticRepairLibraryFetchParametersV1,
  AgenticRepairLibraryLookupRequestV1,
  AgenticRepairLibraryLookupObservationV1,
  AgenticRepairLibraryLookup,
  AgenticRepairGatePolicyV1,
  AgenticRepairReadinessInputV1,
  RankedAgenticRepairLibraryV1,
  AgenticRepairGroupMeanV1,
  AgenticRepairProposedActionV1,
  AgenticRepairReadinessResultV1,
} from './agentic-repair-readiness-ranker.js';
export {
  AgenticRepairLibrarySchema,
  AlignmentCountV1Schema,
  AgenticRepairLibraryFetchParametersV1Schema,
  AgenticRepairLibraryLookupRequestV1Schema,
  AgenticRepairLibraryLookupObservationV1Schema,
  AgenticRepairGatePolicyV1Schema,
  AgenticRepairReadinessInputV1Schema,
  ReadinessMetricNameSchema,
  ReadinessMetricV1Schema,
  RankedAgenticRepairLibraryV1Schema,
  AgenticRepairGroupMeanV1Schema,
  AgenticRepairActionKindSchema,
  AgenticRepairProposedActionV1Schema,
  AgenticRepairReadinessResultV1Schema,
  rankAgenticRepairReadiness,
  agenticRepairInference,
} from './agentic-repair-readiness-ranker.js';
export {
  GraphSearchAlgorithmSchema,
  SearchIntentSchema,
  SearchLogicalLaneSchema,
  AdaptiveSearchBudgetV1Schema,
  MatrixDiagnosticsV1Schema,
  AdaptiveSearchInputV1Schema,
  SearchAlgorithmRecommendationV1Schema,
  CuvsGraphBuildAlgorithmSchema,
  CuvsSearchAlgorithmSchema,
  CuvsDatasetMemoryTypeSchema,
  CuvsGraphMemoryTypeSchema,
  CuvsCagraBuildPlanV1Schema,
  CuvsCagraSearchPlanV1Schema,
  CuvsBenchAnalysisPlanV1Schema,
  TangPromotionPolicyV1Schema,
  TangPromotionRowV1Schema,
  TangPromotionRecommendationV1Schema,
  SEARCH_POLICY_FEATURE_NAMES,
  SEARCH_POLICY_FEATURE_COUNT,
  SearchPolicyCandidateFeaturesV1Schema,
  CuvsBenchmarkPointV1Schema,
  CuvsParetoAnalysisV1Schema,
  AdaptiveSearchPlanV1Schema,
  inferSearchIntents,
  buildAdaptiveSearchPlan,
  analyzeCuvsParetoFrontier,
  buildTangPromotionRecommendation,
  buildSearchPolicyFeatureMatrix,
  readinessPercentFromRecommendation,
} from './adaptive-search-policy.js';
export type {
  GraphSearchAlgorithm,
  SearchIntent,
  SearchLogicalLane,
  AdaptiveSearchBudgetV1,
  MatrixDiagnosticsV1,
  AdaptiveSearchInputV1,
  SearchAlgorithmRecommendationV1,
  CuvsCagraBuildPlanV1,
  CuvsCagraSearchPlanV1,
  CuvsBenchAnalysisPlanV1,
  TangPromotionPolicyV1,
  TangPromotionRowV1,
  TangPromotionRecommendationV1,
  SearchPolicyFeatureName,
  SearchPolicyCandidateFeaturesV1,
  SearchPolicyFeatureMatrixV1,
  CuvsBenchmarkPointV1,
  CuvsParetoAnalysisV1,
  AdaptiveSearchPlanV1,
} from './adaptive-search-policy.js';
export {
  ContextWindowCandidateV1Schema,
  ContextWindowBudgetV1Schema,
  ContextWindowInputV1Schema,
  ContextWindowMemberV1Schema,
  ContextWindowV1Schema,
  ContextCacheProposalV1Schema,
  ContextWindowPlanV1Schema,
  buildTokenAwareContextPlan,
} from './context-window-synthesis.js';
export type {
  ContextWindowCandidateV1,
  ContextWindowBudgetV1,
  ContextWindowInputV1,
  ContextWindowMemberV1,
  ContextWindowV1,
  ContextCacheProposalV1,
  ContextWindowPlanV1,
} from './context-window-synthesis.js';
export {
  SemanticPromotionScorePolicySchema,
  SemanticPromotionDeltaV1Schema,
  SemanticPromotionExclusionV1Schema,
  SemanticPromotionReceiptV1Schema,
  RepairContextManifestV2Schema,
  buildSemanticPromotionReceipt,
  applySemanticPromotionReceipt,
  rebuildRepairAfterSemanticPromotion,
} from './semantic-promotion-feedback.js';
export type {
  SemanticPromotionScorePolicy,
  SemanticPromotionDeltaV1,
  SemanticPromotionExclusionV1,
  SemanticPromotionReceiptV1,
  RepairContextManifestV2,
  SemanticPromotionFeedbackResultV1,
} from './semantic-promotion-feedback.js';

import type { Reranker, RerankRequest, RerankResult, RerankResultItem } from './reranker.js';
import { randomUUID } from 'node:crypto';

/**
 * Creates an Atlas-interface-compatible reranker backed by the canonical
 * MixedbreadCanonicalReranker + DeterministicReranker fallback.
 *
 * All errors are caught; on failure returns candidates in original score order
 * with fallbackReason set.
 */
export function createAtlasReranker(): Reranker {
  const MODEL_VERSION = 'atlas-canonical-v1';

  return {
    modelVersion: MODEL_VERSION,

    async rerank(req: RerankRequest): Promise<RerankResult> {
      const start = Date.now();

      try {
        const { MixedbreadCanonicalReranker } =
          await import('$lib/server/retrieval/canonical-rerank-executor.js');

        const inner = new MixedbreadCanonicalReranker();

        // Adapt atlas RerankCandidate → retrieval RerankCandidate (field-name mapping)
        const adapted = req.candidates.map((c, i) => ({
          packetKey: c.packetKey,
          sourceRef: c.sourceRef,
          content: c.content ?? c.summary ?? '',
          retrievedRank: i + 1,
          denseScore: Math.min(1, Math.max(0, c.score)),
        }));

        const ctx = {
          requestId: randomUUID(),
          query: req.query,
          candidates: adapted,
          limit: req.topK ?? adapted.length,
          profile: 'crossencoder' as const,
        };

        const output = await inner.rerank(ctx);

        const ranked: RerankResultItem[] = output.ranked.map((r, i) => ({
          packetKey: r.packetKey,
          sourceRef: r.sourceRef,
          rerankScore: r.blendedScore,
          originalScore: r.denseScore ?? 0,
          rank: i + 1,
          modelVersion: output.provenance.modelVersion,
        }));

        return {
          ranked,
          modelVersion: output.provenance.modelVersion,
          fallbackReason: output.provenance.fallbackReason,
          durationMs: Date.now() - start,
        };
      } catch (err) {
        // Deterministic fallback — preserve original score order
        const ranked: RerankResultItem[] = req.candidates
          .slice()
          .sort((a, b) => b.score - a.score)
          .map((c, i) => ({
            packetKey: c.packetKey,
            sourceRef: c.sourceRef,
            rerankScore: c.score,
            originalScore: c.score,
            rank: i + 1,
            modelVersion: 'deterministic-fallback',
          }));

        return {
          ranked,
          modelVersion: 'deterministic-fallback',
          fallbackReason: err instanceof Error ? err.message : String(err),
          durationMs: Date.now() - start,
        };
      }
    },
  };
}

/**
 * Disabled reranker — always returns candidates in original score order.
 * Useful for test injection or when no reranker service is available.
 */
export function createDisabledAtlasReranker(reason: string): Reranker {
  const MODEL_VERSION = 'disabled';
  return {
    modelVersion: MODEL_VERSION,
    async rerank(req: RerankRequest): Promise<RerankResult> {
      const start = Date.now();
      const ranked: RerankResultItem[] = req.candidates
        .slice()
        .sort((a, b) => b.score - a.score)
        .map((c, i) => ({
          packetKey: c.packetKey,
          sourceRef: c.sourceRef,
          rerankScore: c.score,
          originalScore: c.score,
          rank: i + 1,
          modelVersion: MODEL_VERSION,
        }));
      return {
        ranked,
        modelVersion: MODEL_VERSION,
        fallbackReason: reason,
        durationMs: Date.now() - start,
      };
    },
  };
}
