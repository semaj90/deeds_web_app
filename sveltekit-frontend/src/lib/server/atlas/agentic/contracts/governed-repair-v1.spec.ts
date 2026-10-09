import { describe, expect, it } from 'vitest';
import { ApprovedRepairExecutionV1Schema, buildRepairMutationReceiptV1, computeMutationChecksumV1, validateRepairPreconditionsV1, type ApprovedRepairExecutionV1 } from './governed-repair-v1.js';

const C = (n: string) => `sha256:${n.repeat(64)}`.slice(0, 71);
const base = { workspaceRevision: 'sha256:ws', targetFiles: [{ sourceRef: 'a.ts', checksumBefore: C('a') }, { sourceRef: 'b.ts', checksumBefore: C('b') }], allowedOperations: ['PATCH_FILE'] as ('PATCH_FILE')[], validationProfileId: 'tsc-v1' };
const exec = (): ApprovedRepairExecutionV1 => ApprovedRepairExecutionV1Schema.parse({
  taskId: 'task:1', workflowRunId: '11111111-1111-4111-8111-111111111111', repairAttemptId: 'ra-1', retryOf: null, approvalId: '33333333-3333-4333-8333-333333333333',
  approvedMutationPlan: { planId: '22222222-2222-4222-8222-222222222222', ...base, mutationChecksum: computeMutationChecksumV1(base) },
});
const ok = (e = exec()) => ({ execution: e, approval: { decision: 'approved' as const, planId: e.approvedMutationPlan.planId, planChecksum: e.approvedMutationPlan.mutationChecksum }, runStatus: 'executing', currentWorkspaceRevision: 'sha256:ws', currentFileChecksums: { 'a.ts': C('a'), 'b.ts': C('b') } });

describe('governed repair preconditions', () => {
  it('passes when approval, run state, revision and file checksums all match', () => {
    expect(validateRepairPreconditionsV1(ok())).toEqual({ ok: true, violations: [] });
  });
  it('plan checksum is order-independent', () => {
    expect(computeMutationChecksumV1({ ...base, targetFiles: [...base.targetFiles].reverse() })).toBe(computeMutationChecksumV1(base));
  });
  it('blocks without an approval, with a rejection, or bound to another plan', () => {
    expect(validateRepairPreconditionsV1({ ...ok(), approval: null }).violations).toContain('APPROVAL_MISSING');
    expect(validateRepairPreconditionsV1({ ...ok(), approval: { decision: 'rejected', planId: exec().approvedMutationPlan.planId, planChecksum: exec().approvedMutationPlan.mutationChecksum } }).violations).toContain('APPROVAL_NOT_APPROVED');
    expect(validateRepairPreconditionsV1({ ...ok(), approval: { decision: 'approved', planId: '99999999-9999-4999-8999-999999999999', planChecksum: exec().approvedMutationPlan.mutationChecksum } }).violations).toContain('APPROVAL_PLAN_MISMATCH');
    expect(validateRepairPreconditionsV1({ ...ok(), approval: { decision: 'approved', planId: exec().approvedMutationPlan.planId, planChecksum: C('f') } }).violations).toContain('APPROVAL_CHECKSUM_MISMATCH');
  });
  it('blocks a tampered plan and a run that is not executing', () => {
    const e = exec(); e.approvedMutationPlan.allowedOperations = ['PATCH_FILE', 'DELETE_FILE'];
    expect(validateRepairPreconditionsV1(ok(e)).violations).toContain('PLAN_CHECKSUM_MISMATCH');
    expect(validateRepairPreconditionsV1({ ...ok(), runStatus: 'blocked' }).violations).toContain('RUN_NOT_EXECUTING');
  });
  it('blocks when the workspace moved or a target file changed or vanished', () => {
    expect(validateRepairPreconditionsV1({ ...ok(), currentWorkspaceRevision: 'sha256:other' }).violations).toContain('PRECONDITION_REVISION_MISMATCH');
    expect(validateRepairPreconditionsV1({ ...ok(), currentFileChecksums: { 'a.ts': C('z'), 'b.ts': C('b') } }).violations).toContain('PRECONDITION_FILE_CHECKSUM_MISMATCH');
    expect(validateRepairPreconditionsV1({ ...ok(), currentFileChecksums: { 'a.ts': C('a') } }).violations).toContain('TARGET_FILE_MISSING');
  });
});

describe('RepairMutationReceiptV1', () => {
  const build = (files: any[], extra: Record<string, unknown> = {}) => buildRepairMutationReceiptV1({
    execution: exec(), workspaceRevisionAfter: 'sha256:ws2', files, commandsExecuted: ['patch a.ts'], startedAt: '2026-10-05T00:00:00Z', completedAt: '2026-10-05T00:00:01Z', executorRevision: 'exec-1', mutationApplied: true, ...extra,
  });
  it('builds a deterministic receipt for in-plan files', () => {
    const f = [{ sourceRef: 'a.ts', checksumBefore: C('a'), checksumAfter: C('c'), operation: 'PATCH_FILE' as const }];
    expect(build(f).receiptChecksum).toBe(build(f).receiptChecksum);
    expect(build(f).canonicalAuthority).toBe(false);
  });
  it('rejects files outside the plan, disallowed operations and stale before-checksums', () => {
    expect(() => build([{ sourceRef: 'x.ts', checksumBefore: C('a'), checksumAfter: C('c'), operation: 'PATCH_FILE' }])).toThrow('MUTATION_RECEIPT_FILE_OUTSIDE_PLAN');
    expect(() => build([{ sourceRef: 'a.ts', checksumBefore: C('a'), checksumAfter: null, operation: 'DELETE_FILE' }])).toThrow('MUTATION_RECEIPT_OPERATION_NOT_ALLOWED');
    expect(() => build([{ sourceRef: 'a.ts', checksumBefore: C('d'), checksumAfter: C('c'), operation: 'PATCH_FILE' }])).toThrow('MUTATION_RECEIPT_BEFORE_CHECKSUM_MISMATCH');
  });
  it('requires a revision-after when a mutation was applied', () => {
    expect(() => build([], { workspaceRevisionAfter: null })).toThrow('MUTATION_APPLIED_REQUIRES_REVISION_AFTER');
  });
});
