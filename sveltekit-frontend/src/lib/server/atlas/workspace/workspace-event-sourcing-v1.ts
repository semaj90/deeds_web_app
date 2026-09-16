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
  const { eventChecksum: _eventChecksum, ...identity } = event as WorkspaceEventV1;
  return {
    schema: 'atlas.workspace-event-identity.v1',
    ...identity,
    sequence: identity.sequence.toString(),
  };
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
