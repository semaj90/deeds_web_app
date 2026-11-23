import { buildAcpKanbanErrorTaskV1, type AcpKanbanErrorTaskInputV1 } from '../kanban-acp-dag-contracts.js';
import { readOpenSpecTaskReceiptView } from './task-receipt-view-v1.js';

export type AcpA2aRecommendationLanePhaseV1 =
  | 'PHASE_1_INTAKE_AND_STALENESS_GATE'
  | 'PHASE_2_STRUCTURAL_AND_LINEAGE_RETRIEVAL'
  | 'PHASE_3_ACP_A2A_PROPOSAL_AND_CONTEXT_MANIFEST'
  | 'PHASE_4_BOUNDED_VALIDATION_AND_READBACK'
  | 'PHASE_5_HUMAN_GATED_PROMOTION';

const STALENESS_SIGNAL_RE =
  /STALE_SNAPSHOT|STALE_SOURCE_REVISION|GRAPHIFY_LIFECYCLE_STALE|RESIDENCY_LEASE_EXPIRED|TILE_EVICTED|DOMAIN_TAGS_UNPOPULATED|STALE_CRAWL_REVISION|CALL_TARGET_SYMBOL_REVISION_MISMATCH|TASK_REFERENCE_MISMATCH/i;

/** Deterministic ACP/A2A lane-phase router for agentic error fixing and recommendations. */
export function classifyAcpA2aRecommendationLanePhaseV1(input: {
  kind: string;
  diagnostic?: string;
  receiptStatus?: string;
  validationPending?: boolean;
}): {
  lanePhase: AcpA2aRecommendationLanePhaseV1;
  blockedByStaleness: boolean;
  acpTarget: string;
  a2aTarget: string;
} {
  const diagnostic = input.diagnostic ?? '';
  const staleReceipt =
    input.receiptStatus === 'STALE_SNAPSHOT' ||
    input.receiptStatus === 'TASK_REFERENCE_MISMATCH' ||
    input.receiptStatus === 'NOT_FOUND';
  if (staleReceipt || STALENESS_SIGNAL_RE.test(diagnostic)) {
    return {
      lanePhase: 'PHASE_1_INTAKE_AND_STALENESS_GATE',
      blockedByStaleness: true,
      acpTarget: 'acp.refresh_stale_evidence',
      a2aTarget: 'a2a-staleness-reconciler',
    };
  }
  if (input.kind === 'AUTHORIZATION' || input.kind === 'DATABASE_SCHEMA') {
    return {
      lanePhase: 'PHASE_5_HUMAN_GATED_PROMOTION',
      blockedByStaleness: false,
      acpTarget: 'acp.human_gate_review',
      a2aTarget: 'a2a-human-promotion-gate',
    };
  }
  if (
    input.kind === 'LINEAGE_ADMISSION' ||
    input.kind === 'RETRIEVAL_OR_PROJECTION' ||
    input.kind === 'GRAPH_OR_GPU'
  ) {
    return {
      lanePhase: 'PHASE_2_STRUCTURAL_AND_LINEAGE_RETRIEVAL',
      blockedByStaleness: false,
      acpTarget: 'acp.lineage_retrieval_probe',
      a2aTarget: 'a2a-graph-retrieval-analyst',
    };
  }
  if (input.validationPending) {
    return {
      lanePhase: 'PHASE_4_BOUNDED_VALIDATION_AND_READBACK',
      blockedByStaleness: false,
      acpTarget: 'acp.bounded_validation_readback',
      a2aTarget: 'a2a-verifier',
    };
  }
  return {
    lanePhase: 'PHASE_3_ACP_A2A_PROPOSAL_AND_CONTEXT_MANIFEST',
    blockedByStaleness: false,
    acpTarget: 'acp.kanban_prefill_error_task',
    a2aTarget: 'a2a-error-fixer',
  };
}

/** Revision checks for proposal metadata shared by ACP and A2A. */
export async function readErrorFixTaskReceiptV1(ref: NonNullable<AcpKanbanErrorTaskInputV1['workboardTaskRef']>) {
  const lookup = await readOpenSpecTaskReceiptView(ref.stableKey);
  const matched = lookup.status === 'FOUND' &&
    lookup.task.revision === ref.taskRevision &&
    lookup.identity.workboardTaskId === ref.workboardTaskId &&
    lookup.identity.stableKey === ref.stableKey &&
    lookup.identity.logicalTaskKey === ref.logicalTaskKey &&
    lookup.identity.sourceRef === ref.sourceRef &&
    lookup.identity.sourceFileSha256 === ref.sourceFileSha256 &&
    lookup.identity.workboardSnapshotSha256 === ref.workboardSnapshotSha256;
  const eligible = matched && lookup.task.checkboxState !== 'Checked complete';
  const attempt = eligible ? lookup.current : null;
  return {
    status: lookup.status !== 'FOUND' ? lookup.status
      : !matched ? 'TASK_REFERENCE_MISMATCH'
      : !eligible ? 'TASK_ALREADY_CHECKED'
      : attempt ? 'CURRENT_RECEIPT' : 'NO_CURRENT_RECEIPT',
    taskRevision: eligible ? lookup.task.revision : null,
    attempt: attempt && {
      result: attempt.result,
      blockerClass: attempt.blockerClass,
      reportedValidationCount: attempt.validationsPassed.length
    },
    staleAttemptCount: eligible ? lookup.staleCount : 0,
    canonicalAuthority: false as const
  };
}

export async function buildAcpErrorFixProposalWithReceiptV1(
  input: AcpKanbanErrorTaskInputV1,
  sourceAgent: string,
  options?: { failureKind?: string; validationPending?: boolean },
) {
  const task = buildAcpKanbanErrorTaskV1(input, { sourceAgent });
  const workboardReceipt = task.workboardTaskRef
    ? await readErrorFixTaskReceiptV1(task.workboardTaskRef)
    : undefined;
  const laneAlignment = classifyAcpA2aRecommendationLanePhaseV1({
    kind: options?.failureKind ?? 'TYPECHECK_OR_SCHEMA',
    diagnostic: input.errorSignature,
    receiptStatus: workboardReceipt?.status,
    validationPending: options?.validationPending,
  });
  return workboardReceipt
    ? { ...task, workboardReceipt, laneAlignment }
    : { ...task, laneAlignment };
}
