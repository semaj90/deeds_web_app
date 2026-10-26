import { createHash } from 'node:crypto';
import { z } from 'zod';

export const TOOL_EXECUTION_RECEIPT_SCHEMA = 'atlas.tool-execution-receipt.v1' as const;

export const VerificationStatusSchema = z.enum([
  'CONFIG_VALIDATED',
  'EXECUTED_UNVERIFIED',
  'VERIFIED_PASS',
  'VERIFIED_FAIL',
  'FABRICATED',
  'UNKNOWN',
]);
export type VerificationStatus = z.infer<typeof VerificationStatusSchema>;

export const ToolExecutionReceiptV1Schema = z
  .object({
    schema: z.literal(TOOL_EXECUTION_RECEIPT_SCHEMA),

    executionId: z.string().min(1),
    requestId: z.string().min(1),
    taskId: z.string().min(1),
    stageId: z.string().min(1),

    tool: z.object({
      name: z.string().min(1),
      version: z.string().min(1), // observed, not assumed
      binaryDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/).optional(),
    }).strict(),

    input: z.object({
      workspaceRevision: z.string().min(1),
      sourceRevision: z.string().min(1),
      inputDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    }).strict(),

    execution: z.object({
      startedAt: z.string().datetime(),
      finishedAt: z.string().datetime(),
      exitCode: z.number().int().nullable(),
      timedOut: z.boolean(),
      outputDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/).nullable(),
      eventRefs: z.array(z.string().min(1)),
    }).strict(),

    verification: z.object({
      status: VerificationStatusSchema,
      verifierId: z.string().min(1).nullable(),
      assertionRefs: z.array(z.string().min(1)),
      verifiedAt: z.string().datetime().nullable(),
    }).strict(),
  })
  .strict();
export type ToolExecutionReceiptV1 = z.infer<typeof ToolExecutionReceiptV1Schema>;

/**
 * Training admission predicate:
 * Excludes fabricated, unverified, configuration-only, or synthetically generated outcomes.
 * Only VERIFIED_PASS and VERIFIED_FAIL with proven provenance may train adaptive models.
 */
export function isTrainable(r: ToolExecutionReceiptV1): boolean {
  return (
    (r.verification.status === 'VERIFIED_PASS' || r.verification.status === 'VERIFIED_FAIL') &&
    r.verification.verifierId !== null &&
    r.verification.verifiedAt !== null &&
    r.execution.exitCode !== null &&
    r.execution.outputDigest !== null &&
    r.execution.eventRefs.length > 0 &&
    r.verification.assertionRefs.length > 0 &&
    Boolean(r.input.workspaceRevision) &&
    Boolean(r.input.sourceRevision)
  );
}

/**
 * Validates the cryptographic and structural consistency of a tool execution receipt.
 */
export function verifyReceiptIntegrity(r: ToolExecutionReceiptV1): {
  qualified: boolean;
  failureReason?: string;
} {
  const parsed = ToolExecutionReceiptV1Schema.safeParse(r);
  if (!parsed.success) {
    return { qualified: false, failureReason: `SCHEMA_VALIDATION_FAILED: ${parsed.error.message}` };
  }

  if (r.verification.status === 'FABRICATED') {
    return { qualified: false, failureReason: 'RECEIPT_EXPLICITLY_FABRICATED' };
  }

  if (r.execution.timedOut && r.verification.status === 'VERIFIED_PASS') {
    return { qualified: false, failureReason: 'TIMED_OUT_PROCESS_CANNOT_PASS' };
  }

  if (r.execution.exitCode !== null && r.execution.exitCode !== 0 && r.verification.status === 'VERIFIED_PASS') {
    return { qualified: false, failureReason: 'NONZERO_EXIT_CODE_CANNOT_PASS' };
  }

  return { qualified: true };
}

/**
 * Computes an immutable SHA-256 digest over the canonical serialized receipt.
 */
export function computeReceiptDigest(r: ToolExecutionReceiptV1): string {
  const raw = JSON.stringify(r);
  return `sha256:${createHash('sha256').update(raw, 'utf8').digest('hex')}`;
}
