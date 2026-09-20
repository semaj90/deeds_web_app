/**
 * TaskAttemptReceiptV1 — one record per agentic attempt at an OpenSpec task (WORKBOARD-05 in
 * `openspec/changes/parent-atlas-retrieval-staging-planes`). The scheduler reads these receipts to
 * learn which blockers actually stopped attempts, so the ready-set stops re-offering blocked tasks.
 *
 * Advisory bookkeeping only: a receipt never marks a task done. Completion requires validator
 * evidence (`COMPLETED` needs at least one passing validation and no missing preconditions).
 */

import { z } from 'zod';

export const TASK_ATTEMPT_RESULT_VALUES = [
  'COMPLETED',
  'BLOCKED',
  'SUPERSEDED',
  'FAILED_VALIDATION',
] as const;

export const TASK_BLOCKER_CLASS_VALUES = [
  'IDENTITY_SOURCE_REVISION_GATED',
  'NEEDS_DB_OR_CACHE_WRITE',
  'NEEDS_RUNTIME_SERVICE',
  'NEEDS_OPERATOR_DECISION',
  'NONE',
] as const;

export const TaskAttemptReceiptV1Schema = z
  .object({
    schema: z.literal('atlas.task-attempt-receipt.v1').default('atlas.task-attempt-receipt.v1'),
    logicalTaskKey: z.string().min(1),
    taskRevision: z.string().min(1),
    preconditions: z.array(z.string()).default([]),
    missingPreconditions: z.array(z.string()).default([]),
    toolsUsed: z.array(z.string()).default([]),
    evidenceRefs: z.array(z.string()).default([]),
    result: z.enum(TASK_ATTEMPT_RESULT_VALUES),
    blockerClass: z.enum(TASK_BLOCKER_CLASS_VALUES),
    validationsPassed: z.array(z.string()).default([]),
    patches: z.array(z.string()).default([]),
    unblocks: z.array(z.string()).default([]),
    canonicalAuthority: z.literal(false).default(false),
  })
  .strict()
  .superRefine((r, ctx) => {
    if (r.result === 'COMPLETED') {
      if (r.missingPreconditions.length > 0) {
        ctx.addIssue({ code: 'custom', message: 'COMPLETED receipt cannot have missingPreconditions' });
      }
      if (r.validationsPassed.length === 0) {
        ctx.addIssue({ code: 'custom', message: 'COMPLETED receipt requires at least one passing validation' });
      }
      if (r.blockerClass !== 'NONE') {
        ctx.addIssue({ code: 'custom', message: 'COMPLETED receipt must have blockerClass NONE' });
      }
    }
    if (r.result === 'BLOCKED' && r.blockerClass === 'NONE') {
      ctx.addIssue({ code: 'custom', message: 'BLOCKED receipt must name a blockerClass' });
    }
  });

export type TaskAttemptReceiptV1 = z.infer<typeof TaskAttemptReceiptV1Schema>;

/** A task should be re-offered only if its last receipt is not BLOCKED, or a listed unblock has since been released. */
export function shouldRetryTask(
  last: TaskAttemptReceiptV1 | null,
  releasedEvents: readonly string[] = [],
): boolean {
  if (!last) return true;
  if (last.result === 'COMPLETED' || last.result === 'SUPERSEDED') return false;
  if (last.result === 'BLOCKED') {
    return last.unblocks.some((u) => releasedEvents.includes(u));
  }
  return true;
}
