import { z } from 'zod';

const RequiredRevision = z.string().trim().min(1);

export const PromotionRevisionBundleV1Schema = z.object({
  workspaceRevision: RequiredRevision,
  sourceRevision: RequiredRevision,
  representationRevision: RequiredRevision,
});

export type PromotionRevisionBundleV1 = z.infer<typeof PromotionRevisionBundleV1Schema>;

export const PromotionRevisionInputV1Schema = z.object({
  packetKey: RequiredRevision,
  sourceRef: RequiredRevision,
  contentHash: RequiredRevision,
  workspaceRevision: RequiredRevision,
  sourceRevision: RequiredRevision,
  representationRevision: RequiredRevision,
});

export type PromotionRevisionInputV1 = z.infer<typeof PromotionRevisionInputV1Schema>;

export type PromotionRevisionAdmissionV1 =
  | { status: 'ADMITTED'; input: PromotionRevisionInputV1; writesPerformed: false }
  | { status: 'REJECTED'; reason: string; writesPerformed: false };

export type PromotionRevisionBatchAdmissionV1 =
  | { status: 'ADMITTED'; inputs: PromotionRevisionInputV1[]; writesPerformed: false }
  | { status: 'REJECTED'; index: number; reason: string; writesPerformed: false };

/**
 * Pure preflight for the mutation-capable promotion outbox.
 * It validates caller-owned identity/revision values and performs no I/O.
 */
export function admitPromotionRevisionV1(
  input: unknown,
  expected: unknown,
): PromotionRevisionAdmissionV1 {
  const parsedInput = PromotionRevisionInputV1Schema.safeParse(input);
  if (!parsedInput.success) return { status: 'REJECTED', reason: 'PROMOTION_IDENTITY_OR_REVISION_MISSING', writesPerformed: false };

  const parsedExpected = PromotionRevisionBundleV1Schema.safeParse(expected);
  if (!parsedExpected.success) return { status: 'REJECTED', reason: 'ADMITTED_REVISION_BUNDLE_MISSING', writesPerformed: false };

  const value = parsedInput.data;
  const admitted = parsedExpected.data;
  if (value.workspaceRevision !== admitted.workspaceRevision) return { status: 'REJECTED', reason: 'WORKSPACE_REVISION_MISMATCH', writesPerformed: false };
  if (value.sourceRevision !== admitted.sourceRevision) return { status: 'REJECTED', reason: 'SOURCE_REVISION_MISMATCH', writesPerformed: false };
  if (value.representationRevision !== admitted.representationRevision) return { status: 'REJECTED', reason: 'REPRESENTATION_REVISION_MISMATCH', writesPerformed: false };

  return { status: 'ADMITTED', input: value, writesPerformed: false };
}

/** Validate every packet before any caller delegates to a mutation-capable writer. */
export function admitPromotionRevisionBatchV1(
  inputs: unknown[],
  expected: unknown,
): PromotionRevisionBatchAdmissionV1 {
  const admitted: PromotionRevisionInputV1[] = [];
  for (const [index, input] of inputs.entries()) {
    const result = admitPromotionRevisionV1(input, expected);
    if (result.status === 'REJECTED') return { status: 'REJECTED', index, reason: result.reason, writesPerformed: false };
    admitted.push(result.input);
  }
  return { status: 'ADMITTED', inputs: admitted, writesPerformed: false };
}
