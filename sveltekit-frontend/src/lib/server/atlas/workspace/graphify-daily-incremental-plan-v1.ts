import { z } from 'zod';
import { GraphifyDeltaBatchV1Schema, type GraphifyDeltaBatchV1 } from './graphify-delta-v1.js';
import { WorkspaceBindingCasBatchV1Schema, type WorkspaceBindingCasBatchV1 } from './workspace-binding-cas-v1.js';
import { WorkspaceInvalidationProjectionV1Schema, type WorkspaceInvalidationProjectionV1 } from './workspace-invalidation-projector-v1.js';
import { WorkspaceCompactionPlanV1Schema, type WorkspaceCompactionPlanV1 } from './workspace-snapshot-compaction-v1.js';

const status = z.enum([
  'READY_FOR_EVENT_ADMISSION',
  'BLOCKED_CAS_CONFLICT',
  'BLOCKED_SOURCE_SUPERSEDED',
  'BLOCKED_COMPACTION_REPLAY',
]);

export const GraphifyDailyIncrementalPlanV1Schema = z.object({
  schema: z.literal('atlas.graphify-daily-incremental-plan.v1'),
  batchId: z.string().uuid(),
  workspaceId: z.string().min(1),
  baseSnapshotRevision: z.string().min(1),
  previousHeadRevision: z.string().min(1),
  deltaBatchChecksum: z.string().regex(/^(?:sha256:)?[a-f0-9]{64}$/),
  sourceCounts: z.object({
    added: z.number().int().nonnegative(),
    changed: z.number().int().nonnegative(),
    deleted: z.number().int().nonnegative(),
    unchanged: z.number().int().nonnegative(),
  }).strict(),
  casCounts: z.object({
    ready: z.number().int().nonnegative(),
    noop: z.number().int().nonnegative(),
    tombstone: z.number().int().nonnegative(),
    conflict: z.number().int().nonnegative(),
    superseded: z.number().int().nonnegative(),
  }).strict(),
  invalidationCount: z.number().int().nonnegative(),
  unrelatedDependencyCount: z.number().int().nonnegative(),
  compactionStatus: z.string().min(1),
  blockers: z.array(z.string().min(1)),
  status,
  promotionEligible: z.literal(false),
  canonicalAuthority: z.literal(false),
  writesPerformed: z.literal(false),
}).strict();
export type GraphifyDailyIncrementalPlanV1 = z.infer<typeof GraphifyDailyIncrementalPlanV1Schema>;

/**
 * Compose daily Graphify's already-derived read-only plans. This function does
 * not append events, apply CAS bindings, repair packets, or compact snapshots.
 */
export function buildGraphifyDailyIncrementalPlanV1(input: {
  delta: GraphifyDeltaBatchV1;
  cas: WorkspaceBindingCasBatchV1;
  invalidations: readonly WorkspaceInvalidationProjectionV1[];
  compaction: WorkspaceCompactionPlanV1;
}): GraphifyDailyIncrementalPlanV1 {
  const delta = GraphifyDeltaBatchV1Schema.parse(input.delta);
  const cas = WorkspaceBindingCasBatchV1Schema.parse(input.cas);
  const invalidations = input.invalidations.map((projection) => WorkspaceInvalidationProjectionV1Schema.parse(projection));
  const compaction = WorkspaceCompactionPlanV1Schema.parse(input.compaction);
  const blockers: string[] = [];
  if (cas.counts.conflict > 0) blockers.push('SOURCE_HEAD_CONFLICT');
  if (cas.counts.superseded > 0) blockers.push('SOURCE_SUPERSEDED_DURING_BATCH');
  if (compaction.status === 'EVENT_GAP' || compaction.status === 'REPLAY_MISMATCH') blockers.push(`COMPACTION_${compaction.status}`);
  const planStatus = cas.counts.conflict > 0
    ? 'BLOCKED_CAS_CONFLICT'
    : cas.counts.superseded > 0
      ? 'BLOCKED_SOURCE_SUPERSEDED'
      : blockers.some((blocker) => blocker.startsWith('COMPACTION_'))
        ? 'BLOCKED_COMPACTION_REPLAY'
        : 'READY_FOR_EVENT_ADMISSION';
  return GraphifyDailyIncrementalPlanV1Schema.parse({
    schema: 'atlas.graphify-daily-incremental-plan.v1',
    batchId: delta.batchId,
    workspaceId: delta.workspaceId,
    baseSnapshotRevision: delta.baseSnapshotRevision,
    previousHeadRevision: delta.previousHeadRevision,
    deltaBatchChecksum: delta.batchChecksum,
    sourceCounts: {
      added: delta.addedCount,
      changed: delta.changedCount,
      deleted: delta.deletedCount,
      unchanged: delta.unchangedCount,
    },
    casCounts: cas.counts,
    invalidationCount: invalidations.reduce((total, projection) => total + projection.affectedCount, 0),
    unrelatedDependencyCount: invalidations.reduce((total, projection) => total + projection.unrelatedDependencyCount, 0),
    compactionStatus: compaction.status,
    blockers,
    status: planStatus,
    promotionEligible: false,
    canonicalAuthority: false,
    writesPerformed: false,
  });
}
