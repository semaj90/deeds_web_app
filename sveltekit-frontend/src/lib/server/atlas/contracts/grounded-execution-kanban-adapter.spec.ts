import { describe, expect, it } from 'vitest';
import { simulateGroundedExecutionReceipt } from './grounded-execution-receipt-v1.js';
import { toKanbanTaskAttemptInputV1 } from './grounded-execution-kanban-adapter.js';

const base = {
  taskId: 'task:repair-1',
  claimId: 'claim:run-1',
  runId: 'run-1',
  workerId: 'worker:test',
  canonicalEvidenceRefs: ['packet:abc'],
  validationCommand: 'npm test -- repair',
  validationReportRefs: ['report:repair-1'],
  startedAt: '2026-08-21T00:00:00.000Z',
  finishedAt: '2026-08-21T00:00:01.000Z',
};

describe('grounded execution Kanban adapter', () => {
  it('maps a successful grounded receipt to the existing attempt owner', () => {
    const input = toKanbanTaskAttemptInputV1(simulateGroundedExecutionReceipt({ ...base, validationStatus: 'PASS' }));
    expect(input).toEqual({
      taskId: 'task:repair-1',
      runId: 'run-1',
      worker: 'worker:test',
      success: true,
      failureKind: null,
      executionReceiptId: 'receipt:run-1',
    });
  });

  it('preserves blocked and failed outcomes as unsuccessful attempts', () => {
    const failed = toKanbanTaskAttemptInputV1(simulateGroundedExecutionReceipt({ ...base, validationStatus: 'FAIL' }));
    const blocked = toKanbanTaskAttemptInputV1(simulateGroundedExecutionReceipt({ ...base, validationStatus: 'NOT_RUN' }));
    expect(failed.success).toBe(false);
    expect(failed.failureKind).toBe('validation_failed');
    expect(blocked.success).toBe(false);
    expect(blocked.failureKind).toBe('validation_not_run');
  });
});
