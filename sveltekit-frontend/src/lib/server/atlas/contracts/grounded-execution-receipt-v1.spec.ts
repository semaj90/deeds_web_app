import { describe, expect, it } from 'vitest';
import {
  adaptWorkflowExecutionReceiptV1,
  GroundedExecutionReceiptV1Schema,
  simulateGroundedExecutionReceipt,
} from './grounded-execution-receipt-v1.js';

const base = {
  taskId: 'task:repair-1',
  claimId: 'claim:run-1',
  runId: 'run-1',
  workerId: 'worker:test',
  canonicalEvidenceRefs: ['packet:abc', 'graph:receipt-1'],
  validationCommand: 'npm test -- repair',
  startedAt: '2026-08-21T00:00:00.000Z',
  finishedAt: '2026-08-21T00:00:01.000Z',
};

describe('GroundedExecutionReceiptV1', () => {
  it('joins claim, run, worker, evidence, and PASS validation without writes', () => {
    const receipt = simulateGroundedExecutionReceipt({
      ...base,
      validationStatus: 'PASS',
      validationReportRefs: ['report:repair-1'],
      outputRefs: ['patch:repair-1'],
    });
    expect(receipt.outcome).toBe('SUCCEEDED');
    expect(receipt.runId).toBe(base.runId);
    expect(receipt.canonicalWrites).toBe(false);
  });

  it('represents failed validation as a terminal failed execution', () => {
    const receipt = simulateGroundedExecutionReceipt({ ...base, validationStatus: 'FAIL' });
    expect(receipt.outcome).toBe('FAILED');
    expect(receipt.validation.status).toBe('FAIL');
  });

  it('represents missing validation as blocked, not successful', () => {
    const receipt = simulateGroundedExecutionReceipt({ ...base, validationStatus: 'NOT_RUN' });
    expect(receipt.outcome).toBe('BLOCKED');
  });

  it('rejects successful receipts without a validation report', () => {
    expect(() => simulateGroundedExecutionReceipt({
      ...base,
      validationStatus: 'PASS',
    })).toThrow(/PASS validation requires/);
  });

  it('rejects a receipt whose finish precedes its start', () => {
    expect(() => GroundedExecutionReceiptV1Schema.parse({
      ...simulateGroundedExecutionReceipt({
        ...base,
        validationStatus: 'FAIL',
      }),
      finishedAt: base.startedAt,
      startedAt: base.finishedAt,
    })).toThrow(/finishedAt/);
  });

  it('adapts the existing workflow receipt owner without authorizing writes', () => {
    const receipt = adaptWorkflowExecutionReceiptV1({
      taskId: 'task-1',
      claimId: 'claim-1',
      runId: 'run-1',
      workerId: 'error-agent',
      receiptId: 'receipt:scaffold:run-1',
      status: 'SUCCESS',
      evidenceRefs: ['file:src/example.ts'],
      outputRefs: ['report:validation-1'],
      validationCommand: 'npm test -- example',
      validationReportRefs: ['report:validation-1'],
      startedAt: '2026-08-21T00:00:00.000Z',
      finishedAt: '2026-08-21T00:00:01.000Z',
    });

    expect(receipt.claimId).toBe('claim-1');
    expect(receipt.workerId).toBe('error-agent');
    expect(receipt.validation.status).toBe('PASS');
    expect(receipt.canonicalWrites).toBe(false);
  });
});
