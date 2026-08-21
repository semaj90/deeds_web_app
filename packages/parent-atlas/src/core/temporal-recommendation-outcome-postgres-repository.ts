import type { Pool, PoolClient, QueryResult, QueryResultRow } from 'pg';
import { z } from 'zod';

import {
  recommendationOutcomeReceiptSchema,
  temporalActionChecksum,
} from './temporal-action-ledger.js';
import type { RecommendationOutcomeReceiptV1 } from './temporal-recommendation-outcome-runtime.js';

const checksum = z.string().regex(/^[a-f0-9]{64}$/);
const id = z.string().min(1);

type Queryable = {
  query<R extends QueryResultRow = any>(text: string, values?: any[]): Promise<QueryResult<R>>;
};

type ReceiptRow = {
  receipt_checksum: string;
  receipt_json: unknown;
};

export const recommendationOutcomeAppendReceiptSchema = z.object({
  schema: z.literal('atlas.recommendation-outcome-append-receipt.v1'),
  receipt_checksum: checksum,
  recommendation_id: id,
  resulting_execution_key: checksum,
  inserted: z.boolean(),
  readback_checksum: checksum,
  producer_revision: id,
}).strict();
export type RecommendationOutcomeAppendReceiptV1 = z.infer<typeof recommendationOutcomeAppendReceiptSchema>;

function parseReceiptRow(row: ReceiptRow): RecommendationOutcomeReceiptV1 {
  const receipt = recommendationOutcomeReceiptSchema.parse(row.receipt_json);
  const recomputed = temporalActionChecksum(receipt);
  if (recomputed !== row.receipt_checksum) {
    throw new Error(`RECOMMENDATION_OUTCOME_CHECKSUM_READBACK_MISMATCH:${receipt.recommendation_id}`);
  }
  return receipt;
}

/**
 * Append-only durability for RecommendationOutcomeReceiptV1.
 *
 * The semantic receipt remains owned by the package contract. Postgres uses the
 * checksum of the complete immutable receipt as persistence identity and never
 * creates a second recommendation, action, or workflow identity.
 */
export function createRecommendationOutcomePostgresRepository(db: Pool | PoolClient | Queryable) {
  const queryable = db as Queryable;

  return {
    async append(
      receiptInput: RecommendationOutcomeReceiptV1,
      producerRevision: string,
    ): Promise<RecommendationOutcomeAppendReceiptV1> {
      const receipt = recommendationOutcomeReceiptSchema.parse(receiptInput);
      if (!receipt.resulting_execution_key) {
        throw new Error(`RECOMMENDATION_OUTCOME_EXECUTION_KEY_REQUIRED:${receipt.recommendation_id}`);
      }
      const receiptChecksum = temporalActionChecksum(receipt);
      const insert = await queryable.query<{ receipt_checksum: string }>(
        `INSERT INTO atlas_recommendation_outcome_receipts (
           receipt_checksum, recommendation_id, selected_action_id,
           resulting_execution_key, followed_recommendation, outcome,
           downstream_success, observed_at, producer_revision, receipt_json
         ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb)
         ON CONFLICT (receipt_checksum) DO NOTHING
         RETURNING receipt_checksum`,
        [
          receiptChecksum,
          receipt.recommendation_id,
          receipt.selected_action_id,
          receipt.resulting_execution_key,
          receipt.followed_recommendation,
          receipt.outcome,
          receipt.downstream_success,
          receipt.observed_at,
          receipt.producer_revision,
          JSON.stringify(receipt),
        ],
      );

      const readback = await queryable.query<ReceiptRow>(
        `SELECT receipt_checksum, receipt_json
           FROM atlas_recommendation_outcome_receipts
          WHERE receipt_checksum = $1`,
        [receiptChecksum],
      );
      if (readback.rowCount !== 1) {
        throw new Error(`RECOMMENDATION_OUTCOME_READBACK_MISSING:${receiptChecksum}`);
      }
      const persisted = parseReceiptRow(readback.rows[0]!);
      const readbackChecksum = temporalActionChecksum(persisted);
      if (readbackChecksum !== receiptChecksum) {
        throw new Error(`RECOMMENDATION_OUTCOME_IMMUTABILITY_CONFLICT:${receipt.recommendation_id}`);
      }

      return recommendationOutcomeAppendReceiptSchema.parse({
        schema: 'atlas.recommendation-outcome-append-receipt.v1',
        receipt_checksum: receiptChecksum,
        recommendation_id: receipt.recommendation_id,
        resulting_execution_key: receipt.resulting_execution_key,
        inserted: insert.rowCount === 1,
        readback_checksum: readbackChecksum,
        producer_revision: producerRevision,
      });
    },

    async listByRecommendationId(recommendationId: string): Promise<RecommendationOutcomeReceiptV1[]> {
      id.parse(recommendationId);
      const result = await queryable.query<ReceiptRow>(
        `SELECT receipt_checksum, receipt_json
           FROM atlas_recommendation_outcome_receipts
          WHERE recommendation_id = $1
          ORDER BY observed_at ASC, receipt_checksum ASC`,
        [recommendationId],
      );
      return result.rows.map(parseReceiptRow);
    },
  };
}
