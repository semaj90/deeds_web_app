import { sql } from 'drizzle-orm';
import { db } from '$lib/server/db/client.js';

export type ActionLeaseV1 = {
  actionKey: string;
  holderId: string;
  fencingToken: bigint;
  expiresAt: Date;
};

function parseLeaseRow(row: Record<string, unknown>): ActionLeaseV1 {
  return {
    actionKey: String(row.action_key),
    holderId: String(row.holder_id),
    fencingToken: BigInt(String(row.fencing_token)),
    expiresAt: new Date(String(row.expires_at)),
  };
}

export async function acquireActionLease(opts: {
  actionKey: string;
  holderId: string;
  ttlMs: number;
}): Promise<ActionLeaseV1 | null> {
  if (!opts.actionKey) throw new Error('actionKey is required');
  if (!opts.holderId) throw new Error('holderId is required');
  if (!Number.isInteger(opts.ttlMs) || opts.ttlMs <= 0) {
    throw new Error('ttlMs must be a positive integer');
  }

  const rows = await db.execute(sql`
    INSERT INTO atlas_action_leases (
      action_key,
      holder_id,
      fencing_token,
      acquired_at,
      expires_at,
      updated_at
    ) VALUES (
      ${opts.actionKey},
      ${opts.holderId},
      1,
      NOW(),
      NOW() + (${opts.ttlMs} * INTERVAL '1 millisecond'),
      NOW()
    )
    ON CONFLICT (action_key) DO UPDATE
    SET holder_id = EXCLUDED.holder_id,
        fencing_token = atlas_action_leases.fencing_token + 1,
        acquired_at = NOW(),
        expires_at = EXCLUDED.expires_at,
        updated_at = NOW()
    WHERE atlas_action_leases.expires_at <= NOW()
    RETURNING action_key, holder_id, fencing_token, expires_at
  `);

  const row = rows.rows?.[0] as Record<string, unknown> | undefined;
  return row ? parseLeaseRow(row) : null;
}

export async function renewActionLease(opts: {
  actionKey: string;
  holderId: string;
  fencingToken: bigint;
  ttlMs: number;
}): Promise<ActionLeaseV1 | null> {
  if (!Number.isInteger(opts.ttlMs) || opts.ttlMs <= 0) {
    throw new Error('ttlMs must be a positive integer');
  }

  const rows = await db.execute(sql`
    UPDATE atlas_action_leases
    SET expires_at = NOW() + (${opts.ttlMs} * INTERVAL '1 millisecond'),
        updated_at = NOW()
    WHERE action_key = ${opts.actionKey}
      AND holder_id = ${opts.holderId}
      AND fencing_token = ${opts.fencingToken.toString()}::bigint
      AND expires_at > NOW()
    RETURNING action_key, holder_id, fencing_token, expires_at
  `);

  const row = rows.rows?.[0] as Record<string, unknown> | undefined;
  return row ? parseLeaseRow(row) : null;
}

export async function releaseActionLease(opts: {
  actionKey: string;
  holderId: string;
  fencingToken: bigint;
}): Promise<boolean> {
  const rows = await db.execute(sql`
    DELETE FROM atlas_action_leases
    WHERE action_key = ${opts.actionKey}
      AND holder_id = ${opts.holderId}
      AND fencing_token = ${opts.fencingToken.toString()}::bigint
    RETURNING action_key
  `);

  return (rows.rows?.length ?? 0) === 1;
}
