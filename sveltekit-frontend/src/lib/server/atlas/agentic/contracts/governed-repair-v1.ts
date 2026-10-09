import { createHash } from 'node:crypto';
import { z } from 'zod';

/**
 * AGENTIC-REPAIR-EXEC-01/02/04 (pure contracts, no I/O). The executor CONSUMES an approval minted by the existing owner
 * (`workflow_approvals` / `recordApproval()`); it never mints one. Preconditions are checked before any mutation; the
 * mutation receipt is not the validation receipt (see repair-episode-verifier-v1.ts). No filesystem, DB or process access.
 */
const sha256 = z.string().regex(/^sha256:[0-9a-f]{64}$/);
export const REPAIR_OPERATIONS_V1 = ['WRITE_FILE', 'PATCH_FILE', 'DELETE_FILE'] as const;
export type RepairOperationV1 = (typeof REPAIR_OPERATIONS_V1)[number];

const digest = (v: unknown) => `sha256:${createHash('sha256').update(JSON.stringify(v), 'utf8').digest('hex')}`;

export const ApprovedMutationPlanV1Schema = z.object({
  planId: z.string().uuid(),
  workspaceRevision: z.string().min(1),
  targetFiles: z.array(z.object({ sourceRef: z.string().min(1), checksumBefore: sha256 }).strict()).min(1),
  allowedOperations: z.array(z.enum(REPAIR_OPERATIONS_V1)).min(1),
  validationProfileId: z.string().min(1),
  mutationChecksum: sha256,
}).strict();
export type ApprovedMutationPlanV1 = z.infer<typeof ApprovedMutationPlanV1Schema>;

export const ApprovedRepairExecutionV1Schema = z.object({
  taskId: z.string().min(1),
  workflowRunId: z.string().uuid(),
  repairAttemptId: z.string().min(1),
  retryOf: z.string().min(1).nullable(),
  approvalId: z.string().uuid(),
  approvedMutationPlan: ApprovedMutationPlanV1Schema,
}).strict();
export type ApprovedRepairExecutionV1 = z.infer<typeof ApprovedRepairExecutionV1Schema>;

/** Deterministic plan checksum: what the approver approved is exactly this (order-independent). */
export function computeMutationChecksumV1(plan: Omit<ApprovedMutationPlanV1, 'mutationChecksum' | 'planId'>): string {
  return digest({
    w: plan.workspaceRevision,
    t: [...plan.targetFiles].sort((a, b) => a.sourceRef.localeCompare(b.sourceRef)),
    o: [...plan.allowedOperations].sort(),
    v: plan.validationProfileId,
  });
}

export type PreconditionViolationV1 =
  | 'APPROVAL_MISSING' | 'APPROVAL_NOT_APPROVED' | 'APPROVAL_PLAN_MISMATCH' | 'APPROVAL_CHECKSUM_MISMATCH'
  | 'PLAN_CHECKSUM_MISMATCH' | 'RUN_NOT_EXECUTING' | 'PRECONDITION_REVISION_MISMATCH'
  | 'PRECONDITION_FILE_CHECKSUM_MISMATCH' | 'TARGET_FILE_MISSING';

export interface PreconditionInputV1 {
  execution: ApprovedRepairExecutionV1;
  /** The recorded approval row for (workflowRunId, approvalId), or null when none exists. */
  approval: { decision: 'approved' | 'rejected'; planId: string | null; planChecksum: string | null } | null;
  /** Current `workflow_runs.status`. recordApproval() moves blocked -> executing on approval. */
  runStatus: string;
  currentWorkspaceRevision: string;
  /** Current checksum per sourceRef; null/absent = file missing. */
  currentFileChecksums: Record<string, string | null | undefined>;
}

/** Returns every violated precondition; any violation means NO mutation. */
export function validateRepairPreconditionsV1(i: PreconditionInputV1): { ok: boolean; violations: PreconditionViolationV1[] } {
  const v: PreconditionViolationV1[] = [];
  const plan = i.execution.approvedMutationPlan;
  if (!i.approval) v.push('APPROVAL_MISSING');
  else {
    if (i.approval.decision !== 'approved') v.push('APPROVAL_NOT_APPROVED');
    if (i.approval.planId !== plan.planId) v.push('APPROVAL_PLAN_MISMATCH');
    if (i.approval.planChecksum !== plan.mutationChecksum) v.push('APPROVAL_CHECKSUM_MISMATCH');
  }
  if (computeMutationChecksumV1(plan) !== plan.mutationChecksum) v.push('PLAN_CHECKSUM_MISMATCH');
  if (i.runStatus !== 'executing') v.push('RUN_NOT_EXECUTING');
  if (i.currentWorkspaceRevision !== plan.workspaceRevision) v.push('PRECONDITION_REVISION_MISMATCH');
  for (const t of plan.targetFiles) {
    const cur = i.currentFileChecksums[t.sourceRef];
    if (cur == null) v.push('TARGET_FILE_MISSING');
    else if (cur !== t.checksumBefore) v.push('PRECONDITION_FILE_CHECKSUM_MISMATCH');
  }
  return { ok: v.length === 0, violations: [...new Set(v)] };
}

export const RepairMutationReceiptV1Schema = z.object({
  schema: z.literal('atlas.repair-mutation-receipt.v1'),
  taskId: z.string().min(1),
  workflowRunId: z.string().uuid(),
  repairAttemptId: z.string().min(1),
  approvalId: z.string().uuid(),
  mutationPlanId: z.string().uuid(),
  workspaceRevisionBefore: z.string().min(1),
  workspaceRevisionAfter: z.string().min(1).nullable(),
  files: z.array(z.object({ sourceRef: z.string().min(1), checksumBefore: sha256, checksumAfter: sha256.nullable(), operation: z.enum(REPAIR_OPERATIONS_V1) }).strict()),
  commandsExecuted: z.array(z.string()),
  startedAt: z.string().min(1),
  completedAt: z.string().min(1).nullable(),
  executorRevision: z.string().min(1),
  mutationApplied: z.boolean(),
  receiptChecksum: sha256,
  canonicalAuthority: z.literal(false),
}).strict();
export type RepairMutationReceiptV1 = z.infer<typeof RepairMutationReceiptV1Schema>;

/** Builds the receipt and rejects anything outside the approved plan (extra files, disallowed operations). */
export function buildRepairMutationReceiptV1(input: {
  execution: ApprovedRepairExecutionV1;
  workspaceRevisionAfter: string | null;
  files: RepairMutationReceiptV1['files'];
  commandsExecuted: string[];
  startedAt: string;
  completedAt: string | null;
  executorRevision: string;
  mutationApplied: boolean;
}): RepairMutationReceiptV1 {
  const plan = input.execution.approvedMutationPlan;
  const allowedFiles = new Map(plan.targetFiles.map((t) => [t.sourceRef, t.checksumBefore]));
  for (const f of input.files) {
    if (!allowedFiles.has(f.sourceRef)) throw new Error('MUTATION_RECEIPT_FILE_OUTSIDE_PLAN');
    if (!plan.allowedOperations.includes(f.operation)) throw new Error('MUTATION_RECEIPT_OPERATION_NOT_ALLOWED');
    if (allowedFiles.get(f.sourceRef) !== f.checksumBefore) throw new Error('MUTATION_RECEIPT_BEFORE_CHECKSUM_MISMATCH');
  }
  if (input.mutationApplied && input.workspaceRevisionAfter === null) throw new Error('MUTATION_APPLIED_REQUIRES_REVISION_AFTER');
  const unsigned = {
    schema: 'atlas.repair-mutation-receipt.v1' as const,
    taskId: input.execution.taskId,
    workflowRunId: input.execution.workflowRunId,
    repairAttemptId: input.execution.repairAttemptId,
    approvalId: input.execution.approvalId,
    mutationPlanId: plan.planId,
    workspaceRevisionBefore: plan.workspaceRevision,
    workspaceRevisionAfter: input.workspaceRevisionAfter,
    files: input.files,
    commandsExecuted: input.commandsExecuted,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
    executorRevision: input.executorRevision,
    mutationApplied: input.mutationApplied,
    canonicalAuthority: false as const,
  };
  return RepairMutationReceiptV1Schema.parse({ ...unsigned, receiptChecksum: digest(unsigned) });
}
