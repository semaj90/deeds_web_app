/**
 * Three distinct candidate relevance score types — never conflated into one number.
 *
 * Per `openspec/changes/parent-atlas-retrieval-staging-planes/specs/candidate-relevance-score-types/spec.md`
 * and design.md section 13:
 *
 * - `SemanticSimilarityScoreV1`: EmbeddingGemma bi-encoder cosine similarity. Cheapest — candidate
 *   vectors are precomputed. Query and document tokens never directly attend to each other.
 * - `TextRelevanceScoreV1`: a joint-pair cross-encoder's log-odds relevance (e.g. mxbai-rerank-
 *   base-v2's `z1 - z0`, the final-position "relevant" vs "not relevant" token logits after a
 *   single joint forward pass). Expensive — only invoke via `shouldEscalateToTextRelevance()`'s gate.
 * - `EngineeringUtilityScoreV1`: a Parent Atlas-specific learned score over evidence a text-only
 *   cross-encoder cannot see at all — graph/PageRank, test coverage, AST/symbol hits, prior
 *   workflow success, revision match. Not a text-relevance substitute; measures a different thing.
 *
 * These three SHALL NOT be averaged into one opaque scalar — downstream consumers read all three.
 */

import { z } from 'zod';

const modelRevision = z.string().min(1);

export const SemanticSimilarityScoreV1Schema = z.object({
  schema: z.literal('atlas.semantic-similarity-score.v1').default('atlas.semantic-similarity-score.v1'),
  canonicalId: z.string().min(1),
  cosineSimilarity: z.number().finite().min(-1).max(1),
  embeddingModelRevision: modelRevision,
}).strict();

export type SemanticSimilarityScoreV1 = z.infer<typeof SemanticSimilarityScoreV1Schema>;

export const TextRelevanceScoreV1Schema = z.object({
  schema: z.literal('atlas.text-relevance-score.v1').default('atlas.text-relevance-score.v1'),
  canonicalId: z.string().min(1),
  /** z1 - z0 (relevant-token logit minus not-relevant-token logit). Not bounded [-1,1] — a raw logit delta. */
  logitDelta: z.number().finite(),
  /** sigmoid(logitDelta) — a probability-like value derived from logitDelta, present for convenience only. */
  probability: z.number().finite().min(0).max(1),
  crossEncoderModelRevision: modelRevision,
}).strict();

export type TextRelevanceScoreV1 = z.infer<typeof TextRelevanceScoreV1Schema>;

export const EngineeringUtilityScoreV1Schema = z.object({
  schema: z.literal('atlas.engineering-utility-score.v1').default('atlas.engineering-utility-score.v1'),
  canonicalId: z.string().min(1),
  utilityScore: z.number().finite().min(0).max(1),
  /** Which learned-model family produced this score — never silently swapped without recording it. */
  modelFamily: z.enum(['LOGISTIC_REGRESSION', 'RANDOM_FOREST', 'XGBOOST', 'PYTORCH_MLP']),
  modelRevision,
  /** Names of the evidence features that contributed, for later inspection — not the raw feature vector. */
  contributingFeatures: z.array(z.string()).default([]),
}).strict();

export type EngineeringUtilityScoreV1 = z.infer<typeof EngineeringUtilityScoreV1Schema>;

/**
 * ACE-aligned cost-tiered admission gate (design.md section 13): only escalate to the expensive
 * TextRelevanceScoreV1 (cross-encoder) when the cheap scores leave an ambiguous margin among the
 * top candidates. `cheapScores` must already be sorted descending.
 */
// Chosen to sit strictly between design.md section 13's two worked examples: a 0.05 gap
// (.96 vs .91) must NOT escalate, a 0.01 gap (.72 vs .71) must escalate.
export const TEXT_RELEVANCE_ESCALATION_MARGIN = 0.03;

export function shouldEscalateToTextRelevance(cheapScoresDescending: readonly number[]): boolean {
  if (cheapScoresDescending.length < 2) return false;
  const [top, second] = cheapScoresDescending;
  return Math.abs(top - second) < TEXT_RELEVANCE_ESCALATION_MARGIN;
}
