import { buildAcpKanbanErrorTaskV1, type AcpKanbanErrorTaskInputV1 } from '../kanban-acp-dag-contracts.js';
import { readOpenSpecTaskReceiptView } from './task-receipt-view-v1.js';

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

export async function buildAcpErrorFixProposalWithReceiptV1(input: AcpKanbanErrorTaskInputV1, sourceAgent: string) {
  const task = buildAcpKanbanErrorTaskV1(input, { sourceAgent });
  return task.workboardTaskRef
    ? { ...task, workboardReceipt: await readErrorFixTaskReceiptV1(task.workboardTaskRef) }
    : task;
}
