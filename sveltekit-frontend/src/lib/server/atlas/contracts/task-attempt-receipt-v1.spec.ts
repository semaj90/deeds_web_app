import { describe, expect, it } from 'vitest';
import { TaskAttemptReceiptV1Schema, shouldRetryTask } from './task-attempt-receipt-v1';

const base = { logicalTaskKey: 'change#1', taskRevision: 'sha256:abc' };

describe('TaskAttemptReceiptV1', () => {
  it('accepts a BLOCKED receipt that names a blocker', () => {
    const r = TaskAttemptReceiptV1Schema.parse({
      ...base,
      result: 'BLOCKED',
      blockerClass: 'IDENTITY_SOURCE_REVISION_GATED',
      missingPreconditions: ['CURRENT_SOURCE_AUTHORITY_PROVEN'],
      unblocks: ['CURRENT_SOURCE_AUTHORITY_PROVEN'],
    });
    expect(r.canonicalAuthority).toBe(false);
  });

  it('rejects BLOCKED with blockerClass NONE', () => {
    expect(() => TaskAttemptReceiptV1Schema.parse({ ...base, result: 'BLOCKED', blockerClass: 'NONE' })).toThrow();
  });

  it('rejects COMPLETED without a passing validation', () => {
    expect(() => TaskAttemptReceiptV1Schema.parse({ ...base, result: 'COMPLETED', blockerClass: 'NONE' })).toThrow();
  });

  it('rejects COMPLETED with missing preconditions', () => {
    expect(() =>
      TaskAttemptReceiptV1Schema.parse({
        ...base,
        result: 'COMPLETED',
        blockerClass: 'NONE',
        validationsPassed: ['openspec validate'],
        missingPreconditions: ['x'],
      }),
    ).toThrow();
  });

  it('accepts COMPLETED with validation evidence', () => {
    const r = TaskAttemptReceiptV1Schema.parse({
      ...base,
      result: 'COMPLETED',
      blockerClass: 'NONE',
      validationsPassed: ['tsgo --noEmit'],
    });
    expect(r.result).toBe('COMPLETED');
  });

  it('refuses to claim canonical authority', () => {
    expect(() =>
      TaskAttemptReceiptV1Schema.parse({ ...base, result: 'FAILED_VALIDATION', blockerClass: 'NONE', canonicalAuthority: true }),
    ).toThrow();
  });

  it('retries only when unblocked', () => {
    const blocked = TaskAttemptReceiptV1Schema.parse({
      ...base,
      result: 'BLOCKED',
      blockerClass: 'NEEDS_RUNTIME_SERVICE',
      unblocks: ['docker-up'],
    });
    expect(shouldRetryTask(null)).toBe(true);
    expect(shouldRetryTask(blocked)).toBe(false);
    expect(shouldRetryTask(blocked, ['docker-up'])).toBe(true);
  });
});
