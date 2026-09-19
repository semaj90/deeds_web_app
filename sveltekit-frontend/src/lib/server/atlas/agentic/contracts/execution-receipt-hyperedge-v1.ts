import { z } from 'zod';
import type { OakExecutionReceiptV1 } from '../../policy/oak-dag-execution-adapter-v1.js';
import { AgenticHyperEdgeV1Schema, type AgenticHyperEdgeV1 } from './agentic-hyperedge-v1.js';

/**
 * Evidence-only projection from the existing bounded OAK execution receipt.
 * Execution/action IDs remain member IDs; they are deliberately not promoted
 * to canonical packet or source identity.
 */
export function projectOakExecutionReceiptToAgenticHyperEdgeV1(
  receipt: OakExecutionReceiptV1,
): AgenticHyperEdgeV1 {
  if (receipt.writesPerformed || receipt.canonicalAuthority) {
    throw new Error('EXECUTION_RECEIPT_HYPEREDGE_REQUIRES_NONAUTHORITATIVE_RECEIPT');
  }
  const members = receipt.actions.map((action, ordinal) => ({
    memberId: `execution-action:${action.id}`,
    memberRole: action.actionKind,
    ordinal,
    canonicalId: null,
    resolutionState: 'UNAVAILABLE' as const,
    sourceRef: null,
    sourceRevision: null,
    evidenceRefs: [
      `execution:${receipt.deterministicExecutionChecksum}`,
      `input:${action.inputChecksum}`,
      ...(action.outputChecksum ? [`output:${action.outputChecksum}`] : []),
    ],
  }));
  return AgenticHyperEdgeV1Schema.parse({
    schema: 'atlas.agentic-hyperedge.v1',
    edgeId: `execution:${receipt.planId}:${receipt.deterministicExecutionChecksum}`,
    actionId: null,
    workspaceRevision: null,
    sourceRevision: null,
    members,
    canonicalAuthority: false,
    writesPerformed: false,
    producerRevision: 'oak-execution-receipt-hyperedge:v1',
  });
}
