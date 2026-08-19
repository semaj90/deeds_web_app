import { describe, expect, it } from 'vitest';
import { buildExecutionLearningRecord } from '../src/lib/server/atlas/learning/execution-learning-record.js';

const base = {
  receiptId: 'receipt:1',
  runId: 'run:1',
  taskId: 'task:1',
  workspaceRevision: 'ws:742',
  taskFamily: 'compiler_error',
  status: 'SUCCESS' as const,
  sourceRefs: ['src/a.ts'],
  evidenceRefs: ['source:src/a.ts#1-5'],
  verifier: {
    schemaValid: true,
    provenanceValid: true,
    identityStable: true,
    executableValidationPassed: true,
    replayStable: true,
  },
};

const privacy = { secretsRedacted: true, privateRuntimeMaterialRemoved: true };

describe('buildExecutionLearningRecord', () => {
  it('allows positive SFT only for grounded validated success', () => {
    const row = buildExecutionLearningRecord(base, privacy, { emittedAt: '2026-08-18T00:00:00.000Z' });
    expect(row.eligibility.sftPositive).toBe(true);
    expect(row.privacy.eligibleForOfflineTraining).toBe(true);
  });

  it('does not convert a failed repair into a positive SFT example', () => {
    const row = buildExecutionLearningRecord({
      ...base,
      status: 'FAILED',
      verifier: { ...base.verifier, executableValidationPassed: false },
    }, privacy, { emittedAt: '2026-08-18T00:00:00.000Z' });
    expect(row.eligibility.sftPositive).toBe(false);
    expect(row.eligibility.preference).toBe(true);
    expect(row.eligibility.rewardModel).toBe(true);
  });

  it('blocks offline training when privacy cleanup is incomplete', () => {
    const row = buildExecutionLearningRecord(base, {
      secretsRedacted: false,
      privateRuntimeMaterialRemoved: true,
    }, { emittedAt: '2026-08-18T00:00:00.000Z' });
    expect(row.eligibility.sftPositive).toBe(false);
    expect(row.privacy.eligibleForOfflineTraining).toBe(false);
    expect(row.eligibility.reasons).toContain('PRIVACY_REDACTION_INCOMPLETE');
  });
});
