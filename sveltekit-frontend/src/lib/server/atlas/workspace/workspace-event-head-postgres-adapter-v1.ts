import type { Pool, PoolClient } from 'pg';
import {
  WorkspaceEventV1Schema,
  WorkspaceHeadV1Schema,
  type WorkspaceEventV1,
  type WorkspaceEventParticipant,
  type WorkspaceHeadV1,
} from './workspace-event-sourcing-v1.js';
import {
  writeWorkspaceEventHeadAtomicallyV1,
  type WorkspaceEventHeadStoreV1,
  type WorkspaceEventHeadTransactionV1,
} from './workspace-event-head-durable-adapter-v1.js';

type EventRow = {
  event_id: string;
  workspace_id: string;
  sequence: string | number | bigint;
  base_snapshot_revision: string;
  previous_head_revision: string;
  workspace_head_revision: string;
  delta_root_checksum: string;
  event_type: WorkspaceEventV1['eventType'];
  occurred_at: Date | string;
  correlation_id: string;
  causation_id: string | null;
  producer_revision: string;
  before_state_checksum: string | null;
  after_state_checksum: string;
  event_checksum: string;
};

type ParticipantRow = {
  participant_ordinal: number;
  role: WorkspaceEventParticipant['role'];
  canonical_id: string;
  revision: string | null;
  relation: WorkspaceEventParticipant['relation'];
};

type HeadRow = {
  workspace_id: string;
  base_snapshot_revision: string;
  last_event_sequence: string | number | bigint;
  last_event_id: string | null;
  last_event_checksum: string | null;
  delta_root_checksum: string;
  event_count_since_snapshot: number;
  changed_source_count: number;
  workspace_head_revision: string;
};

function occurredAt(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : value;
}

function eventFromRows(eventRow: EventRow, participantRows: ParticipantRow[]): WorkspaceEventV1 {
  return WorkspaceEventV1Schema.parse({
    schema: 'atlas.workspace-event.v1',
    eventId: eventRow.event_id,
    workspaceId: eventRow.workspace_id,
    sequence: BigInt(eventRow.sequence),
    baseSnapshotRevision: eventRow.base_snapshot_revision,
    previousHeadRevision: eventRow.previous_head_revision,
    workspaceHeadRevision: eventRow.workspace_head_revision,
    deltaRootChecksum: eventRow.delta_root_checksum,
    eventType: eventRow.event_type,
    occurredAt: occurredAt(eventRow.occurred_at),
    correlationId: eventRow.correlation_id,
    causationId: eventRow.causation_id,
    producerRevision: eventRow.producer_revision,
    beforeStateChecksum: eventRow.before_state_checksum,
    afterStateChecksum: eventRow.after_state_checksum,
    participants: participantRows
      .sort((a, b) => a.participant_ordinal - b.participant_ordinal)
      .map((row) => ({
        role: row.role,
        canonicalId: row.canonical_id,
        revision: row.revision,
        relation: row.relation,
      })),
    eventChecksum: eventRow.event_checksum,
  });
}

function headFromRow(row: HeadRow): WorkspaceHeadV1 {
  return WorkspaceHeadV1Schema.parse({
    schema: 'atlas.workspace-head.v1',
    workspaceId: row.workspace_id,
    baseSnapshotRevision: row.base_snapshot_revision,
    lastEventSequence: BigInt(row.last_event_sequence),
    lastEventId: row.last_event_id,
    lastEventChecksum: row.last_event_checksum,
    deltaRootChecksum: row.delta_root_checksum,
    eventCountSinceSnapshot: row.event_count_since_snapshot,
    changedSourceCount: row.changed_source_count,
    workspaceHeadRevision: row.workspace_head_revision,
  });
}

async function readEvent(client: PoolClient, eventId: string): Promise<WorkspaceEventV1 | null> {
  const eventResult = await client.query<EventRow>(
    `SELECT event_id, workspace_id, sequence, base_snapshot_revision,
            previous_head_revision, workspace_head_revision, delta_root_checksum,
            event_type, occurred_at, correlation_id, causation_id, producer_revision,
            before_state_checksum, after_state_checksum, event_checksum
       FROM public.atlas_workspace_events
      WHERE event_id = $1`,
    [eventId],
  );
  const row = eventResult.rows[0];
  if (!row) return null;
  const participantResult = await client.query<ParticipantRow>(
    `SELECT participant_ordinal, role, canonical_id, revision, relation
       FROM public.atlas_workspace_event_participants
      WHERE event_id = $1
      ORDER BY participant_ordinal`,
    [eventId],
  );
  return eventFromRows(row, participantResult.rows);
}

async function readHead(client: PoolClient, workspaceId: string, lock: boolean): Promise<WorkspaceHeadV1 | null> {
  const result = await client.query<HeadRow>(
    `SELECT workspace_id, base_snapshot_revision, last_event_sequence, last_event_id,
            last_event_checksum, delta_root_checksum, event_count_since_snapshot,
            changed_source_count, workspace_head_revision
       FROM public.atlas_workspace_heads
      WHERE workspace_id = $1
      ${lock ? 'FOR UPDATE' : ''}`,
    [workspaceId],
  );
  return result.rows[0] ? headFromRow(result.rows[0]) : null;
}

function createTransaction(client: PoolClient): WorkspaceEventHeadTransactionV1 {
  return {
    readHead: (workspaceId) => readHead(client, workspaceId, true),
    readEvent: (eventId) => readEvent(client, eventId),
    insertEvent: async (event) => {
      await client.query(
        `INSERT INTO public.atlas_workspace_events
          (event_id, workspace_id, sequence, base_snapshot_revision,
           previous_head_revision, workspace_head_revision, delta_root_checksum,
           event_type, occurred_at, correlation_id, causation_id, producer_revision,
           before_state_checksum, after_state_checksum, event_checksum)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)`,
        [
          event.eventId, event.workspaceId, event.sequence.toString(), event.baseSnapshotRevision,
          event.previousHeadRevision, event.workspaceHeadRevision, event.deltaRootChecksum,
          event.eventType, event.occurredAt, event.correlationId, event.causationId,
          event.producerRevision, event.beforeStateChecksum, event.afterStateChecksum,
          event.eventChecksum,
        ],
      );
      for (const [participantOrdinal, participant] of event.participants.entries()) {
        await client.query(
          `INSERT INTO public.atlas_workspace_event_participants
            (event_id, participant_ordinal, role, canonical_id, revision, relation)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [event.eventId, participantOrdinal, participant.role, participant.canonicalId, participant.revision, participant.relation],
        );
      }
    },
    replaceHead: async (head) => {
      await client.query(
        `INSERT INTO public.atlas_workspace_heads
          (workspace_id, base_snapshot_revision, last_event_sequence, last_event_id,
           last_event_checksum, delta_root_checksum, event_count_since_snapshot,
           changed_source_count, workspace_head_revision)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         ON CONFLICT (workspace_id) DO UPDATE SET
           base_snapshot_revision = EXCLUDED.base_snapshot_revision,
           last_event_sequence = EXCLUDED.last_event_sequence,
           last_event_id = EXCLUDED.last_event_id,
           last_event_checksum = EXCLUDED.last_event_checksum,
           delta_root_checksum = EXCLUDED.delta_root_checksum,
           event_count_since_snapshot = EXCLUDED.event_count_since_snapshot,
           changed_source_count = EXCLUDED.changed_source_count,
           workspace_head_revision = EXCLUDED.workspace_head_revision,
           updated_at = now()`,
        [
          head.workspaceId, head.baseSnapshotRevision, head.lastEventSequence.toString(), head.lastEventId,
          head.lastEventChecksum, head.deltaRootChecksum, head.eventCountSinceSnapshot,
          head.changedSourceCount, head.workspaceHeadRevision,
        ],
      );
    },
    readBackEvent: (eventId) => readEvent(client, eventId),
    readBackHead: (workspaceId) => readHead(client, workspaceId, false),
  };
}

/**
 * Concrete Postgres/outbox storage seam. Construction is side-effect free;
 * callers must explicitly invoke the returned store and must have applied the
 * reviewed sidecar first. The event/head contract remains the only identity
 * authority; this adapter only serializes and reads it back.
 */
export function createPostgresWorkspaceEventHeadStoreV1(pool: Pool): WorkspaceEventHeadStoreV1 {
  return {
    async transaction<T>(callback) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const result = await callback(createTransaction(client));
        await client.query('COMMIT');
        return result;
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

export async function writeWorkspaceEventHeadToPostgresV1(
  pool: Pool,
  event: WorkspaceEventV1,
) {
  return writeWorkspaceEventHeadAtomicallyV1(createPostgresWorkspaceEventHeadStoreV1(pool), event);
}
