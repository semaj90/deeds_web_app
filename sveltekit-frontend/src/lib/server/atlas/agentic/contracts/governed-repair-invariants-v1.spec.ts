import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import {
  buildRepairMutationReceiptV1,
  computeMutationChecksumV1,
  RepairMutationReceiptV1Schema,
  type RepairOperationV1,
  validateRepairPreconditionsV1,
  type ApprovedRepairExecutionV1,
  type PreconditionInputV1,
} from './governed-repair-v1';

/**
 * Cross-field invariants for the governed repair contract. Structural (Zod) validity alone does not
 * prove that an approval matches its plan, that a file checksum still matches, or that a receipt stays
 * inside the approved plan. Each test here checks one of those relations.
 */

const sha = (s: string) => `sha256:${createHash('sha256').update(s).digest('hex')}`;
const RUN_ID = '11111111-1111-4111-8111-111111111111';
const APPROVAL_ID = '22222222-2222-4222-8222-222222222222';
const PLAN_ID = '33333333-3333-4333-8333-333333333333';
const FILE = 'sveltekit-frontend/src/lib/server/demo.ts';
const CHECKSUM_BEFORE = sha('before-bytes');
const REVISION = 'workspace:rev-1';

function execution(overrides: Partial<ApprovedRepairExecutionV1['approvedMutationPlan']> = {}): ApprovedRepairExecutionV1 {
  const base = {
    planId: PLAN_ID,
    workspaceRevision: REVISION,
    targetFiles: [{ sourceRef: FILE, checksumBefore: CHECKSUM_BEFORE }],
    allowedOperations: ['PATCH_FILE'] as RepairOperationV1[],
    validationProfileId: 'vitest-targeted',
  };
  const plan = { ...base, ...overrides };
  const mutationChecksum = computeMutationChecksumV1(plan);
  return {
    taskId: 'task-1',
    workflowRunId: RUN_ID,
    repairAttemptId: 'attempt-1',
    retryOf: null,
    approvalId: APPROVAL_ID,
    approvedMutationPlan: { ...plan, allowedOperations: [...plan.allowedOperations], mutationChecksum },
  };
}

function validInput(exec = execution()): PreconditionInputV1 {
  return {
    execution: exec,
    approval: { decision: 'approved', planId: PLAN_ID, planChecksum: exec.approvedMutationPlan.mutationChecksum },
    runStatus: 'executing',
    currentWorkspaceRevision: REVISION,
    currentFileChecksums: { [FILE]: CHECKSUM_BEFORE },
  };
}

describe('validateRepairPreconditionsV1 (approval, plan, run, revision, file)', () => {
  it('passes only when every relation holds', () => {
    expect(validateRepairPreconditionsV1(validInput())).toEqual({ ok: true, violations: [] });
  });

  it('reports each violated relation with its own code', () => {
    const exec = execution();
    const cases: Array<[string, PreconditionInputV1, string]> = [
      ['missing approval', { ...validInput(exec), approval: null }, 'APPROVAL_MISSING'],
      ['rejected approval', { ...validInput(exec), approval: { decision: 'rejected', planId: PLAN_ID, planChecksum: exec.approvedMutationPlan.mutationChecksum } }, 'APPROVAL_NOT_APPROVED'],
      ['approval for another plan', { ...validInput(exec), approval: { decision: 'approved', planId: sha('other'), planChecksum: exec.approvedMutationPlan.mutationChecksum } }, 'APPROVAL_PLAN_MISMATCH'],
      ['approval checksum drift', { ...validInput(exec), approval: { decision: 'approved', planId: PLAN_ID, planChecksum: sha('drift') } }, 'APPROVAL_CHECKSUM_MISMATCH'],
      ['run not executing', { ...validInput(exec), runStatus: 'blocked' }, 'RUN_NOT_EXECUTING'],
      ['workspace revision moved', { ...validInput(exec), currentWorkspaceRevision: 'workspace:rev-2' }, 'PRECONDITION_REVISION_MISMATCH'],
      ['file changed since approval', { ...validInput(exec), currentFileChecksums: { [FILE]: sha('edited') } }, 'PRECONDITION_FILE_CHECKSUM_MISMATCH'],
      ['target file missing', { ...validInput(exec), currentFileChecksums: {} }, 'TARGET_FILE_MISSING'],
    ];
    for (const [label, input, code] of cases) {
      const result = validateRepairPreconditionsV1(input);
      expect(result.ok, label).toBe(false);
      expect(result.violations, label).toContain(code);
    }
  });

  it('detects a plan whose checksum no longer matches its contents', () => {
    const exec = execution();
    const tampered = { ...exec, approvedMutationPlan: { ...exec.approvedMutationPlan, validationProfileId: 'other-profile' } };
    const result = validateRepairPreconditionsV1({
      ...validInput(exec),
      execution: tampered,
    });
    expect(result.violations).toContain('PLAN_CHECKSUM_MISMATCH');
  });
});

describe('buildRepairMutationReceiptV1 (receipt stays inside the approved plan)', () => {
  const base = {
    execution: execution(),
    workspaceRevisionAfter: 'workspace:rev-2',
    files: [{ sourceRef: FILE, checksumBefore: CHECKSUM_BEFORE, checksumAfter: sha('after-bytes'), operation: 'PATCH_FILE' as const }],
    commandsExecuted: ['npx vitest run demo'],
    startedAt: '2026-10-11T12:00:00Z',
    completedAt: '2026-10-11T12:00:05Z',
    executorRevision: 'executor:v1',
    mutationApplied: true,
  };

  it('builds a schema-valid, non-authoritative receipt with a checksum', () => {
    const receipt = buildRepairMutationReceiptV1(base);
    expect(RepairMutationReceiptV1Schema.safeParse(receipt).success).toBe(true);
    expect(receipt.canonicalAuthority).toBe(false);
    expect(receipt.receiptChecksum.startsWith('sha256:')).toBe(true);
    expect(receipt.mutationPlanId).toBe(PLAN_ID);
  });

  it('rejects a file outside the approved plan, a disallowed operation, and a stale before-checksum', () => {
    expect(() => buildRepairMutationReceiptV1({
      ...base,
      files: [{ ...base.files[0], sourceRef: 'other/file.ts' }],
    })).toThrow('MUTATION_RECEIPT_FILE_OUTSIDE_PLAN');
    expect(() => buildRepairMutationReceiptV1({
      ...base,
      files: [{ ...base.files[0], operation: 'DELETE_FILE' }],
    })).toThrow('MUTATION_RECEIPT_OPERATION_NOT_ALLOWED');
    expect(() => buildRepairMutationReceiptV1({
      ...base,
      files: [{ ...base.files[0], checksumBefore: sha('stale') }],
    })).toThrow('MUTATION_RECEIPT_BEFORE_CHECKSUM_MISMATCH');
  });

  it('refuses to claim an applied mutation without a revision after it', () => {
    expect(() => buildRepairMutationReceiptV1({ ...base, workspaceRevisionAfter: null, mutationApplied: true }))
      .toThrow('MUTATION_APPLIED_REQUIRES_REVISION_AFTER');
  });

  it('rejects a receipt that claims canonical authority', () => {
    const receipt = buildRepairMutationReceiptV1(base);
    expect(RepairMutationReceiptV1Schema.safeParse({ ...receipt, canonicalAuthority: true }).success).toBe(false);
  });
});
