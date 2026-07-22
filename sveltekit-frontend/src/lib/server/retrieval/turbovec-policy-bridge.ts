/**
 * turbovec-policy-bridge.ts — Wire TurboVec evaluation metrics into policy reranker
 *
 * This bridge ensures TurboVec evaluation data flows into Lane 5 policy training:
 * 1. TurboVec reranking scores are captured as `ann_turbovec_score` feature
 * 2. Metrics are logged to Redis for live dashboarding
 * 3. Evaluation traces feed into policy training CSV
 *
 * Stage: ACE A2b (TurboVec rerank) → Feature Engineering (policy input)
 */

import { recordRetrievalMetrics } from './retrieval-metrics.js';
import type { RetrievalMetrics } from './retrieval-metrics.js';
import { RETRIEVAL_LIMITS } from './search-contract.js';

/**
 * @typedef {Object} TurboVecResult
 * @property {Array<{id: string; score: number}>} reranked - Reranked candidates
 * @property {number} latencyMs - GPU rerank latency
 * @property {number} turbovecLatencyMs - TurboVec service time
 * @property {boolean} used - Whether TurboVec was actually called
 * @property {boolean} fallback - Whether RRF fallback was used
 * @property {string} [error] - Error message if failed
 */

/**
 * Log TurboVec reranking results to retrieval metrics pipeline.
 * Called after TurboVec.Search stage in ACE context assembler.
 *
 * @param {Object} params
 * @param {string} params.query - Original user query
 * @param {number} params.qdrantLatencyMs - Qdrant ANN latency
 * @param {number} params.turbovecLatencyMs - TurboVec rerank latency
 * @param {Array<{id: string; score: number}>} params.candidates - Final top-K candidates
 * @param {string} [params.userId] - User ID for personalization
 * @param {string} [params.sessionId] - Session tracking
 * @param {boolean} [params.turbovecUsed] - Whether TurboVec was enabled
 * @param {boolean} [params.turbovecFallback] - Whether fallback to RRF was used
 * @param {string} [params.branch] - Evaluation branch (turbovec-enabled, qdrant-only, karpathy-blend)
 * @returns {Promise<void>}
 */
export async function logTurboVecMetrics(params) {
  const {
    query,
    qdrantLatencyMs = 0,
    turbovecLatencyMs = 0,
    candidates = [],
    userId,
    sessionId,
    turbovecUsed = true,
    turbovecFallback = false,
    branch = 'turbovec-enabled',
  } = params;

  const totalLatencyMs = qdrantLatencyMs + turbovecLatencyMs;
  const queryHash = computeQueryHash(query);

  const metrics = {
    query,
    queryHash,
    qdrantLatencyMs,
    turbovecLatencyMs,
    totalLatencyMs,
    qdrantCandidateCount: candidates.length,
    turbovecUsed,
    turbovecFallback,
    karphathyUsed: false,
    finalCandidateCount: candidates.length,
    finalTopK: candidates.slice(0, RETRIEVAL_LIMITS.defaultFinalResults).map((c, i) => ({
      id: c.id,
      score: c.score,
      rank: i + 1,
    })),
    userId,
    sessionId,
    timestamp: Date.now(),
    branch,
  };

  // Fire-and-forget: record to Redis + Postgres
  await recordRetrievalMetrics(metrics).catch((err) => {
    console.warn('[turbovec-policy-bridge] Failed to log metrics:', err);
  });
}

/**
 * Compute stable query hash for metrics aggregation.
 * @param {string} query
 * @returns {string}
 */
function computeQueryHash(query) {
  const crypto = require('node:crypto');
  return crypto.createHash('sha256').update(query.toLowerCase()).digest('hex').slice(0, 16);
}

/**
 * Export TurboVec evaluation data for policy training.
 * Called after Phase 1 evaluation completes (50–100 queries).
 *
 * Produces CSV row with all 16 policy features + turbovec evaluation metadata.
 *
 * @param {Object} params
 * @param {string} params.packetId - Packet/chunk ID
 * @param {number} params.cosineScore - Qdrant ANN similarity
 * @param {number} params.turbovecScore - TurboVec rerank score (NEW)
 * @param {number} params.pageRankScore - Karpathy PageRank
 * @param {number} params.somCacheHit - Redis SOM cache hit {0, 1}
 * @param {Array<string>} params.concepts - Query concepts for overlap
 * @param {string} params.featureId - Feature/domain classification
 * @param {number} params.queryHitCount - Historical query popularity
 * @param {string} params.traceId - Evaluation trace ID
 * @returns {Object} Policy feature row (16 scalars + som_cell_id)
 */
export function exportPolicyFeatureRow(params) {
  const {
    packetId,
    cosineScore = 0.5,
    turbovecScore = 0.5,
    pageRankScore = 0.3,
    somCacheHit = 0,
    concepts = [],
    featureId = 'unknown',
    queryHitCount = 0,
    traceId = '',
  } = params;

  // Placeholder: these would be computed from packet metadata in production
  const bm25RankNorm = 0.4; // From sparse search
  const conceptOverlap = Math.min(concepts.length / 5, 1.0);
  const sameFeature = featureId !== 'unknown' ? 1 : 0;
  const communityConf = 0.8; // From provenance
  const rewardPrior = Math.min(queryHitCount / 10, 1.0);
  const domainClassMatch = 1;
  const freshnessScore = 0.9; // Time decay
  const packetHitCountNorm = Math.min(queryHitCount / 100, 1.0);
  const nRetrievedNorm = 0.7; // Log-scaled
  const nConceptsNorm = Math.min(concepts.length / 20, 1.0);
  const traceScore = 0.85;
  const provenanceGitAge = 0.1; // (now - mtime) / 365

  return {
    // 16 policy scalars
    cosine_score: cosineScore,
    bm25_rank_norm: bm25RankNorm,
    ann_turbovec_score: turbovecScore, // NEW: from TurboVec rerank
    concept_overlap: conceptOverlap,
    same_feature: sameFeature,
    community_conf: communityConf,
    reward_prior: rewardPrior,
    domain_class_match: domainClassMatch,
    freshness_score: freshnessScore,
    pagerank_score: pageRankScore,
    som_cache_hit: somCacheHit,
    packet_hit_count_norm: packetHitCountNorm,
    n_retrieved_norm: nRetrievedNorm,
    n_concepts_norm: nConceptsNorm,
    trace_score: traceScore,
    provenance_git_age: provenanceGitAge,

    // Metadata
    som_cell_id: 142, // Placeholder: would be looked up from packet
    packet_id: packetId,
    trace_id: traceId,
    label: 1, // Positive: shown to user, assume relevant
  };
}

/**
 * Compute feature importance weights for policy feedback.
 * Used in Lane 13 GRPO reward shaping.
 *
 * @returns {Object} Importance weights for each feature
 */
export function getPolicyFeatureImportance() {
  return {
    cosine_score: 0.15,
    bm25_rank_norm: 0.05,
    ann_turbovec_score: 0.10, // TurboVec contribution
    concept_overlap: 0.08,
    same_feature: 0.12,
    community_conf: 0.05,
    reward_prior: 0.08,
    domain_class_match: 0.05,
    freshness_score: 0.07,
    pagerank_score: 0.10,
    som_cache_hit: 0.03,
    packet_hit_count_norm: 0.04,
    n_retrieved_norm: 0.02,
    n_concepts_norm: 0.02,
    trace_score: 0.05,
    provenance_git_age: 0.02,
  };
}
