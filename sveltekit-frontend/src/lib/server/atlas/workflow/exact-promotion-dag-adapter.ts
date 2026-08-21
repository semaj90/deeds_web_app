import type { ExactPromotionHandoffV1 } from '../../ai/exact-promotion-handoff.js';
import {
  ContextToolDagNodeV1Schema,
  type ContextToolDagNodeV1,
} from './context-tool-dag-contracts.js';

export interface ExactPromotionDagInputV1 {
  schema: 'atlas.exact-promotion-dag-input.v1';
  handoffChecksum: string;
  requestId: string;
  workspaceRevision: string;
  graphRevision: string | null;
  representationRevision: string;
  recommendationReceiptId: string;
  canonicalIds: string[];
  evidenceRefs: string[];
  node: ContextToolDagNodeV1;
}

/**
 * Convert a ranked/revision-qualified handoff into the existing ContextToolDag
 * EXACT_PROMOTION node. This is scheduling input only; it is deliberately not a
 * promotion receipt and cannot satisfy AgenticFileMutationPlanV1 by itself.
 */
export function exactPromotionHandoffToDagInput(input: {
  handoff: ExactPromotionHandoffV1;
  nodeId?: string;
  dependsOn: readonly string[];
  maxAttempts?: number;
}): ExactPromotionDagInputV1 {
  const { handoff } = input;
  if (handoff.status !== 'READY_FOR_EXACT_PROMOTION') {
    throw new Error('EXACT_PROMOTION_HANDOFF_NOT_READY');
  }
  if (handoff.unresolvedCandidateOrdinals.length > 0) {
    throw new Error('EXACT_PROMOTION_HANDOFF_HAS_UNRESOLVED_IDENTITY');
  }
  if (handoff.degradedCandidateOrdinals.length > 0) {
    throw new Error('EXACT_PROMOTION_HANDOFF_HAS_DEGRADED_IDENTITY');
  }

  const canonicalIds = [...new Set(
    handoff.candidates
      .filter((candidate) => candidate.identityStatus === 'canonical')
      .map((candidate) => candidate.canonicalId),
  )].sort();

  if (handoff.required && canonicalIds.length === 0) {
    throw new Error('EXACT_PROMOTION_HANDOFF_HAS_NO_CANONICAL_CANDIDATES');
  }

  const node = ContextToolDagNodeV1Schema.parse({
    nodeId: input.nodeId ?? `exact-promotion:${handoff.requestId}`,
    kind: 'EXACT_PROMOTION',
    dependsOn: [...new Set(input.dependsOn)].sort(),
    canonicalIds,
    toolName: null,
    readOnly: true,
    requiresExactPromotion: false,
    requiresValidation: false,
    maxAttempts: input.maxAttempts ?? 1,
  });

  return {
    schema: 'atlas.exact-promotion-dag-input.v1',
    handoffChecksum: handoff.checksum,
    requestId: handoff.requestId,
    workspaceRevision: handoff.workspaceRevision,
    graphRevision: handoff.graphRevision ?? null,
    representationRevision: handoff.representationRevision,
    recommendationReceiptId: handoff.recommendationReceiptId,
    canonicalIds,
    evidenceRefs: [handoff.checksum, handoff.recommendationReceiptId].sort(),
    node,
  };
}
