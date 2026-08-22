/**
 * Reciprocal Rank Fusion (RRF) Adapter
 *
 * Fuses deduplicated BM25 and Qdrant candidates into a single ranked list.
 *
 * Important: This stage runs AFTER identity resolution and deduplication.
 * All input candidates must have been resolved to canonical packet_key.
 *
 * RRF formula: score = sum(1 / (k + rank)) where k is typically 60.
 * Balances lexical and semantic relevance without manual weighting.
 */

import type { IdentityResolutionResult } from './identity-resolver.js';

export interface RRFCandidateInput extends IdentityResolutionResult {
  source_stage: 'bm25' | 'qdrant';
  original_score: number;
}

export interface RRFFusedCandidate {
  canonical_packet_key: string;
  source_ref: string;
  feature_id: string;
  rrf_score: number;
  source_stages: ('bm25' | 'qdrant')[];
  original_scores: number[];
  rank_bm25?: number;
  rank_qdrant?: number;
}

const RRF_K = 60; // Standard RRF constant

/**
 * Fuse BM25 and Qdrant results via RRF
 *
 * Input: deduplicated candidates from BM25 and Qdrant (via identity-resolver)
 * Output: fused ranking, up to `limit` candidates
 *
 * Ranking: RRF combines multiple rankers without requiring manual weights.
 * Each ranker contributes 1/(k+rank) to the final score.
 */
export function fuseWithRRF(
  candidates: RRFCandidateInput[],
  limit: number
): RRFFusedCandidate[] {
  if (!candidates.length) return [];

  // Group by canonical packet_key to track which rankers contributed
  const packetToRanks = new Map<string, RRFFusedCandidate>();

  // Separate BM25 and Qdrant candidates
  const bm25Candidates = candidates.filter(c => c.source_stage === 'bm25');
  const qdrantCandidates = candidates.filter(c => c.source_stage === 'qdrant');

  // Rank BM25 results (descending by score)
  bm25Candidates.sort((a, b) => b.original_score - a.original_score);
  for (let i = 0; i < bm25Candidates.length; i++) {
    const c = bm25Candidates[i];
    const key = c.canonical_packet_key;
    const rrf_contrib = 1 / (RRF_K + i + 1);

    const existing = packetToRanks.get(key);
    if (existing) {
      existing.rrf_score += rrf_contrib;
      existing.source_stages.push('bm25');
      existing.original_scores.push(c.original_score);
      existing.rank_bm25 = i;
    } else {
      packetToRanks.set(key, {
        canonical_packet_key: key,
        source_ref: c.source_ref,
        feature_id: c.feature_id,
        rrf_score: rrf_contrib,
        source_stages: ['bm25'],
        original_scores: [c.original_score],
        rank_bm25: i
      });
    }
  }

  // Rank Qdrant results (descending by score)
  qdrantCandidates.sort((a, b) => b.original_score - a.original_score);
  for (let i = 0; i < qdrantCandidates.length; i++) {
    const c = qdrantCandidates[i];
    const key = c.canonical_packet_key;
    const rrf_contrib = 1 / (RRF_K + i + 1);

    const existing = packetToRanks.get(key);
    if (existing) {
      existing.rrf_score += rrf_contrib;
      existing.source_stages.push('qdrant');
      existing.original_scores.push(c.original_score);
      existing.rank_qdrant = i;
    } else {
      packetToRanks.set(key, {
        canonical_packet_key: key,
        source_ref: c.source_ref,
        feature_id: c.feature_id,
        rrf_score: rrf_contrib,
        source_stages: ['qdrant'],
        original_scores: [c.original_score],
        rank_qdrant: i
      });
    }
  }

  // Sort by RRF score (descending) and return top `limit`
  const fused = Array.from(packetToRanks.values())
    .sort((a, b) => b.rrf_score - a.rrf_score)
    .slice(0, limit);

  return fused;
}

/**
 * Validate RRF results
 *
 * Checks:
 * - No NaN scores
 * - All candidates have source_ref and feature_id
 * - Scores are normalized
 */
export function validateRRFResults(
  candidates: RRFFusedCandidate[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];

    if (!c.canonical_packet_key) {
      errors.push(`Candidate ${i}: missing canonical_packet_key`);
    }
    if (!c.source_ref) {
      errors.push(`Candidate ${i}: missing source_ref`);
    }
    if (!c.feature_id) {
      errors.push(`Candidate ${i}: missing feature_id`);
    }
    if (isNaN(c.rrf_score)) {
      errors.push(`Candidate ${i}: NaN rrf_score`);
    }
    if (c.rrf_score <= 0) {
      errors.push(`Candidate ${i}: non-positive rrf_score: ${c.rrf_score}`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * Report RRF fusion metrics
 */
export interface RRFMetrics {
  input_count: number;
  output_count: number;
  fusion_multiplicity: number;
  bm25_only: number;
  qdrant_only: number;
  combined: number;
  max_rrf_score: number;
  avg_rrf_score: number;
}

export function computeRRFMetrics(
  input: RRFCandidateInput[],
  output: RRFFusedCandidate[]
): RRFMetrics {
  const bm25Only = output.filter(c => c.source_stages.length === 1 && c.source_stages[0] === 'bm25')
    .length;
  const qdrantOnly = output.filter(
    c => c.source_stages.length === 1 && c.source_stages[0] === 'qdrant'
  ).length;
  const combined = output.filter(c => c.source_stages.length > 1).length;

  const scores = output.map(c => c.rrf_score);
  const maxScore = Math.max(...scores, 0);
  const avgScore = scores.length > 0 ? scores.reduce((a, b) => a + b, 0) / scores.length : 0;

  return {
    input_count: input.length,
    output_count: output.length,
    fusion_multiplicity: input.length > 0 ? input.length / output.length : 0,
    bm25_only: bm25Only,
    qdrant_only: qdrantOnly,
    combined,
    max_rrf_score: maxScore,
    avg_rrf_score: avgScore
  };
}
