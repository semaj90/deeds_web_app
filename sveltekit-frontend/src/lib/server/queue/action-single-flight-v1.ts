import { z } from 'zod';
import { sql } from 'drizzle-orm';

import { db } from '$lib/server/db/client.js';
import { artifactAddressSchema, type ArtifactAddressV1 } from './artifact-work-item-v1.js';

const fencingTokenSchema = z.union([
  z.string().regex(/^\d+$/),
  z.number().int().positive().transform((value) => String(value)),
]);

export const actionLeaseSchema = z.object({
  actionKey: z.string().min(16),
  leaseOwner: z.string().min(1),
  fencingToken: fencingTokenSchema,
  leaseExpiresAt: z.string().datetime(),
});

export type ActionLeaseV1 = z.infer<typeof actionLeaseSchema>;

export const actionExecutionReceiptSchema = z.object({
  schema: z.literal('atlas.action-execution-receipt.v1'),
  actionKey: z.string().min(16),
  fencingToken: fencingTokenSchema,
  outputArtifact: artifactAddressSchema,
  producerRevision: z.string().min(1),
  completedAt: z.string().datetime(),
});

export type ActionExecutionReceiptV1 = z.infer<typeof actionExecutionReceiptSchema>;

export type ActionClaimV1 =
  | { kind: 'receipt'; receipt: ActionExecutionReceiptV1 }
  | { kind: 'lease'; lease: ActionLeaseV1 }
  | { kind: 'busy'; actionKey: string; leaseExpiresAt: string };

type LeaseRow = {
  action_key: string;
  lease_owner: string;
  fencing_token: string | number | bigint;
  lease_expires_at: Date | string;
};

type ReceiptRow = {
  action_key: string;
  fencing_token: string | number | bigint;
  output_artifact_address: unknown;
  producer_revision: string;
  completed_at: Date | string;
};

function asIso(value: Date | string): string {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

function rowToLease(row: LeaseRow): ActionLeaseV1 {
  return actionLeaseSchema.parse({
    actionKey: row.action_key,
    leaseOwner: row.lease_owner,
    fencingToken: String(row.fencing_token),
    leaseExpiresAt: asIso(row.lease_expires_at),
  });
}

function rowToReceipt(row: ReceiptRow): ActionExecutionReceiptV1 {
  return actionExecutionReceiptSchema.parse({
    schema: 'atlas.action-execution-receipt.v1',
    actionKey: row.action_key,
    fencingToken: String(row.fencing_token),
    outputArtifact: row.output_artifact_address,
    producerRevision: row.producer_revision,
    completedAt: asIso(row.completed_at),
  });
}

export async function getActionExecutionReceipt(
  actionKey: string,
): Promise<ActionExecutionReceiptV1 | null> {
  const result = await db.execute<ReceiptRow>(sql`
    SELECT action_key, fencing_token, output_artifact_address,
           producer_revision, completed_at
    FROM workflow_action_receipts
    WHERE action_key = ${actionKey}
    LIMIT 1
  `);
  const row = result.rows?.[0];
  return row ? rowToReceipt(row) : null;
}

/**
 * Claim one expensive immutable computation by ActionKey.
 *
 * A completed receipt wins before any lease is considered. Otherwise a new
 * lease is inserted, or an expired lease is atomically replaced while its
 * fencing token increments. A live lease held by another delivery returns
 * `busy`, so at-least-once RabbitMQ delivery cannot run duplicate expensive
 * work concurrently.
 */
export async function claimActionWork(opts: {
  actionKey: string;
  leaseOwner: string;
  leaseMs: number;
}): Promise<ActionClaimV1> {
  if (!Number.isInteger(opts.leaseMs) || opts.leaseMs <= 0) {
    throw new Error('leaseMs must be a positive integer');
  }

  const receipt = await getActionExecutionReceipt(opts.actionKey);
  if (receipt) return { kind: 'receipt', receipt };

  const acquired = await db.execute<LeaseRow>(sql`
    INSERT INTO workflow_action_leases (
      action_key, lease_owner, fencing_token, lease_expires_at, updated_at
    ) VALUES (
      ${opts.actionKey},
      ${opts.leaseOwner},
      1,
      NOW() + (${opts.leaseMs} * INTERVAL '1 millisecond'),
      NOW()
    )
    ON CONFLICT (action_key) DO UPDATE
    SET lease_owner = EXCLUDED.lease_owner,
        fencing_token = workflow_action_leases.fencing_token + 1,
        lease_expires_at = EXCLUDED.lease_expires_at,
        updated_at = NOW()
    WHERE workflow_action_leases.lease_expires_at <= NOW()
    RETURNING action_key, lease_owner, fencing_token, lease_expires_at
  `);

  if (acquired.rows?.[0]) {
    return { kind: 'lease', lease: rowToLease(acquired.rows[0]) };
  }

  // A receipt can land after the first read but before the failed lease claim.
  const receiptAfterContention = await getActionExecutionReceipt(opts.actionKey);
  if (receiptAfterContention) return { kind: 'receipt', receipt: receiptAfterContention };

  const liveLease = await db.execute<LeaseRow>(sql`
    SELECT action_key, lease_owner, fencing_token, lease_expires_at
    FROM workflow_action_leases
    WHERE action_key = ${opts.actionKey}
    LIMIT 1
  `);
  const row = liveLease.rows?.[0];
  if (!row) {
    throw new Error(`Action lease disappeared during claim: ${opts.actionKey}`);
  }

  return {
    kind: 'busy',
    actionKey: opts.actionKey,
    leaseExpiresAt: asIso(row.lease_expires_at),
  };
}

/**
 * Persist the immutable successful output only if this worker still owns the
 * exact current fencing token. A stale worker whose lease expired cannot win
 * a late race against a replacement worker.
 *
 * If an earlier delivery already completed the same ActionKey, return that
 * existing immutable receipt instead of recomputing or overwriting it.
 */
export async function completeActionWork(opts: {
  actionKey: string;
  leaseOwner: string;
  fencingToken: string;
  outputArtifact: ArtifactAddressV1;
  producerRevision: string;
}): Promise<ActionExecutionReceiptV1> {
  const outputArtifact = artifactAddressSchema.parse(opts.outputArtifact);

  const inserted = await db.execute<ReceiptRow>(sql`
    INSERT INTO workflow_action_receipts (
      action_key,
      fencing_token,
      output_artifact_address,
      producer_revision,
      completed_at
    )
    SELECT
      ${opts.actionKey},
      l.fencing_token,
      ${JSON.stringify(outputArtifact)}::jsonb,
      ${opts.producerRevision},
      NOW()
    FROM workflow_action_leases l
    WHERE l.action_key = ${opts.actionKey}
      AND l.lease_owner = ${opts.leaseOwner}
      AND l.fencing_token = ${opts.fencingToken}::bigint
      AND l.lease_expires_at > NOW()
    ON CONFLICT (action_key) DO NOTHING
    RETURNING action_key, fencing_token, output_artifact_address,
              producer_revision, completed_at
  `);

  if (inserted.rows?.[0]) return rowToReceipt(inserted.rows[0]);

  const existing = await getActionExecutionReceipt(opts.actionKey);
  if (existing) return existing;

  throw new Error(
    `STALE_ACTION_FENCE: ActionKey ${opts.actionKey} is no longer owned by ` +
      `${opts.leaseOwner} at fencing token ${opts.fencingToken}`,
  );
}

export async function expireActionLease(opts: {
  actionKey: string;
  leaseOwner: string;
  fencingToken: string;
}): Promise<boolean> {
  const result = await db.execute<{ action_key: string }>(sql`
    UPDATE workflow_action_leases
    SET lease_expires_at = NOW(), updated_at = NOW()
    WHERE action_key = ${opts.actionKey}
      AND lease_owner = ${opts.leaseOwner}
      AND fencing_token = ${opts.fencingToken}::bigint
    RETURNING action_key
  `);
  return Boolean(result.rows?.[0]);
}
