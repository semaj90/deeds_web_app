#!/usr/bin/env node

import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { loadAtlasEnv } from './load-atlas-env.mjs';

loadAtlasEnv();

const { db, closeConnections } = await import('../../src/lib/server/db/client.js');
const {
  claimActionWork,
  completeActionWork,
  expireActionLease,
} = await import('../../src/lib/server/queue/action-single-flight-v1.js');

const proofId = randomUUID();
const artifact = {
  schema: 'atlas.artifact-address.v1' as const,
  artifactId: `artifact:single-flight-proof:${proofId}`,
  artifactHash: `sha256:${'a'.repeat(64)}`,
  schemaId: 'atlas.single-flight-proof.v1',
  checksum: `sha256:${'b'.repeat(64)}`,
  revisionSetHash: `revision-set:${proofId}`,
  revisions: { producer: 'single-flight-proof:v1' },
  locator: {
    storage: 'POSTGRES' as const,
    table: 'workflow_artifacts',
    primaryKey: `artifact:single-flight-proof:${proofId}`,
  },
};

const report = {
  schema: 'atlas.action-single-flight-live-proof.v1',
  proofId,
  contention: {
    firstClaim: null as string | null,
    secondClaim: null as string | null,
    busyOwnerPrevented: false,
  },
  receipt: {
    completed: false,
    replayReturnedReceipt: false,
    sameArtifact: false,
    durableRowCount: -1,
  },
  staleFence: {
    replacementClaimed: false,
    staleCompletionRejected: false,
    freshCompletionSucceeded: false,
  },
  status: 'ACTION_SINGLE_FLIGHT_NOT_PROVEN',
};

try {
  const actionKey = `queue-single-flight-proof:${proofId}`;
  const first = await claimActionWork({ actionKey, leaseOwner: 'proof-worker-a', leaseMs: 30_000 });
  const second = await claimActionWork({ actionKey, leaseOwner: 'proof-worker-b', leaseMs: 30_000 });
  report.contention.firstClaim = first.kind;
  report.contention.secondClaim = second.kind;
  report.contention.busyOwnerPrevented = first.kind === 'lease' && second.kind === 'busy';

  if (first.kind !== 'lease') throw new Error(`expected first lease, got ${first.kind}`);
  const completed = await completeActionWork({
    actionKey,
    leaseOwner: first.lease.leaseOwner,
    fencingToken: first.lease.fencingToken,
    outputArtifact: artifact,
    producerRevision: 'single-flight-proof:v1',
  });
  const replay = await claimActionWork({ actionKey, leaseOwner: 'proof-worker-c', leaseMs: 30_000 });
  const receiptRows = await db.execute<{ count: string | number | bigint }>(sql`
    SELECT COUNT(*) AS count
    FROM workflow_action_receipts
    WHERE action_key = ${actionKey}
  `);
  report.receipt.completed = completed.actionKey === actionKey;
  report.receipt.replayReturnedReceipt = replay.kind === 'receipt';
  report.receipt.sameArtifact = replay.kind === 'receipt' &&
    replay.receipt.outputArtifact.artifactId === artifact.artifactId &&
    replay.receipt.fencingToken === completed.fencingToken;
  report.receipt.durableRowCount = Number(receiptRows.rows?.[0]?.count ?? -1);

  const staleActionKey = `queue-single-flight-stale-proof:${proofId}`;
  const stale = await claimActionWork({ actionKey: staleActionKey, leaseOwner: 'proof-worker-stale', leaseMs: 30_000 });
  if (stale.kind !== 'lease') throw new Error(`expected stale proof lease, got ${stale.kind}`);
  await expireActionLease({
    actionKey: staleActionKey,
    leaseOwner: stale.lease.leaseOwner,
    fencingToken: stale.lease.fencingToken,
  });
  const replacement = await claimActionWork({ actionKey: staleActionKey, leaseOwner: 'proof-worker-fresh', leaseMs: 30_000 });
  report.staleFence.replacementClaimed = replacement.kind === 'lease' &&
    replacement.lease.fencingToken !== stale.lease.fencingToken;

  try {
    await completeActionWork({
      actionKey: staleActionKey,
      leaseOwner: stale.lease.leaseOwner,
      fencingToken: stale.lease.fencingToken,
      outputArtifact: artifact,
      producerRevision: 'single-flight-proof:v1',
    });
  } catch (error) {
    report.staleFence.staleCompletionRejected = error instanceof Error &&
      error.message.includes('STALE_ACTION_FENCE');
  }

  if (replacement.kind === 'lease') {
    const fresh = await completeActionWork({
      actionKey: staleActionKey,
      leaseOwner: replacement.lease.leaseOwner,
      fencingToken: replacement.lease.fencingToken,
      outputArtifact: artifact,
      producerRevision: 'single-flight-proof:v1',
    });
    report.staleFence.freshCompletionSucceeded = fresh.actionKey === staleActionKey;
  }

  const proven = report.contention.busyOwnerPrevented &&
    report.receipt.completed &&
    report.receipt.replayReturnedReceipt &&
    report.receipt.sameArtifact &&
    report.receipt.durableRowCount === 1 &&
    report.staleFence.replacementClaimed &&
    report.staleFence.staleCompletionRejected &&
    report.staleFence.freshCompletionSucceeded;
  report.status = proven ? 'ACTION_SINGLE_FLIGHT_PROVEN' : 'ACTION_SINGLE_FLIGHT_NOT_PROVEN';
  console.log(JSON.stringify(report, null, 2));
  if (!proven) process.exitCode = 1;
} finally {
  await closeConnections();
}
