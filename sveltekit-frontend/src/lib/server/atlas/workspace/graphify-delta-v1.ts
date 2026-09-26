import { z } from 'zod';
import { canonicalSha256V1 } from '../prefill/canonical-hash-v1.js';
import {
  appendWorkspaceEventV1,
  WorkspaceEventV1Schema,
  WorkspaceHeadV1Schema,
  type WorkspaceEventV1,
  type WorkspaceHeadV1,
} from './workspace-event-sourcing-v1.js';

export const GraphifySourceDeltaKindSchema = z.enum(['ADDED', 'CHANGED', 'UNCHANGED', 'DELETED']);
export type GraphifySourceDeltaKind = z.infer<typeof GraphifySourceDeltaKindSchema>;

export const GraphifySourceStateSchema = z
  .object({
    sourceRef: z.string().min(1),
    sourceRevision: z.string().min(1).nullable(),
    contentDigest: z.string().regex(/^(?:sha256:)?[a-f0-9]{64}$/).nullable(),
  })
  .strict();
export type GraphifySourceState = z.infer<typeof GraphifySourceStateSchema>;

export const GraphifySourceDeltaSchema = z
  .object({
    sourceRef: z.string().min(1),
    kind: GraphifySourceDeltaKindSchema,
    before: GraphifySourceStateSchema.nullable(),
    after: GraphifySourceStateSchema.nullable(),
    sourceEventRequired: z.boolean(),
    staleResultRejected: z.boolean(),
  })
  .strict();
export type GraphifySourceDelta = z.infer<typeof GraphifySourceDeltaSchema>;

export const GraphifyDeltaBatchV1Schema = z
  .object({
    schema: z.literal('atlas.graphify-delta-batch.v1'),
    batchId: z.string().uuid(),
    workspaceId: z.string().min(1),
    baseSnapshotRevision: z.string().min(1),
    previousHeadRevision: z.string().min(1),
    deltas: z.array(GraphifySourceDeltaSchema),
    changedCount: z.number().int().nonnegative(),
    addedCount: z.number().int().nonnegative(),
    deletedCount: z.number().int().nonnegative(),
    unchangedCount: z.number().int().nonnegative(),
    batchChecksum: z.string().regex(/^(?:sha256:)?[a-f0-9]{64}$/),
    canonicalAuthority: z.literal(false),
    writesPerformed: z.literal(false),
  })
  .strict();
export type GraphifyDeltaBatchV1 = z.infer<typeof GraphifyDeltaBatchV1Schema>;

export const GraphifySupersededSourceSchema = z
  .object({
    sourceRef: z.string().min(1),
    expectedRevision: z.string().min(1),
    observedRevision: z.string().min(1),
    status: z.literal('SOURCE_SUPERSEDED_DURING_BATCH'),
    staleResultRejected: z.literal(true),
    requeueRequired: z.literal(true),
  })
  .strict();
export type GraphifySupersededSource = z.infer<typeof GraphifySupersededSourceSchema>;

export function classifyGraphifySourceDeltaV1(
  before: GraphifySourceState | null,
  after: GraphifySourceState | null,
): GraphifySourceDelta {
  if (!before && after) return { sourceRef: after.sourceRef, kind: 'ADDED', before, after, sourceEventRequired: true, staleResultRejected: false };
  if (before && !after) return { sourceRef: before.sourceRef, kind: 'DELETED', before, after, sourceEventRequired: true, staleResultRejected: false };
  if (!before || !after) throw new Error('SOURCE_DELTA_REQUIRES_SOURCE_REF');
  if (before.sourceRef !== after.sourceRef) throw new Error('SOURCE_REF_MISMATCH');
  const unchanged = before.sourceRevision === after.sourceRevision && before.contentDigest === after.contentDigest;
  return {
    sourceRef: after.sourceRef,
    kind: unchanged ? 'UNCHANGED' : 'CHANGED',
    before,
    after,
    sourceEventRequired: !unchanged,
    staleResultRejected: false,
  };
}

function batchIdentity(input: Omit<GraphifyDeltaBatchV1, 'batchChecksum'>): unknown {
  return { ...input, schema: 'atlas.graphify-delta-batch-identity.v1' };
}

export function buildGraphifyDeltaBatchV1(input: {
  batchId: string;
  workspaceId: string;
  baseSnapshotRevision: string;
  previousHeadRevision: string;
  deltas: GraphifySourceDelta[];
}): GraphifyDeltaBatchV1 {
  const deltas = input.deltas.map((delta) => GraphifySourceDeltaSchema.parse(delta)).sort((a, b) => a.sourceRef.localeCompare(b.sourceRef, 'en'));
  const candidate = {
    schema: 'atlas.graphify-delta-batch.v1' as const,
    ...input,
    deltas,
    changedCount: deltas.filter((delta) => delta.kind === 'CHANGED').length,
    addedCount: deltas.filter((delta) => delta.kind === 'ADDED').length,
    deletedCount: deltas.filter((delta) => delta.kind === 'DELETED').length,
    unchangedCount: deltas.filter((delta) => delta.kind === 'UNCHANGED').length,
    canonicalAuthority: false as const,
    writesPerformed: false as const,
  };
  const batchChecksum = `sha256:${canonicalSha256V1(batchIdentity(candidate))}`;
  return GraphifyDeltaBatchV1Schema.parse({ ...candidate, batchChecksum });
}

export function detectSupersededSourceV1(
  expected: GraphifySourceState,
  observed: GraphifySourceState,
): GraphifySupersededSource | null {
  if (expected.sourceRef !== observed.sourceRef) throw new Error('SOURCE_REF_MISMATCH');
  if (expected.sourceRevision === observed.sourceRevision && expected.contentDigest === observed.contentDigest) return null;
  return GraphifySupersededSourceSchema.parse({
    sourceRef: expected.sourceRef,
    expectedRevision: expected.sourceRevision ?? 'UNAVAILABLE',
    observedRevision: observed.sourceRevision ?? 'UNAVAILABLE',
    status: 'SOURCE_SUPERSEDED_DURING_BATCH',
    staleResultRejected: true,
    requeueRequired: true,
  });
}

export function replayWorkspaceEventsV1(head: WorkspaceHeadV1, events: readonly WorkspaceEventV1[]): WorkspaceHeadV1 {
  let current = WorkspaceHeadV1Schema.parse(head);
  const ordered = [...events].sort((a, b) => (a.sequence < b.sequence ? -1 : a.sequence > b.sequence ? 1 : 0));
  for (const event of ordered) current = appendWorkspaceEventV1(current, WorkspaceEventV1Schema.parse(event));
  return current;
}
