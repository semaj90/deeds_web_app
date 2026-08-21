import type { Pool, PoolClient } from 'pg';
import {
  GroundedContextManifestV1Schema,
  GroundedExecutionReceiptV1Schema,
  validateGroundedExecutionReceiptV1,
  type GroundedContextManifestV1,
  type GroundedExecutionReceiptV1,
} from './grounded-execution-receipt-v1.js';

export type GroundedExecutionReadbackV1 = {
  receipt: GroundedExecutionReceiptV1;
  groundedContext: GroundedContextManifestV1;
  recordedAt: string;
};

type Queryable = Pick<PoolClient, 'query'>;

async function readbackWith(queryable: Queryable, receiptId: string): Promise<GroundedExecutionReadbackV1 | null> {
  const result = await queryable.query<{
    receipt: unknown;
    grounded_context: unknown;
    recorded_at: Date | string;
  }>(`
    SELECT receipt, grounded_context, recorded_at
    FROM atlas_grounded_execution_receipts
    WHERE receipt_id = $1
  `, [receiptId]);
  if (result.rowCount === 0) return null;
  const row = result.rows[0]!;
  return {
    receipt: GroundedExecutionReceiptV1Schema.parse(row.receipt),
    groundedContext: GroundedContextManifestV1Schema.parse(row.grounded_context),
    recordedAt: row.recorded_at instanceof Date ? row.recorded_at.toISOString() : new Date(row.recorded_at).toISOString(),
  };
}

export function createGroundedExecutionRepository(pool: Pool) {
  async function readback(receiptId: string): Promise<GroundedExecutionReadbackV1 | null> {
    return readbackWith(pool, receiptId);
  }

  async function persistAndLinkAttempt(input: {
    receipt: GroundedExecutionReceiptV1;
    groundedContext: GroundedContextManifestV1;
  }): Promise<GroundedExecutionReadbackV1> {
    const receipt = GroundedExecutionReceiptV1Schema.parse(input.receipt);
    const groundedContext = GroundedContextManifestV1Schema.parse(input.groundedContext);
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const taskResult = await client.query<{
        task_id: string;
        current_run_id: string | null;
        assignee: string | null;
        claim_token: string | null;
      }>(`
        SELECT task_id, current_run_id, assignee, claim_token
        FROM kanban_tasks
        WHERE task_id = $1
        FOR UPDATE
      `, [receipt.taskId]);

      if (taskResult.rowCount !== 1) throw new Error(`GROUNDED_EXECUTION_TASK_MISSING:${receipt.taskId}`);
      const task = taskResult.rows[0]!;
      const validation = validateGroundedExecutionReceiptV1({
        receipt,
        groundedContext,
        currentTask: {
          taskId: task.task_id,
          currentRunId: task.current_run_id,
          assignee: task.assignee,
          claimToken: task.claim_token,
        },
      });
      if (!validation.ok) {
        throw new Error(`GROUNDED_EXECUTION_VALIDATION_FAILED:${validation.blockers.join(',')}`);
      }

      const inserted = await client.query(`
        INSERT INTO atlas_grounded_execution_receipts (
          receipt_id,
          task_id,
          run_id,
          worker_id,
          claim_token_digest,
          context_manifest_checksum,
          grounded_context_checksum,
          status,
          executor,
          executor_revision,
          receipt_checksum,
          grounded_context,
          receipt,
          recorded_at
        ) VALUES (
          $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb,$13::jsonb,now()
        )
        ON CONFLICT (receipt_id) DO NOTHING
      `, [
        receipt.receiptId,
        receipt.taskId,
        receipt.runId,
        receipt.workerId,
        receipt.claimTokenDigest,
        receipt.contextManifestChecksum,
        receipt.groundedContextChecksum,
        receipt.status,
        receipt.executor,
        receipt.executorRevision,
        receipt.receiptChecksum,
        JSON.stringify(groundedContext),
        JSON.stringify(receipt),
      ]);

      const stored = await readbackWith(client, receipt.receiptId);
      if (!stored) throw new Error(`GROUNDED_EXECUTION_READBACK_MISSING:${receipt.receiptId}`);
      if (stored.receipt.receiptChecksum !== receipt.receiptChecksum) {
        throw new Error(`GROUNDED_EXECUTION_IMMUTABILITY_CONFLICT:${receipt.receiptId}`);
      }
      if (inserted.rowCount === 0 && stored.receipt.runId !== receipt.runId) {
        throw new Error(`GROUNDED_EXECUTION_RUN_CONFLICT:${receipt.receiptId}`);
      }

      await client.query(`
        INSERT INTO kanban_task_attempts (
          task_id, run_id, worker, started_at, finished_at,
          success, failure_kind, execution_receipt_id
        ) VALUES ($1,$2,$3,$4::timestamptz,$5::timestamptz,$6,$7,$8)
        ON CONFLICT (task_id, run_id, execution_receipt_id) DO NOTHING
      `, [
        receipt.taskId,
        receipt.runId,
        receipt.workerId,
        receipt.startedAt,
        receipt.finishedAt,
        receipt.status === 'SUCCESS',
        receipt.status === 'SUCCESS' ? null : receipt.status.toLowerCase(),
        receipt.receiptId,
      ]);

      await client.query('COMMIT');
      return stored;
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  return { persistAndLinkAttempt, readback };
}
