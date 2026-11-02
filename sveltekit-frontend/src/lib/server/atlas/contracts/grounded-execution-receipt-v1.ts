import { z } from 'zod';

export const GroundedExecutionReceiptV1Schema = z.object({
  schema: z.literal('atlas.grounded-execution-receipt.v1'),
  receiptId: z.string().min(1),
  taskId: z.string().min(1),
  claimId: z.string().min(1),
  runId: z.string().min(1),
  workerId: z.string().min(1),
  outcome: z.enum(['SUCCEEDED', 'FAILED', 'BLOCKED']),
  validation: z.object({
    status: z.enum(['PASS', 'FAIL', 'NOT_RUN']),
    command: z.string().min(1),
    reportRefs: z.array(z.string().min(1)).default([]),
  }),
  canonicalEvidenceRefs: z.array(z.string().min(1)).min(1),
  outputRefs: z.array(z.string().min(1)).default([]),
  canonicalWrites: z.literal(false),
  startedAt: z.string().datetime(),
  finishedAt: z.string().datetime(),
  producerRevision: z.string().min(1),
}).superRefine((receipt, ctx) => {
  if (receipt.outcome === 'SUCCEEDED' && receipt.validation.status !== 'PASS') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['validation', 'status'],
      message: 'successful execution requires PASS validation',
    });
  }
  if (receipt.validation.status === 'PASS' && receipt.validation.reportRefs.length === 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['validation', 'reportRefs'],
      message: 'PASS validation requires at least one report reference',
    });
  }
  if (Date.parse(receipt.finishedAt) < Date.parse(receipt.startedAt)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['finishedAt'],
      message: 'finishedAt must not precede startedAt',
    });
  }
});

export type GroundedExecutionReceiptV1 = z.infer<typeof GroundedExecutionReceiptV1Schema>;

export interface WorkflowExecutionReceiptBridgeInputV1 {
  taskId: string;
  claimId: string;
  runId: string;
  workerId: string;
  receiptId: string;
  status: 'SUCCESS' | 'FAILED' | 'BLOCKED' | 'PARTIAL';
  evidenceRefs: string[];
  outputRefs?: string[];
  validationCommand: string;
  validationReportRefs?: string[];
  startedAt: string;
  finishedAt: string;
  producerRevision?: string;
}

/** Pure adapter from the existing error-agent receipt owner. */
export function adaptWorkflowExecutionReceiptV1(
  input: WorkflowExecutionReceiptBridgeInputV1,
): GroundedExecutionReceiptV1 {
  const validationStatus = input.status === 'SUCCESS'
    ? 'PASS'
    : input.status === 'FAILED'
      ? 'FAIL'
      : 'NOT_RUN';

  return GroundedExecutionReceiptV1Schema.parse({
    schema: 'atlas.grounded-execution-receipt.v1',
    receiptId: input.receiptId,
    taskId: input.taskId,
    claimId: input.claimId,
    runId: input.runId,
    workerId: input.workerId,
    outcome: input.status === 'SUCCESS' ? 'SUCCEEDED' : input.status === 'FAILED' ? 'FAILED' : 'BLOCKED',
    validation: {
      status: validationStatus,
      command: input.validationCommand,
      reportRefs: input.validationReportRefs ?? [],
    },
    canonicalEvidenceRefs: input.evidenceRefs,
    outputRefs: input.outputRefs ?? [],
    canonicalWrites: false,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    producerRevision: input.producerRevision ?? 'atlas.error-agent.execution-receipt.v1',
  });
}

export interface GroundedExecutionFixtureInputV1 {
  taskId: string;
  claimId: string;
  runId: string;
  workerId: string;
  canonicalEvidenceRefs: string[];
  validationStatus: 'PASS' | 'FAIL' | 'NOT_RUN';
  validationCommand: string;
  validationReportRefs?: string[];
  outputRefs?: string[];
  startedAt: string;
  finishedAt: string;
  producerRevision?: string;
}

/**
 * Fixture-only end-to-end seam. Production workers must persist the validated
 * receipt through the existing durable execution owner; this helper deliberately
 * performs no I/O and never authorizes canonical writes.
 */
export function simulateGroundedExecutionReceipt(
  input: GroundedExecutionFixtureInputV1,
): GroundedExecutionReceiptV1 {
  const outcome = input.validationStatus === 'PASS' ? 'SUCCEEDED' : input.validationStatus === 'FAIL' ? 'FAILED' : 'BLOCKED';
  return GroundedExecutionReceiptV1Schema.parse({
    schema: 'atlas.grounded-execution-receipt.v1',
    receiptId: `receipt:${input.runId}`,
    taskId: input.taskId,
    claimId: input.claimId,
    runId: input.runId,
    workerId: input.workerId,
    outcome,
    validation: {
      status: input.validationStatus,
      command: input.validationCommand,
      reportRefs: input.validationReportRefs ?? [],
    },
    canonicalEvidenceRefs: input.canonicalEvidenceRefs,
    outputRefs: input.outputRefs ?? [],
    canonicalWrites: false,
    startedAt: input.startedAt,
    finishedAt: input.finishedAt,
    producerRevision: input.producerRevision ?? 'atlas.grounded-execution-receipt.v1',
  });
}
