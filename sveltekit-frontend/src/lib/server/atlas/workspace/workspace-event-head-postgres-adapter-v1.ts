import type { Pool, PoolClient } from 'pg';
import {
  WorkspaceEventV1Schema,
  WorkspaceHeadV1Schema,
  type WorkspaceEventV1,
  type WorkspaceEventParticipant,
  type WorkspaceHeadV1,
} from './workspace-event-sourcing-v1.js';
import {
  writeFencedWorkspaceEventV1,
  writeWorkspaceEventHeadAtomicallyV1,
  type FencedAuthoritativeStateV1,
  type FencedWorkspaceEventStoreV1,
  type FencedWorkspaceEventTransactionV1,
  type WorkspaceOutboxInputV1,
  type WorkspaceOutboxRowV1,
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
  task_id: string | null;
  execution_run_id: string | null;
  lease_id: string | null;
  lease_fence_token: string | null;
  lease_fence_epoch: string | number | bigint | null;
  worktree_id: string | null;
  branch: string | null;
  base_commit: string | null;
  actor: string | null;
  idempotency_key: string | null;
  supersedes_event_id: string | null;
  obs_recorded_at: Date | string | null;
  obs_tool: string | null;
  obs_approval: 'PENDING' | 'APPROVED' | 'REJECTED' | null;
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
    ...(eventRow.task_id
      ? {
          provenance: {
            taskId: eventRow.task_id,
            executionRunId: eventRow.execution_run_id,
            leaseId: eventRow.lease_id,
            leaseFenceToken: eventRow.lease_fence_token,
            leaseFenceEpoch: Number(eventRow.lease_fence_epoch),
            worktreeId: eventRow.worktree_id,
            branch: eventRow.branch,
            baseCommit: eventRow.base_commit,
            actor: eventRow.actor,
            idempotencyKey: eventRow.idempotency_key,
            supersedesEventId: eventRow.supersedes_event_id,
          },
        }
      : {}),
    ...(eventRow.obs_approval
      ? {
          observation: {
            recordedAt: occurredAt(eventRow.obs_recorded_at as Date | string),
            tool: eventRow.obs_tool,
            approval: eventRow.obs_approval,
          },
        }
      : {}),
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
    `SELECT e.event_id, e.workspace_id, e.sequence, e.base_snapshot_revision,
            e.previous_head_revision, e.workspace_head_revision, e.delta_root_checksum,
            e.event_type, e.occurred_at, e.correlation_id, e.causation_id, e.producer_revision,
            e.before_state_checksum, e.after_state_checksum, e.event_checksum,
            e.task_id, e.execution_run_id, e.lease_id, e.lease_fence_token, e.lease_fence_epoch,
            e.worktree_id, e.branch, e.base_commit, e.actor, e.idempotency_key, e.supersedes_event_id,
            o.recorded_at AS obs_recorded_at, o.tool AS obs_tool, o.approval AS obs_approval
       FROM public.atlas_workspace_events e
       LEFT JOIN LATERAL (
         SELECT recorded_at, tool, approval
           FROM public.atlas_workspace_event_observations
          WHERE event_id = e.event_id
          ORDER BY observation_id DESC LIMIT 1
       ) o ON true
      WHERE e.event_id = $1`,
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

function createTransaction(client: PoolClient): FencedWorkspaceEventTransactionV1 {
  return {
    readHead: (workspaceId) => readHead(client, workspaceId, true),
    readEvent: (eventId) => readEvent(client, eventId),
    insertEvent: async (event) => {
      await client.query(
        `INSERT INTO public.atlas_workspace_events
          (event_id, workspace_id, sequence, base_snapshot_revision,
           previous_head_revision, workspace_head_revision, delta_root_checksum,
           event_type, occurred_at, correlation_id, causation_id, producer_revision,
           before_state_checksum, after_state_checksum, event_checksum,
           task_id, execution_run_id, lease_id, lease_fence_token, lease_fence_epoch,
           worktree_id, branch, base_commit, actor, idempotency_key, supersedes_event_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
                 $16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26)`,
        [
          event.eventId, event.workspaceId, event.sequence.toString(), event.baseSnapshotRevision,
          event.previousHeadRevision, event.workspaceHeadRevision, event.deltaRootChecksum,
          event.eventType, event.occurredAt, event.correlationId, event.causationId,
          event.producerRevision, event.beforeStateChecksum, event.afterStateChecksum,
          event.eventChecksum,
          event.provenance?.taskId ?? null, event.provenance?.executionRunId ?? null,
          event.provenance?.leaseId ?? null, event.provenance?.leaseFenceToken ?? null,
          event.provenance?.leaseFenceEpoch ?? null, event.provenance?.worktreeId ?? null,
          event.provenance?.branch ?? null, event.provenance?.baseCommit ?? null,
          event.provenance?.actor ?? null, event.provenance?.idempotencyKey ?? null,
          event.provenance?.supersedesEventId ?? null,
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

    findEventByIdempotencyKey: async (workspaceId, worktreeId, key) => {
      const found = await client.query<{ event_id: string }>(
        `SELECT event_id FROM public.atlas_workspace_events
          WHERE workspace_id = $1 AND worktree_id = $2 AND idempotency_key = $3`,
        [workspaceId, worktreeId, key],
      );
      return found.rows[0] ? readEvent(client, found.rows[0].event_id) : null;
    },

    // Lock order after the stream head: kanban claim row, then worktree lease row.
    // The clock is the DATABASE's clock_timestamp(), read after the locks are held.
    lockFenceState: async ({ taskId, leaseId }): Promise<FencedAuthoritativeStateV1 | null> => {
      const task = await client.query<{
        task_id: string;
        claim_token: string | null;
        current_run_id: string | null;
        claim_expires_at: Date | string | null;
      }>(
        `SELECT task_id, claim_token, current_run_id, claim_expires_at
           FROM public.kanban_tasks WHERE task_id = $1 FOR UPDATE`,
        [taskId],
      );
      const lease = await client.query<{
        lease_id: string;
        task_id: string;
        run_id: string | null;
        owner_agent: string;
        worktree_path: string;
        branch_name: string;
        base_commit: string;
        status: string;
        expires_at: Date | string | null;
        released_at: Date | string | null;
        fence_epoch: string | number | bigint;
      }>(
        `SELECT lease_id, task_id, run_id, owner_agent, worktree_path, branch_name, base_commit,
                status, expires_at, released_at, fence_epoch
           FROM public.worktree_leases WHERE lease_id = $1 FOR UPDATE`,
        [leaseId],
      );
      const clock = await client.query<{ db_now: Date | string }>(`SELECT clock_timestamp() AS db_now`);
      const t = task.rows[0];
      const l = lease.rows[0];
      if (!t || !l) return null;
      const iso = (v: Date | string | null) => (v == null ? null : v instanceof Date ? v.toISOString() : v);
      return {
        task: {
          taskId: t.task_id,
          claimToken: t.claim_token,
          currentRunId: t.current_run_id,
          claimExpiresAt: iso(t.claim_expires_at),
        },
        lease: {
          leaseId: l.lease_id,
          taskId: l.task_id,
          runId: l.run_id,
          ownerAgent: l.owner_agent,
          worktreePath: l.worktree_path,
          branchName: l.branch_name,
          baseCommit: l.base_commit,
          status: l.status,
          expiresAt: iso(l.expires_at),
          releasedAt: iso(l.released_at),
          fenceEpoch: Number(l.fence_epoch),
        },
        dbNow: iso(clock.rows[0].db_now) as string,
      };
    },

    // recorded_at is assigned by the database; the client's claim is stored separately.
    insertObservation: async (eventId, observation) => {
      await client.query(
        `INSERT INTO public.atlas_workspace_event_observations
          (event_id, approval, tool, client_recorded_at)
         VALUES ($1, $2, $3, $4)`,
        [eventId, observation.approval, observation.tool, observation.recordedAt],
      );
    },

    insertOutbox: async (row: WorkspaceOutboxRowV1) => {
      await client.query(
        `INSERT INTO public.atlas_projection_outbox
          (event_id, aggregate_type, aggregate_id, workspace_revision, source_revision, graph_revision,
           representation_revision, feature_revision, stage_receipt_checksum, changed_packet_keys,
           candidate_ordinals, projections, event_checksum)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
        [
          row.outboxEventId, row.aggregateType, row.aggregateId, row.workspaceRevision, row.sourceRevision,
          row.graphRevision, row.representationRevision, row.featureRevision, row.stageReceiptChecksum,
          row.changedPacketKeys, row.candidateOrdinals ?? [], row.projections, row.eventChecksum,
        ],
      );
    },

    readBackOutbox: async (outboxEventId) => {
      const result = await client.query<{ aggregate_id: string; event_checksum: string; workspace_revision: string }>(
        `SELECT aggregate_id, event_checksum, workspace_revision
           FROM public.atlas_projection_outbox WHERE event_id = $1`,
        [outboxEventId],
      );
      const row = result.rows[0];
      return row
        ? { aggregateId: row.aggregate_id, eventChecksum: row.event_checksum, workspaceRevision: row.workspace_revision }
        : null;
    },
  };
}

/**
 * Concrete Postgres/outbox storage seam. Construction is side-effect free;
 * callers must explicitly invoke the returned store and must have applied the
 * reviewed sidecar first. The event/head contract remains the only identity
 * authority; this adapter only serializes and reads it back.
 */
export function createPostgresWorkspaceEventHeadStoreV1(pool: Pool): FencedWorkspaceEventStoreV1 {
  return {
    async transaction<T>(callback: (tx: FencedWorkspaceEventTransactionV1) => Promise<T>) {
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

/** Fenced single-transaction append (TRCF-22). Requires the reviewed sidecar + provenance DDL. */
export async function writeFencedWorkspaceEventToPostgresV1(
  pool: Pool,
  input: { event: WorkspaceEventV1; outbox: WorkspaceOutboxInputV1 },
) {
  return writeFencedWorkspaceEventV1(createPostgresWorkspaceEventHeadStoreV1(pool), input);
}
