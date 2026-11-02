import type { GroundedExecutionReceiptV1 } from './grounded-execution-receipt-v1.js';

export interface KanbanTaskAttemptInputV1 {
  taskId: string;
  runId: string;
  worker: string;
  success: boolean;
  failureKind: string | null;
  executionReceiptId: string;
}

/** Maps the grounded receipt to the existing Kanban attempt owner. */
export function toKanbanTaskAttemptInputV1(
  receipt: GroundedExecutionReceiptV1,
): KanbanTaskAttemptInputV1 {
  return {
    taskId: receipt.taskId,
    runId: receipt.runId,
    worker: receipt.workerId,
    success: receipt.outcome === 'SUCCEEDED' && receipt.validation.status === 'PASS',
    failureKind: receipt.outcome === 'SUCCEEDED'
      ? null
      : receipt.validation.status === 'FAIL'
        ? 'validation_failed'
        : 'validation_not_run',
    executionReceiptId: receipt.receiptId,
  };
}
