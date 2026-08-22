import type { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { z } from 'zod';

import {
  agentActionEventSchema,
  actionCurrentProjectionSchema,
  projectActionCurrent,
  temporalActionChecksum,
  type AgentActionEventV1,
  type ActionCurrentProjectionV1,
} from './temporal-action-ledger.js';
import {
  reserveTemporalActionLedgerSequence,
  type TemporalActionSequenceReservationReceiptV1,
} from './temporal-action-sequence-reservation.js';

const checksum = z.string().regex(/^[a-f0-9]{64}$/);
const id = z.string().min(1);

type Queryable = {
  query<R extends QueryResultRow = any>(text: string, values?: any[]): Promise<QueryResult<R>>;
};

export const temporalActionAppendReceiptSchema = z.object({
  schema: z.literal('atlas.temporal-action-append-receipt.v1').default('atlas.temporal-action-append-receipt.v1'),
  event_id: id,
  execution_key: checksum,
  ledger_sequence: z.number().int().positive(),
  event_checksum: checksum,
  inserted: z.boolean(),
  readback_checksum: checksum,
  producer_revision: z.string().min(1),
}).strict();
export type TemporalActionAppendReceiptV1 = z.infer<typeof temporalActionAppendReceiptSchema>;

export const temporalActionLookupReceiptSchema = z.object({
  schema: z.literal('atlas.temporal-action-lookup-receipt.v1').default('atlas.temporal-action-lookup-receipt.v1'),
  execution_key: checksum,
  event_count: z.number().int().nonnegative(),
  latest_event_id: id.nullable(),
  projection_checksum: checksum.nullable(),
  producer_revision: z.string().min(1),
}).strict();
export type TemporalActionLookupReceiptV1 = z.infer<typeof temporalActionLookupReceiptSchema>;

export const temporalActionHistoryReceiptSchema = z.object({
  schema: z.literal('atlas.temporal-action-history-receipt.v1').default('atlas.temporal-action-history-receipt.v1'),
  event_count: z.number().int().nonnegative(),
  limit: z.number().int().positive().max(5000),
  workflow_id: id.nullable(),
  oldest_ledger_sequence: z.number().int().positive().nullable(),
  newest_ledger_sequence: z.number().int().positive().nullable(),
  producer_revision: z.string().min(1),
}).strict();
export type TemporalActionHistoryReceiptV1 = z.infer<typeof temporalActionHistoryReceiptSchema>;

type EventRow = {
  event_id: string;
  event_checksum: string;
  event_json: unknown;
};

function parseEventRow(row: EventRow): AgentActionEventV1 {
  const event = agentActionEventSchema.parse(row.event_json);
  if (event.event_id !== row.event_id) throw new Error(`TEMPORAL_EVENT_ID_READBACK_MISMATCH:${row.event_id}`);
  if (event.event_checksum !== row.event_checksum) throw new Error(`TEMPORAL_EVENT_CHECKSUM_COLUMN_MISMATCH:${row.event_id}`);
  const raw = { ...event } as Record<string, unknown>;
  delete raw.event_checksum;
  const recomputed = temporalActionChecksum(raw);
  if (recomputed !== event.event_checksum) throw new Error(`TEMPORAL_EVENT_CHECKSUM_READBACK_MISMATCH:${row.event_id}`);
  return event;
}

/**
 * PostgreSQL persistence for AgentActionEventV1.
 *
 * WorkflowActionEventV1 remains the canonical workflow/action identity owner.
 * This repository is an append-only durability implementation for already-built
 * temporal events. It never mints action/workflow identity and the current view
 * is derived/rebuildable from immutable event rows.
 */
export function createTemporalActionPostgresRepository(db: Pool | PoolClient | Queryable) {
  const queryable = db as Queryable;

  async function listByExecutionKey(executionKey: string): Promise<AgentActionEventV1[]> {
    checksum.parse(executionKey);
    const result = await queryable.query<EventRow>(
      `SELECT event_id, event_checksum, event_json
         FROM atlas_agent_action_events
        WHERE execution_key = $1
        ORDER BY ledger_sequence ASC, event_id ASC`,
      [executionKey],
    );
    return result.rows.map(parseEventRow);
  }

  async function listRecentFinalized(input: {
    limit?: number;
    workflow_id?: string | null;
    producer_revision: string;
  }): Promise<{ events: AgentActionEventV1[]; receipt: TemporalActionHistoryReceiptV1 }> {
    const limit = z.number().int().positive().max(5000).parse(input.limit ?? 512);
    const workflowId = input.workflow_id == null ? null : id.parse(input.workflow_id);
    const result = workflowId === null
      ? await queryable.query<EventRow>(
          `SELECT event_id, event_checksum, event_json
             FROM atlas_agent_action_events
            WHERE state = 'FINALIZED'
            ORDER BY ledger_sequence DESC, event_id DESC
            LIMIT $1`,
          [limit],
        )
      : await queryable.query<EventRow>(
          `SELECT event_id, event_checksum, event_json
             FROM atlas_agent_action_events
            WHERE state = 'FINALIZED'
              AND workflow_id = $1
            ORDER BY ledger_sequence DESC, event_id DESC
            LIMIT $2`,
          [workflowId, limit],
        );

    const events = result.rows.map(parseEventRow).sort((a, b) =>
      a.ledger_sequence - b.ledger_sequence || a.event_id.localeCompare(b.event_id));
    if (events.some((event) => event.state !== 'FINALIZED')) {
      throw new Error('TEMPORAL_HISTORY_NON_FINALIZED_READBACK');
    }
    return {
      events,
      receipt: temporalActionHistoryReceiptSchema.parse({
        event_count: events.length,
        limit,
        workflow_id: workflowId,
        oldest_ledger_sequence: events[0]?.ledger_sequence ?? null,
        newest_ledger_sequence: events.at(-1)?.ledger_sequence ?? null,
        producer_revision: input.producer_revision,
      }),
    };
  }

  return {
    /**
     * Reserves only append-log ordering. This sequence is NOT workflow/action
     * identity and MUST NOT participate in ActionExecutionKey derivation.
     * Gaps are expected when a process reserves a number and later fails before
     * append; append-only ordering does not require dense numbering.
     */
    async reserveLedgerSequence(producerRevision: string): Promise<TemporalActionSequenceReservationReceiptV1> {
      return reserveTemporalActionLedgerSequence(queryable as Pool, producerRevision);
    },

    async append(eventInput: AgentActionEventV1, producerRevision: string): Promise<TemporalActionAppendReceiptV1> {
      const event = agentActionEventSchema.parse(eventInput);
      const insert = await queryable.query<{ event_id: string }>(
        `INSERT INTO atlas_agent_action_events (
          event_id, ledger_sequence, workflow_id, workflow_revision, action_id,
          execution_key, opcode, target_canonical_id, state, outcome, error_code,
          workspace_revision, source_revision, graph_revision, observed_at,
          event_checksum, event_json, producer_revision
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17::jsonb,$18
        )
        ON CONFLICT (event_id) DO NOTHING
        RETURNING event_id`,
        [
          event.event_id,
          event.ledger_sequence,
          event.workflow_action.workflow_id,
          event.workflow_action.workflow_revision,
          event.workflow_action.action_id,
          event.execution_key,
          event.descriptor.opcode,
          event.descriptor.target.canonical_id,
          event.state,
          event.outcome,
          event.error_code,
          event.descriptor.applicability.workspace_revision.value,
          event.descriptor.applicability.source_revision.value,
          event.descriptor.applicability.graph_revision.value,
          event.observed_at,
          event.event_checksum,
          JSON.stringify(event),
          event.producer_revision,
        ],
      );

      const readback = await queryable.query<EventRow>(
        `SELECT event_id, event_checksum, event_json
           FROM atlas_agent_action_events
          WHERE event_id = $1`,
        [event.event_id],
      );
      if (readback.rowCount !== 1) throw new Error(`TEMPORAL_EVENT_READBACK_MISSING:${event.event_id}`);
      const persisted = parseEventRow(readback.rows[0]!);
      if (persisted.event_checksum !== event.event_checksum) {
        throw new Error(`TEMPORAL_EVENT_IMMUTABILITY_CONFLICT:${event.event_id}`);
      }

      return temporalActionAppendReceiptSchema.parse({
        event_id: event.event_id,
        execution_key: event.execution_key,
        ledger_sequence: event.ledger_sequence,
        event_checksum: event.event_checksum,
        inserted: insert.rowCount === 1,
        readback_checksum: persisted.event_checksum,
        producer_revision: producerRevision,
      });
    },

    listByExecutionKey,
    listRecentFinalized,

    async currentByExecutionKey(executionKey: string, producerRevision: string): Promise<{
      current: ActionCurrentProjectionV1 | null;
      receipt: TemporalActionLookupReceiptV1;
    }> {
      const events = await listByExecutionKey(executionKey);
      const current = events.length ? actionCurrentProjectionSchema.parse(projectActionCurrent(events)) : null;
      return {
        current,
        receipt: temporalActionLookupReceiptSchema.parse({
          execution_key: executionKey,
          event_count: events.length,
          latest_event_id: current?.latest_event_id ?? null,
          projection_checksum: current?.projection_checksum ?? null,
          producer_revision: producerRevision,
        }),
      };
    },
  };
}

export function describeTemporalActionPostgresRepository(): string {
  return [
    'atlas_agent_action_events is append-only persistence for AgentActionEventV1, not the workflow/action identity owner.',
    'atlas_agent_action_ledger_sequence_seq owns append-log ordering only; it does not mint workflow/action identity and never participates in ActionExecutionKey.',
    'WorkflowActionEventV1 remains canonical for workflow/action identity; temporal events add deterministic execution identity and observed outcome history.',
    'ActionCurrentProjectionV1 is rebuilt from immutable events and is not canonical history.',
    'Duplicate event_id inserts are accepted only when checksum-verified readback matches the immutable event.',
    'Recommendation history reads are bounded and checksum-verified; they do not create a second history owner.',
  ].join(' ');
}
