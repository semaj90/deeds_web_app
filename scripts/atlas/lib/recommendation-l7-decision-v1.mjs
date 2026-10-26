/**
 * L7 decision for the agentic recommendation workflow (pure, no I/O).
 *
 * Extracted unchanged from scripts/atlas/agentic-recommendation-workflow.mjs. Check order is part of
 * the contract: an unknown identity or a high-risk synthesis always asks a human, before any score is
 * considered; a prior fix merges before a high score can patch.
 *
 * Returns one of: 'ask_permission' | 'merge_card' | 'patch_existing' | 'create_card'.
 */
export const RECOMMENDATION_L7_DECISION_REVISION_V1 = 'atlas.recommendation-l7-decision.v1';

export const L7_PATCH_THRESHOLD = 0.65;
export const L7_PERMISSION_FLOOR = 0.4;

export function decideRecommendationActionV1({ identity, rerankResult, gemma4, memory }) {
  if (!identity.packet_key) return 'ask_permission';
  if (gemma4.risk === 'high') return 'ask_permission';
  if (rerankResult.top_score < L7_PERMISSION_FLOOR) return 'ask_permission';
  if (memory.prior_fix) return 'merge_card';
  if (rerankResult.top_score >= L7_PATCH_THRESHOLD) return 'patch_existing';
  return 'create_card';
}
