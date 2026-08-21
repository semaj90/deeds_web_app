import type { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { z } from 'zod';

const id = z.string().min(1);

type Queryable = {
  query<R extends QueryResultRow = any>(text: string, values?: any[]): Promise<QueryResult<R>>;
};

export const temporalActionSequenceReservationReceiptSchema = z.object({
  schema: z.literal('atlas.temporal-action-sequence-reservation-receipt.v1')
    .default('atlas.temporal-action-sequence-reservation-receipt.v1'),
  ledger_sequence: z.number().int().positive().safe(),
  allocator: z.literal('atlas_agent_action_ledger_sequence_seq'),
  identity_authority: z.literal(false),
  producer_revision: id,
}).strict();

export type TemporalActionSequenceReservationReceiptV1 = z.infer<
  typeof temporalActionSequenceReservationReceiptSchema
>;

/**
 * Reserves append-log order only. The sequence never participates in workflow,
 * action, execution, revision, or artifact identity. Gaps are legal.
 */
export async function reserveTemporalActionLedgerSequence(
  db: Pool | PoolClient | Queryable,
  producerRevision: string,
): Promise<TemporalActionSequenceReservationReceiptV1> {
  const producer_revision = id.parse(producerRevision);
  const result = await (db as Queryable).query<{ ledger_sequence: string | number }>(
    `SELECT nextval('atlas_agent_action_ledger_sequence_seq') AS ledger_sequence`,
  );

  if (result.rowCount !== 1 || result.rows.length !== 1) {
    throw new Error('TEMPORAL_LEDGER_SEQUENCE_RESERVATION_MISSING');
  }

  const raw = result.rows[0]?.ledger_sequence;
  const ledger_sequence = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isSafeInteger(ledger_sequence) || ledger_sequence <= 0) {
    throw new Error(`TEMPORAL_LEDGER_SEQUENCE_RESERVATION_INVALID:${String(raw)}`);
  }

  return temporalActionSequenceReservationReceiptSchema.parse({
    ledger_sequence,
    allocator: 'atlas_agent_action_ledger_sequence_seq',
    identity_authority: false,
    producer_revision,
  });
}
