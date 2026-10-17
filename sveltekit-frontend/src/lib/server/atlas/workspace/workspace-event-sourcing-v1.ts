import { z } from 'zod';
import { canonicalSha256V1 } from '../prefill/canonical-hash-v1.js';

export const WORKSPACE_EVENT_SCHEMA = 'atlas.workspace-event.v1' as const;
export const WORKSPACE_HEAD_SCHEMA = 'atlas.workspace-head.v1' as const;
export const WORKSPACE_INVALIDATION_SCHEMA = 'atlas.workspace-invalidation.v1' as const;

const checksum = z.string().regex(/^(?:sha256:)?[a-f0-9]{64}$/);
const revision = z.string().min(1);

export const WorkspaceEventTypeSchema = z.enum([
  'SOURCE_CREATED',
  'SOURCE_UPDATED',
  'SOURCE_DELETED',
  'SOURCE_RENAMED',
  'PACKET_ADMITTED',
  'CHUNK_CHANGED',
  'REPRESENTATION_UPDATED',
  'GRAPH_EDGE_CHANGED',
  'CLASSIFIER_EVIDENCE_UPDATED',
]);
export type WorkspaceEventType = z.infer<typeof WorkspaceEventTypeSchema>;

export const WorkspaceEventParticipantRoleSchema = z.enum([
  'WORKSPACE',
  'SOURCE',
  'PACKET',
  'CHUNK',
  'REPRESENTATION',
  'GRAPH_NODE',
  'FEATURE',
  'MODEL',
]);
export type WorkspaceEventParticipantRole = z.infer<typeof WorkspaceEventParticipantRoleSchema>;

export const WorkspaceEventParticipantRelationSchema = z.enum([
  'SUBJECT',
  'INPUT',
  'OUTPUT',
  'INVALIDATES',
  'DERIVES',
  'DEPENDS_ON',
]);
export type WorkspaceEventParticipantRelation = z.infer<typeof WorkspaceEventParticipantRelationSchema>;

export const WorkspaceEventParticipantSchema = z
  .object({
    role: WorkspaceEventParticipantRoleSchema,
    canonicalId: z.string().min(1),
    revision: revision.nullable().default(null),
    relation: WorkspaceEventParticipantRelationSchema,
  })
  .strict();
export type WorkspaceEventParticipant = z.infer<typeof WorkspaceEventParticipantSchema>;

/**
 * Identity-bearing provenance: which task/execution/worktree produced the edit.
 * It can affect legitimacy, replay or fencing, so it is covered by the event
 * checksum when present; events without it keep their existing V1 checksums.
 * Mutable or observational facts live in `observation`, never here.
 * Filesystem mtimes are never a source of revision, and neither occurredAt nor
 * recordedAt orders replay: `sequence` within the stream does.
 */
export const WorkspaceEventProvenanceV1Schema = z
  .object({
    taskId: z.string().min(1),
    executionRunId: z.string().min(1),
    leaseId: z.string().min(1),
    leaseFenceToken: z.string().min(1),
    /** Monotonic per-lease epoch: presented < current proves a stale/zombie holder. */
    leaseFenceEpoch: z.number().int().positive(),
    worktreeId: z.string().min(1),
    branch: z.string().min(1),
    baseCommit: z.string().min(1),
    actor: z.string().min(1),
    idempotencyKey: z.string().min(1),
    supersedesEventId: z.string().uuid().nullable().default(null),
  })
  .strict();
export type WorkspaceEventProvenanceV1 = z.infer<typeof WorkspaceEventProvenanceV1Schema>;

/**
 * Observational metadata, EXCLUDED from the event checksum so that duplicate
 * delivery of the same event at a different time yields the same digest.
 * `approval` is a lifecycle state that changes after the event is created.
 */
export const WorkspaceEventObservationV1Schema = z
  .object({
    recordedAt: z.string().datetime(),
    tool: z.string().min(1).nullable().default(null),
    approval: z.enum(['PENDING', 'APPROVED', 'REJECTED']).default('PENDING'),
  })
  .strict();
export type WorkspaceEventObservationV1 = z.infer<typeof WorkspaceEventObservationV1Schema>;

export const WorkspaceEventV1Schema = z
  .object({
    schema: z.literal(WORKSPACE_EVENT_SCHEMA),
    eventId: z.string().uuid(),
    workspaceId: z.string().min(1),
    sequence: z.bigint().positive(),
    baseSnapshotRevision: revision,
    previousHeadRevision: revision,
    workspaceHeadRevision: revision,
    deltaRootChecksum: checksum,
    eventType: WorkspaceEventTypeSchema,
    occurredAt: z.string().datetime(),
    correlationId: z.string().uuid(),
    causationId: z.string().uuid().nullable().default(null),
    producerRevision: revision,
    beforeStateChecksum: checksum.nullable().default(null),
    afterStateChecksum: checksum,
    participants: z.array(WorkspaceEventParticipantSchema).min(1),
    provenance: WorkspaceEventProvenanceV1Schema.optional(),
    observation: WorkspaceEventObservationV1Schema.optional(),
    eventChecksum: checksum,
  })
  .strict();
export type WorkspaceEventV1 = z.infer<typeof WorkspaceEventV1Schema>;

export const WorkspaceHeadV1Schema = z
  .object({
    schema: z.literal(WORKSPACE_HEAD_SCHEMA),
    workspaceId: z.string().min(1),
    baseSnapshotRevision: revision,
    lastEventSequence: z.bigint().nonnegative(),
    lastEventId: z.string().uuid().nullable(),
    lastEventChecksum: checksum.nullable(),
    deltaRootChecksum: checksum,
    eventCountSinceSnapshot: z.number().int().nonnegative(),
    changedSourceCount: z.number().int().nonnegative(),
    workspaceHeadRevision: revision,
  })
  .strict();
export type WorkspaceHeadV1 = z.infer<typeof WorkspaceHeadV1Schema>;

export const WorkspaceInvalidationArtifactKindSchema = z.enum([
  'PACKET',
  'CHUNK',
  'FEATURE',
  'REPRESENTATION',
  'GRAPH',
  'CACHE',
]);
export type WorkspaceInvalidationArtifactKind = z.infer<typeof WorkspaceInvalidationArtifactKindSchema>;

export const WorkspaceInvalidationV1Schema = z
  .object({
    schema: z.literal(WORKSPACE_INVALIDATION_SCHEMA),
    eventId: z.string().uuid(),
    workspaceHeadRevision: revision,
    canonicalId: z.string().min(1),
    artifactKind: WorkspaceInvalidationArtifactKindSchema,
    reason: z.string().min(1),
    previousRevision: revision.nullable(),
    requiredRevision: revision.nullable(),
    writesPerformed: z.literal(false),
  })
  .strict();
export type WorkspaceInvalidationV1 = z.infer<typeof WorkspaceInvalidationV1Schema>;

function eventIdentity(event: Omit<WorkspaceEventV1, 'eventChecksum'>): unknown {
  const { eventChecksum: _eventChecksum, observation: _observation, ...identity } = event as WorkspaceEventV1;
  return {
    schema: 'atlas.workspace-event-identity.v1',
    ...identity,
    sequence: identity.sequence.toString(),
  };
}

const ACTIVE_LEASE_STATUSES = new Set(['ALLOCATED', 'ACTIVE', 'VALIDATING', 'READY_FOR_REVIEW']);

export interface AuthoritativeTaskClaimV1 {
  taskId: string;
  claimToken: string | null;
  currentRunId: string | null;
  /** When supplied, the claim itself must be unexpired at `now`. */
  claimExpiresAt?: string | null;
}

export interface AuthoritativeWorktreeLeaseV1 {
  leaseId: string;
  taskId: string;
  runId: string | null;
  ownerAgent: string;
  worktreePath: string;
  branchName: string;
  baseCommit: string;
  status: string;
  expiresAt: string | null;
  releasedAt: string | null;
  /** Monotonic; incremented on every grant/reclaim of the lease. */
  fenceEpoch: number;
}

function assertClaimAndLease(task: AuthoritativeTaskClaimV1, lease: AuthoritativeWorktreeLeaseV1, now: string): void {
  if (!ACTIVE_LEASE_STATUSES.has(lease.status) || lease.releasedAt) throw new Error('LEASE_NOT_ACTIVE');
  if (lease.expiresAt && Date.parse(lease.expiresAt) <= Date.parse(now)) throw new Error('LEASE_EXPIRED');
  if (lease.taskId !== task.taskId) throw new Error('LEASE_TASK_MISMATCH');
  if (!lease.runId || lease.runId !== task.currentRunId) throw new Error('LEASE_RUN_MISMATCH');
  if (!task.claimToken) throw new Error('TASK_NOT_CLAIMED');
  if (task.claimExpiresAt && Date.parse(task.claimExpiresAt) <= Date.parse(now)) throw new Error('CLAIM_EXPIRED');
}

/** presented < current is a stale/zombie holder; presented > current is impossible and rejected. */
function assertFence(presentedEpoch: number, presentedToken: string, lease: AuthoritativeWorktreeLeaseV1, claimToken: string | null): void {
  if (presentedEpoch < lease.fenceEpoch) throw new Error('STALE_FENCE_TOKEN');
  if (presentedEpoch > lease.fenceEpoch) throw new Error('FENCE_EPOCH_AHEAD');
  if (presentedToken !== claimToken) throw new Error('FENCE_TOKEN_MISMATCH');
}

/**
 * Pure bridge from a claimed task + live worktree lease to event provenance and
 * observation. The agent must PRESENT the fence token it was given; it is compared
 * to the authoritative claim, so an expired agent holding an old token cannot
 * stamp events. `expectedBaseCommit` (when given) must equal the lease base commit.
 * This never appends an event or touches a store.
 */
export function buildWorkspaceEventProvenanceFromLeaseV1(input: {
  task: AuthoritativeTaskClaimV1;
  lease: AuthoritativeWorktreeLeaseV1;
  presentedFenceToken: string;
  presentedFenceEpoch: number;
  expectedBaseCommit?: string;
  tool?: string | null;
  idempotencyKey: string;
  now: string;
  supersedesEventId?: string | null;
}): { provenance: WorkspaceEventProvenanceV1; observation: WorkspaceEventObservationV1 } {
  const { task, lease } = input;
  assertClaimAndLease(task, lease, input.now);
  assertFence(input.presentedFenceEpoch, input.presentedFenceToken, lease, task.claimToken);
  if (input.expectedBaseCommit && input.expectedBaseCommit !== lease.baseCommit) throw new Error('STALE_BASE_COMMIT');
  return {
    provenance: WorkspaceEventProvenanceV1Schema.parse({
      taskId: task.taskId,
      executionRunId: lease.runId,
      leaseId: lease.leaseId,
      leaseFenceToken: task.claimToken,
      leaseFenceEpoch: input.presentedFenceEpoch,
      worktreeId: lease.worktreePath,
      branch: lease.branchName,
      baseCommit: lease.baseCommit,
      actor: lease.ownerAgent,
      idempotencyKey: input.idempotencyKey,
      supersedesEventId: input.supersedesEventId ?? null,
    }),
    observation: WorkspaceEventObservationV1Schema.parse({
      recordedAt: input.now,
      tool: input.tool ?? null,
      approval: 'PENDING',
    }),
  };
}

/**
 * Builds a PROPOSED event for the next sequence of `head`'s stream. It is not
 * appended, validated against a store or persisted. Concurrent worktrees must use
 * separate streams (distinct workspaceId/head) so they cannot overwrite each other.
 */
export function proposeWorkspaceEventV1(input: {
  head: WorkspaceHeadV1;
  eventId: string;
  correlationId: string;
  causationId?: string | null;
  eventType: WorkspaceEventType;
  occurredAt: string;
  producerRevision: string;
  deltaRootChecksum: string;
  beforeStateChecksum?: string | null;
  afterStateChecksum: string;
  participants: WorkspaceEventParticipant[];
  provenance: WorkspaceEventProvenanceV1;
  observation: WorkspaceEventObservationV1;
}): WorkspaceEventV1 {
  const sequence = input.head.lastEventSequence + 1n;
  return buildWorkspaceEventV1({
    eventId: input.eventId,
    workspaceId: input.head.workspaceId,
    sequence,
    baseSnapshotRevision: input.head.baseSnapshotRevision,
    previousHeadRevision: input.head.workspaceHeadRevision,
    workspaceHeadRevision: deriveWorkspaceHeadRevisionV1(input.head.baseSnapshotRevision, sequence, input.deltaRootChecksum),
    deltaRootChecksum: input.deltaRootChecksum,
    eventType: input.eventType,
    occurredAt: input.occurredAt,
    correlationId: input.correlationId,
    causationId: input.causationId ?? null,
    producerRevision: input.producerRevision,
    beforeStateChecksum: input.beforeStateChecksum ?? null,
    afterStateChecksum: input.afterStateChecksum,
    participants: input.participants,
    provenance: input.provenance,
    observation: input.observation,
  });
}

export type WorkspaceEventAdmissionV1 =
  | { decision: 'ACCEPT'; reason: null }
  | { decision: 'DUPLICATE'; reason: 'IDEMPOTENCY_KEY_SEEN' }
  | { decision: 'REJECT'; reason: string };

/**
 * Admission decision for a proposed event against AUTHORITATIVE state supplied by
 * the persistence owner. Duplicate delivery is decided first so a replay of an
 * already-accepted event stays idempotent even after its lease has expired.
 * Pure: it does not append, write, or promote any projection.
 */
export function admitProposedWorkspaceEventV1(input: {
  event: WorkspaceEventV1;
  task: AuthoritativeTaskClaimV1;
  lease: AuthoritativeWorktreeLeaseV1;
  seenIdempotencyKeys: ReadonlySet<string>;
  currentBaseCommit: string;
  now: string;
}): WorkspaceEventAdmissionV1 {
  const prov = input.event.provenance;
  if (!prov) return { decision: 'REJECT', reason: 'PROVENANCE_REQUIRED' };
  if (input.seenIdempotencyKeys.has(prov.idempotencyKey)) return { decision: 'DUPLICATE', reason: 'IDEMPOTENCY_KEY_SEEN' };
  try {
    assertClaimAndLease(input.task, input.lease, input.now);
  } catch (error) {
    return { decision: 'REJECT', reason: error instanceof Error ? error.message : String(error) };
  }
  if (prov.taskId !== input.task.taskId || prov.leaseId !== input.lease.leaseId || prov.executionRunId !== input.lease.runId) {
    return { decision: 'REJECT', reason: 'PROVENANCE_BINDING_MISMATCH' };
  }
  try {
    assertFence(prov.leaseFenceEpoch, prov.leaseFenceToken, input.lease, input.task.claimToken);
  } catch (error) {
    return { decision: 'REJECT', reason: error instanceof Error ? error.message : String(error) };
  }
  if (prov.worktreeId !== input.lease.worktreePath) return { decision: 'REJECT', reason: 'WORKTREE_MISMATCH' };
  if (prov.baseCommit !== input.currentBaseCommit) return { decision: 'REJECT', reason: 'STALE_BASE_COMMIT' };
  return { decision: 'ACCEPT', reason: null };
}

export function deriveWorkspaceHeadRevisionV1(
  baseSnapshotRevision: string,
  sequence: bigint,
  deltaRootChecksum: string,
): string {
  return `sha256:${canonicalSha256V1({
    schema: 'atlas.workspace-head-revision.v1',
    baseSnapshotRevision,
    sequence: sequence.toString(),
    deltaRootChecksum,
  })}`;
}

export function buildWorkspaceEventV1(
  raw: Omit<z.input<typeof WorkspaceEventV1Schema>, 'schema' | 'eventChecksum'>,
): WorkspaceEventV1 {
  const candidate = WorkspaceEventV1Schema.omit({ eventChecksum: true }).parse({
    ...raw,
    schema: WORKSPACE_EVENT_SCHEMA,
  });
  const eventChecksum = `sha256:${canonicalSha256V1(eventIdentity(candidate))}`;
  return WorkspaceEventV1Schema.parse({ ...candidate, eventChecksum });
}

export function createWorkspaceHeadV1(input: {
  workspaceId: string;
  baseSnapshotRevision: string;
  deltaRootChecksum: string;
}): WorkspaceHeadV1 {
  const sequence = 0n;
  return WorkspaceHeadV1Schema.parse({
    schema: WORKSPACE_HEAD_SCHEMA,
    workspaceId: input.workspaceId,
    baseSnapshotRevision: input.baseSnapshotRevision,
    lastEventSequence: sequence,
    lastEventId: null,
    lastEventChecksum: null,
    deltaRootChecksum: input.deltaRootChecksum,
    eventCountSinceSnapshot: 0,
    changedSourceCount: 0,
    workspaceHeadRevision: deriveWorkspaceHeadRevisionV1(input.baseSnapshotRevision, sequence, input.deltaRootChecksum),
  });
}

export function appendWorkspaceEventV1(head: WorkspaceHeadV1, event: WorkspaceEventV1): WorkspaceHeadV1 {
  if (event.workspaceId !== head.workspaceId) throw new Error('WORKSPACE_ID_MISMATCH');
  if (event.baseSnapshotRevision !== head.baseSnapshotRevision) throw new Error('BASE_SNAPSHOT_MISMATCH');
  if (event.sequence !== head.lastEventSequence + 1n) throw new Error('WORKSPACE_EVENT_SEQUENCE_CONFLICT');
  if (event.previousHeadRevision !== head.workspaceHeadRevision) throw new Error('WORKSPACE_HEAD_CONFLICT');
  if (event.eventChecksum !== `sha256:${canonicalSha256V1(eventIdentity(event))}`) throw new Error('EVENT_CHECKSUM_MISMATCH');
  const nextHeadRevision = deriveWorkspaceHeadRevisionV1(head.baseSnapshotRevision, event.sequence, event.deltaRootChecksum);
  if (event.workspaceHeadRevision !== nextHeadRevision) throw new Error('WORKSPACE_HEAD_REVISION_MISMATCH');

  const changedSource = event.participants.some(
    (participant) => participant.role === 'SOURCE' && participant.relation === 'SUBJECT',
  );
  return WorkspaceHeadV1Schema.parse({
    ...head,
    lastEventSequence: event.sequence,
    lastEventId: event.eventId,
    lastEventChecksum: event.eventChecksum,
    deltaRootChecksum: event.deltaRootChecksum,
    eventCountSinceSnapshot: head.eventCountSinceSnapshot + 1,
    changedSourceCount: head.changedSourceCount + (changedSource ? 1 : 0),
    workspaceHeadRevision: nextHeadRevision,
  });
}

function artifactKindForParticipant(participant: WorkspaceEventParticipant): WorkspaceInvalidationArtifactKind | null {
  switch (participant.role) {
    case 'PACKET': return 'PACKET';
    case 'CHUNK': return 'CHUNK';
    case 'FEATURE': return 'FEATURE';
    case 'REPRESENTATION': return 'REPRESENTATION';
    case 'GRAPH_NODE': return 'GRAPH';
    case 'SOURCE': return 'CACHE';
    default: return null;
  }
}

export function deriveWorkspaceInvalidationsV1(
  event: WorkspaceEventV1,
): WorkspaceInvalidationV1[] {
  return event.participants
    .filter((participant) => participant.relation === 'INVALIDATES')
    .map((participant) => {
      const artifactKind = artifactKindForParticipant(participant);
      if (!artifactKind) return null;
      return WorkspaceInvalidationV1Schema.parse({
        schema: WORKSPACE_INVALIDATION_SCHEMA,
        eventId: event.eventId,
        workspaceHeadRevision: event.workspaceHeadRevision,
        canonicalId: participant.canonicalId,
        artifactKind,
        reason: event.eventType,
        previousRevision: participant.revision,
        requiredRevision: event.afterStateChecksum,
        writesPerformed: false,
      });
    })
    .filter((value): value is WorkspaceInvalidationV1 => value !== null);
}
