import { z } from 'zod';
import { GraphifySourceStateSchema, type GraphifySourceState } from './graphify-delta-v1.js';

export const WorkspaceBindingCasStatusSchema = z.enum([
  'READY_TO_APPLY',
  'UNCHANGED_NOOP',
  'DELETE_TOMBSTONE_READY',
  'SOURCE_HEAD_CONFLICT',
  'SOURCE_SUPERSEDED_DURING_BATCH',
]);
export type WorkspaceBindingCasStatus = z.infer<typeof WorkspaceBindingCasStatusSchema>;

export const WorkspaceBindingCasPlanV1Schema = z
  .object({
    schema: z.literal('atlas.workspace-binding-cas-plan.v1'),
    sourceRef: z.string().min(1),
    status: WorkspaceBindingCasStatusSchema,
    expected: GraphifySourceStateSchema.nullable(),
    current: GraphifySourceStateSchema.nullable(),
    observed: GraphifySourceStateSchema.nullable(),
    eventId: z.string().uuid().nullable(),
    writesPerformed: z.literal(false),
    canonicalAuthority: z.literal(false),
  })
  .strict();
export type WorkspaceBindingCasPlanV1 = z.infer<typeof WorkspaceBindingCasPlanV1Schema>;

export const WorkspaceBindingCasBatchV1Schema = z
  .object({
    schema: z.literal('atlas.workspace-binding-cas-batch.v1'),
    plans: z.array(WorkspaceBindingCasPlanV1Schema),
    counts: z.object({
      ready: z.number().int().nonnegative(),
      noop: z.number().int().nonnegative(),
      tombstone: z.number().int().nonnegative(),
      conflict: z.number().int().nonnegative(),
      superseded: z.number().int().nonnegative(),
    }).strict(),
    duplicateSourceRefs: z.array(z.string().min(1)),
    canonicalAuthority: z.literal(false),
    writesPerformed: z.literal(false),
  })
  .strict();
export type WorkspaceBindingCasBatchV1 = z.infer<typeof WorkspaceBindingCasBatchV1Schema>;

function sameState(left: GraphifySourceState | null, right: GraphifySourceState | null): boolean {
  if (!left || !right) return left === right;
  return left.sourceRef === right.sourceRef
    && left.sourceRevision === right.sourceRevision
    && left.contentDigest === right.contentDigest;
}

export function planWorkspaceBindingCasV1(input: {
  expected: GraphifySourceState | null;
  current: GraphifySourceState | null;
  observed: GraphifySourceState | null;
  eventId?: string | null;
}): WorkspaceBindingCasPlanV1 {
  const expected = input.expected ? GraphifySourceStateSchema.parse(input.expected) : null;
  const current = input.current ? GraphifySourceStateSchema.parse(input.current) : null;
  const observed = input.observed ? GraphifySourceStateSchema.parse(input.observed) : null;
  const sourceRef = observed?.sourceRef ?? expected?.sourceRef ?? current?.sourceRef;
  if (!sourceRef) throw new Error('SOURCE_REF_REQUIRED');
  if (expected && current && !sameState(expected, current)) {
    return WorkspaceBindingCasPlanV1Schema.parse({ schema: 'atlas.workspace-binding-cas-plan.v1', sourceRef, status: 'SOURCE_HEAD_CONFLICT', expected, current, observed, eventId: input.eventId ?? null, writesPerformed: false, canonicalAuthority: false });
  }
  if (!expected && current) {
    return WorkspaceBindingCasPlanV1Schema.parse({ schema: 'atlas.workspace-binding-cas-plan.v1', sourceRef, status: 'SOURCE_HEAD_CONFLICT', expected, current, observed, eventId: input.eventId ?? null, writesPerformed: false, canonicalAuthority: false });
  }
  if (sameState(current, observed)) {
    return WorkspaceBindingCasPlanV1Schema.parse({ schema: 'atlas.workspace-binding-cas-plan.v1', sourceRef, status: 'UNCHANGED_NOOP', expected, current, observed, eventId: input.eventId ?? null, writesPerformed: false, canonicalAuthority: false });
  }
  const status = observed ? 'READY_TO_APPLY' : 'DELETE_TOMBSTONE_READY';
  return WorkspaceBindingCasPlanV1Schema.parse({ schema: 'atlas.workspace-binding-cas-plan.v1', sourceRef, status, expected, current, observed, eventId: input.eventId ?? null, writesPerformed: false, canonicalAuthority: false });
}

export function planWorkspaceBindingCasBatchV1(
  inputs: readonly Parameters<typeof planWorkspaceBindingCasV1>[0][],
): WorkspaceBindingCasBatchV1 {
  const sourceRefs = inputs.map((input) => input.observed?.sourceRef ?? input.expected?.sourceRef ?? input.current?.sourceRef ?? '');
  const duplicateSourceRefs = [...new Set(sourceRefs.filter((sourceRef, index) => sourceRefs.indexOf(sourceRef) !== index))].sort();
  if (duplicateSourceRefs.length > 0) throw new Error(`DUPLICATE_SOURCE_REFS:${duplicateSourceRefs.join(',')}`);
  const plans = inputs.map(planWorkspaceBindingCasV1).sort((a, b) => a.sourceRef.localeCompare(b.sourceRef, 'en'));
  const counts = {
    ready: plans.filter((plan) => plan.status === 'READY_TO_APPLY').length,
    noop: plans.filter((plan) => plan.status === 'UNCHANGED_NOOP').length,
    tombstone: plans.filter((plan) => plan.status === 'DELETE_TOMBSTONE_READY').length,
    conflict: plans.filter((plan) => plan.status === 'SOURCE_HEAD_CONFLICT').length,
    superseded: plans.filter((plan) => plan.status === 'SOURCE_SUPERSEDED_DURING_BATCH').length,
  };
  return WorkspaceBindingCasBatchV1Schema.parse({ schema: 'atlas.workspace-binding-cas-batch.v1', plans, counts, duplicateSourceRefs, canonicalAuthority: false, writesPerformed: false });
}
