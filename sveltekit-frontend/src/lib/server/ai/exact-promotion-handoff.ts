/**
 * Recommendation -> exact-promotion handoff.
 *
 * TODO(INTEGRATION): bind this to the canonical ExactPromotionV1 implementation
 * from the agentic-file-compiler tranche after branch reconciliation. Do NOT
 * duplicate source identity resolution here.
 */

export interface ExactPromotionCandidateRefV1 {
  candidateOrdinal: number;
  canonicalId: string;
  packetKey?: string | null;
  sourceRef?: string | null;
  semanticScore: number;
  recommendationScore: number;
}

export interface ExactPromotionHandoffV1 {
  schema: 'atlas.exact-promotion-handoff.v1';
  requestId: string;
  workspaceRevision: string;
  graphRevision?: string | null;
  representationRevision: string;
  recommendationReceiptId: string;
  candidates: ExactPromotionCandidateRefV1[];
  required: boolean;
  status: 'PENDING_EXACT_PROMOTION';
}

export function buildExactPromotionHandoff(input: Omit<ExactPromotionHandoffV1, 'schema' | 'status'>): ExactPromotionHandoffV1 {
  const candidates = [...input.candidates]
    .sort((a, b) => b.recommendationScore - a.recommendationScore || a.candidateOrdinal - b.candidateOrdinal);
  if (input.required && candidates.length === 0) {
    throw new Error('exact promotion is required but no candidates were supplied');
  }
  return {
    schema: 'atlas.exact-promotion-handoff.v1',
    ...input,
    candidates,
    status: 'PENDING_EXACT_PROMOTION',
  };
}

// TODO(TEST-LATER): prove the consumer rejects stale workspace/source revisions.
// TODO(TEST-LATER): prove qdrant point ids cannot substitute for canonicalId.
// TODO(TEST-LATER): require exact source checksums before mutation authorization.
