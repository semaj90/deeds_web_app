import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import {
  agentWorkReceiptChecksumV1,
  validateAgentWorkReceiptV1,
  type AgentWorkReceiptV1,
} from './agent-work-receipt-v1.js';
import { mapAgentWorkReceiptToOutcomeLedgerV1 } from './agent-work-receipt-outcome-adapter-v1.js';

export interface AgentWorkReceiptAcknowledgementV1 {
  ledgerId: string;
  receiptId: string;
  completionChecksum: string;
  acknowledged: true;
  replayed: boolean;
}

/**
 * Canonical receipt write boundary. Postgres is written first and the caller
 * receives an acknowledgement only after the row is durable or an identical
 * receipt is found. Existing legacy outcome writers are intentionally not
 * migrated by this function.
 */
export async function recordAgentWorkReceiptV1(
  input: AgentWorkReceiptV1,
): Promise<AgentWorkReceiptAcknowledgementV1> {
  const receipt = validateAgentWorkReceiptV1(input);
  const completionChecksum = receipt.completionChecksum ?? agentWorkReceiptChecksumV1(receipt);
  const mapped = mapAgentWorkReceiptToOutcomeLedgerV1(receipt);
  const metadata = { ...mapped.metadata, completionChecksum };

  const inserted = await db.execute<{ id: string }>(sql`
    INSERT INTO outcome_ledger
      (task_id, outcome_type, metadata, receipt_id, run_id, receipt_schema,
       receipt_status, writes_performed, completion_checksum)
    VALUES
      (${mapped.taskId ?? null}::uuid, ${mapped.outcomeType}, ${JSON.stringify(metadata)}::jsonb,
       ${receipt.receiptId}, ${receipt.runId}, ${receipt.schema}, ${receipt.status},
       ${receipt.writesPerformed}, ${completionChecksum})
    ON CONFLICT (receipt_id) WHERE receipt_id IS NOT NULL DO NOTHING
    RETURNING id
  `);

  if (inserted.rows[0]?.id) {
    return { ledgerId: inserted.rows[0].id, receiptId: receipt.receiptId, completionChecksum, acknowledged: true, replayed: false };
  }

  const existing = await db.execute<{ id: string; completion_checksum: string | null }>(sql`
    SELECT id, completion_checksum
    FROM outcome_ledger
    WHERE receipt_id = ${receipt.receiptId}
    LIMIT 1
  `);
  const row = existing.rows[0];
  if (!row) throw new Error('AGENT_WORK_RECEIPT_ACKNOWLEDGEMENT_MISSING');
  if (row.completion_checksum !== completionChecksum) {
    throw new Error('AGENT_WORK_RECEIPT_CHECKSUM_CONFLICT');
  }
  return { ledgerId: row.id, receiptId: receipt.receiptId, completionChecksum, acknowledged: true, replayed: true };
}
