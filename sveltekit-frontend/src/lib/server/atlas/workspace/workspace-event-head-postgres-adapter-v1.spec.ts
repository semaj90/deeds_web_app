import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import type { Pool } from 'pg';
import {
  buildWorkspaceEventV1,
  createWorkspaceHeadV1,
  deriveWorkspaceHeadRevisionV1,
  type WorkspaceEventV1,
  type WorkspaceHeadV1,
} from './workspace-event-sourcing-v1.js';
import { createPostgresWorkspaceEventHeadStoreV1, writeWorkspaceEventHeadToPostgresV1 } from './workspace-event-head-postgres-adapter-v1.js';

const digest = (value: string) => `sha256:${createHash('sha256').update(value).digest('hex')}`;

function fakePool(initialHead: WorkspaceHeadV1) {
  let head: WorkspaceHeadV1 | null = initialHead;
  const events = new Map<string, WorkspaceEventV1>();
  const participants = new Map<string, WorkspaceEventV1['participants']>();
  const client = {
    async query<T = Record<string, unknown>>(text: string, values: unknown[] = []) {
      if (text === 'BEGIN' || text === 'COMMIT' || text === 'ROLLBACK') return { rows: [] as T[] };
      if (text.includes('SELECT event_id, workspace_id')) {
        const event = events.get(String(values[0]));
        return { rows: event ? [{
          event_id: event.eventId, workspace_id: event.workspaceId, sequence: event.sequence.toString(),
          base_snapshot_revision: event.baseSnapshotRevision, previous_head_revision: event.previousHeadRevision,
          workspace_head_revision: event.workspaceHeadRevision, delta_root_checksum: event.deltaRootChecksum,
          event_type: event.eventType, occurred_at: event.occurredAt, correlation_id: event.correlationId,
          causation_id: event.causationId, producer_revision: event.producerRevision,
          before_state_checksum: event.beforeStateChecksum, after_state_checksum: event.afterStateChecksum,
          event_checksum: event.eventChecksum,
        }] as T[] : [] };
      }
      if (text.includes('SELECT participant_ordinal')) {
        return { rows: (participants.get(String(values[0])) ?? []).map((participant, participantOrdinal) => ({
          participant_ordinal: participantOrdinal, role: participant.role, canonical_id: participant.canonicalId,
          revision: participant.revision, relation: participant.relation,
        })) as T[] };
      }
      if (text.includes('SELECT workspace_id, base_snapshot_revision')) return {
        rows: head ? [{
          workspace_id: head.workspaceId, base_snapshot_revision: head.baseSnapshotRevision,
          last_event_sequence: head.lastEventSequence.toString(), last_event_id: head.lastEventId,
          last_event_checksum: head.lastEventChecksum, delta_root_checksum: head.deltaRootChecksum,
          event_count_since_snapshot: head.eventCountSinceSnapshot, changed_source_count: head.changedSourceCount,
          workspace_head_revision: head.workspaceHeadRevision,
        }] as T[] : [],
      };
      if (text.includes('INSERT INTO public.atlas_workspace_events')) {
        const [eventId, workspaceId, sequence, baseSnapshotRevision, previousHeadRevision, workspaceHeadRevision,
          deltaRootChecksum, eventType, occurredAt, correlationId, causationId, producerRevision,
          beforeStateChecksum, afterStateChecksum, eventChecksum] = values;
        events.set(String(eventId), {
          schema: 'atlas.workspace-event.v1', eventId: String(eventId), workspaceId: String(workspaceId), sequence: BigInt(String(sequence)),
          baseSnapshotRevision: String(baseSnapshotRevision), previousHeadRevision: String(previousHeadRevision),
          workspaceHeadRevision: String(workspaceHeadRevision), deltaRootChecksum: String(deltaRootChecksum),
          eventType: eventType as WorkspaceEventV1['eventType'], occurredAt: String(occurredAt),
          correlationId: String(correlationId), causationId: causationId as string | null,
          producerRevision: String(producerRevision), beforeStateChecksum: beforeStateChecksum as string | null,
          afterStateChecksum: String(afterStateChecksum), eventChecksum: String(eventChecksum), participants: [],
        });
        return { rows: [] as T[] };
      }
      if (text.includes('INSERT INTO public.atlas_workspace_event_participants')) {
        const [eventId, , role, canonicalId, revision, relation] = values;
        const list = participants.get(String(eventId)) ?? [];
        list.push({ role: role as WorkspaceEventV1['participants'][number]['role'], canonicalId: String(canonicalId), revision: revision as string | null, relation: relation as WorkspaceEventV1['participants'][number]['relation'] });
        participants.set(String(eventId), list);
        const event = events.get(String(eventId));
        if (event) event.participants = list;
        return { rows: [] as T[] };
      }
      if (text.includes('INSERT INTO public.atlas_workspace_heads')) {
        const [workspaceId, baseSnapshotRevision, lastEventSequence, lastEventId, lastEventChecksum,
          deltaRootChecksum, eventCountSinceSnapshot, changedSourceCount, workspaceHeadRevision] = values;
        head = {
          schema: 'atlas.workspace-head.v1', workspaceId: String(workspaceId), baseSnapshotRevision: String(baseSnapshotRevision),
          lastEventSequence: BigInt(String(lastEventSequence)), lastEventId: lastEventId as string | null,
          lastEventChecksum: lastEventChecksum as string | null, deltaRootChecksum: String(deltaRootChecksum),
          eventCountSinceSnapshot: Number(eventCountSinceSnapshot), changedSourceCount: Number(changedSourceCount),
          workspaceHeadRevision: String(workspaceHeadRevision),
        };
        return { rows: [] as T[] };
      }
      throw new Error(`UNEXPECTED_SQL:${text.slice(0, 60)}`);
    },
    release() {},
  };
  return { connect: async () => client, state: () => ({ head, events, participants }) };
}

describe('postgres workspace event/head adapter', () => {
  it('serializes a canonical event, participants, and head, then proves readback', async () => {
    const initial = createWorkspaceHeadV1({ workspaceId: 'repo:test', baseSnapshotRevision: digest('base'), deltaRootChecksum: digest('root') });
    const event = buildWorkspaceEventV1({
      eventId: '00000000-0000-4000-8000-000000000101', workspaceId: initial.workspaceId, sequence: 1n,
      baseSnapshotRevision: initial.baseSnapshotRevision, previousHeadRevision: initial.workspaceHeadRevision,
      workspaceHeadRevision: deriveWorkspaceHeadRevisionV1(initial.baseSnapshotRevision, 1n, digest('delta')),
      deltaRootChecksum: digest('delta'), eventType: 'SOURCE_UPDATED', occurredAt: '2026-09-16T21:30:00.000Z',
      correlationId: '00000000-0000-4000-8000-000000000102', causationId: null,
      producerRevision: 'postgres-adapter-test-v1', beforeStateChecksum: digest('before'), afterStateChecksum: digest('after'),
      participants: [{ role: 'SOURCE', canonicalId: 'src/example.ts', revision: digest('source'), relation: 'SUBJECT' }],
    });
    const pool = fakePool(initial);
    const result = await writeWorkspaceEventHeadToPostgresV1(pool as unknown as Pool, event);
    expect(result).toMatchObject({ duplicate: false, writesPerformed: true, readbackProven: true });
    expect(result.event.eventId).toBe(event.eventId);
    expect(result.event.participants).toEqual(event.participants);
    expect(result.head.workspaceHeadRevision).toBe(event.workspaceHeadRevision);
    expect(createPostgresWorkspaceEventHeadStoreV1(pool as unknown as Pool)).toBeDefined();
  });
});
