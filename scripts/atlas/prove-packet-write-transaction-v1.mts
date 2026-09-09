#!/usr/bin/env -S npx tsx
/**
 * PACKET_WRITE_TRANSACTION_CONTRACT_01 -- live proof (real Postgres, disposable data only)
 *
 * Exercises executePacketWriteTransaction() (packet-write-transaction-v1.ts)
 * against the real database, using a packet_key clearly namespaced as test
 * data (`packet:test:transaction-contract:<uuid>`), never a real production
 * packet_key. Proves, in order:
 *
 *   1. ADVANCE_SOURCE_REVISION: a guarded UPDATE with optimistic concurrency,
 *      an outbox row inserted, a receipt row inserted -- all inside one
 *      transaction, then COMMIT.
 *   2. Independent post-commit readback: a SEPARATE pg client (genuinely a
 *      different connection from the pool, not the same transaction) reads
 *      atlas_packets fresh and confirms the committed sourceRevision.
 *   3. IDEMPOTENT_REPLAY: calling the exact same write again now correctly
 *      returns IDEMPOTENT_REPLAY (current state has already advanced),
 *      mutationApplied=false, no new outbox row.
 *   4. SOURCE_REVISION_CONFLICT: a stale expectedCurrentSourceRevision is
 *      correctly rejected, mutationApplied=false, no mutation, receipt still
 *      recorded (conflicts are recorded, not silently dropped).
 *
 * Cleans up all disposable rows (atlas_packets, atlas_projection_outbox,
 * atlas_packet_write_receipts) in a finally block via a real DELETE, using
 * an independent connection, regardless of pass/fail.
 *
 * Never touches semantic-packet-writer.ts or any real production packet_key.
 */
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
import { executePacketWriteTransaction, type PacketWriteTransactionResultV1 } from '../../sveltekit-frontend/src/lib/server/atlas/identity/packet-write-transaction-v1.js';
import type { QueryResult } from 'pg';

const env = loadRepoEnv(process.env);
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(env), max: 4 });

const TEST_PACKET_KEY = `packet:test:transaction-contract:${randomUUID()}`;
const results: Record<string, unknown> = { packetKey: TEST_PACKET_KEY };
let failed = false;

async function cleanup() {
  const client = await pool.connect();
  try {
    await client.query('DELETE FROM atlas_packet_write_receipts WHERE packet_key = $1', [TEST_PACKET_KEY]);
    await client.query('DELETE FROM atlas_projection_outbox WHERE $1 = ANY(changed_packet_keys)', [TEST_PACKET_KEY]);
    await client.query('DELETE FROM atlas_packets WHERE packet_key = $1', [TEST_PACKET_KEY]);
  } finally {
    client.release();
  }
}

async function main() {
  await cleanup(); // in case a prior failed run left rows behind

  // Step 0: INSERT_NEW inside one real transaction, then COMMIT. Also proves
  // aggregate_key is a stable text identity = packet_key (aggregate_id is
  // honestly redundant with event_id for this scaffold, per OUTBOX-IDENTITY-CONTRACT-01).
  const insertClient = await pool.connect();
  let step0: PacketWriteTransactionResultV1;
  try {
    await insertClient.query('BEGIN');
    step0 = await executePacketWriteTransaction(insertClient as any, {
      packetKey: TEST_PACKET_KEY,
      sourceRef: 'src/lib/server/__transaction-contract-test-fixture__.ts',
      sourceRevision: 'sha256:rev-1',
      workspaceRevision: null,
      contentDigest: null,
    });
    await insertClient.query('COMMIT');
  } catch (error) {
    await insertClient.query('ROLLBACK');
    throw error;
  } finally {
    insertClient.release();
  }
  results.step0_insertNew = {
    decision: step0.decision.decision,
    mutationApplied: step0.mutationApplied,
    outboxEventCreated: step0.outboxEventId !== null,
  };
  if (step0.decision.decision !== 'INSERT_NEW' || !step0.mutationApplied || step0.outboxEventId === null) failed = true;

  // Verify aggregate_key determinism directly: same packet_key must always
  // produce the same aggregate_key across separate outbox rows.
  const outboxRowsClient = await pool.connect();
  try {
    const outboxRows = await outboxRowsClient.query(
      `SELECT DISTINCT aggregate_key FROM atlas_projection_outbox WHERE $1 = ANY(changed_packet_keys)`,
      [TEST_PACKET_KEY],
    );
    results.step0b_aggregateKeyDeterminism = { distinctAggregateKeysSoFar: outboxRows.rows.length };
    // (Full determinism check re-verified again at the end, after steps 1-4 add more outbox rows.)
  } finally {
    outboxRowsClient.release();
  }

  // Step 1: ADVANCE_SOURCE_REVISION inside one real transaction, then COMMIT.
  const txClient = await pool.connect();
  let step1: PacketWriteTransactionResultV1;
  try {
    await txClient.query('BEGIN');
    step1 = await executePacketWriteTransaction(txClient as any, {
      packetKey: TEST_PACKET_KEY,
      sourceRef: 'src/lib/server/__transaction-contract-test-fixture__.ts',
      sourceRevision: 'sha256:rev-2',
      workspaceRevision: null,
      contentDigest: null,
      expectedCurrentSourceRevision: 'sha256:rev-1',
    });
    await txClient.query('COMMIT');
  } catch (error) {
    await txClient.query('ROLLBACK');
    throw error;
  } finally {
    txClient.release();
  }
  results.step1_advanceSourceRevision = {
    decision: step1.decision.decision,
    mutationApplied: step1.mutationApplied,
    outboxEventCreated: step1.outboxEventId !== null,
  };
  if (step1.decision.decision !== 'ADVANCE_SOURCE_REVISION' || !step1.mutationApplied || step1.outboxEventId === null) failed = true;

  // Step 2: independent readback from a genuinely separate connection.
  const readbackClient = await pool.connect();
  let readback: QueryResult;
  try {
    readback = await readbackClient.query('SELECT source_revision FROM atlas_packets WHERE packet_key = $1', [TEST_PACKET_KEY]);
  } finally {
    readbackClient.release();
  }
  results.step2_independentReadback = { sourceRevision: readback.rows[0]?.source_revision ?? null };
  if (readback.rows[0]?.source_revision !== 'sha256:rev-2') failed = true;

  // Step 3: replay the exact same write again -- current state has advanced,
  // so this must now be IDEMPOTENT_REPLAY, not ADVANCE_SOURCE_REVISION again.
  const replayClient = await pool.connect();
  let step3: PacketWriteTransactionResultV1;
  try {
    await replayClient.query('BEGIN');
    step3 = await executePacketWriteTransaction(replayClient as any, {
      packetKey: TEST_PACKET_KEY,
      sourceRef: 'src/lib/server/__transaction-contract-test-fixture__.ts',
      sourceRevision: 'sha256:rev-2',
      workspaceRevision: null,
      contentDigest: null,
      expectedCurrentSourceRevision: 'sha256:rev-1', // stale on purpose -- decidePacketWrite must ignore it since sourceRevision already matches current
    });
    await replayClient.query('COMMIT');
  } finally {
    replayClient.release();
  }
  results.step3_idempotentReplay = { decision: step3.decision.decision, mutationApplied: step3.mutationApplied };
  if (step3.decision.decision !== 'IDEMPOTENT_REPLAY' || step3.mutationApplied) failed = true;

  // Step 4: a stale expectedCurrentSourceRevision must be rejected as a real conflict.
  const conflictClient = await pool.connect();
  let step4: PacketWriteTransactionResultV1;
  try {
    await conflictClient.query('BEGIN');
    step4 = await executePacketWriteTransaction(conflictClient as any, {
      packetKey: TEST_PACKET_KEY,
      sourceRef: 'src/lib/server/__transaction-contract-test-fixture__.ts',
      sourceRevision: 'sha256:rev-3',
      workspaceRevision: null,
      contentDigest: null,
      expectedCurrentSourceRevision: 'sha256:rev-1', // genuinely stale now -- current is rev-2
    });
    await conflictClient.query('COMMIT');
  } finally {
    conflictClient.release();
  }
  results.step4_sourceRevisionConflict = { decision: step4.decision.decision, mutationApplied: step4.mutationApplied };
  if (step4.decision.decision !== 'SOURCE_REVISION_CONFLICT' || step4.mutationApplied) failed = true;

  // Final receipt count check: 4 receipts (insert, advance, replay, conflict),
  // 2 outbox rows (insert + advance -- the two mutating decisions).
  const countClient = await pool.connect();
  try {
    const receiptCount = await countClient.query('SELECT count(*)::int AS n FROM atlas_packet_write_receipts WHERE packet_key = $1', [TEST_PACKET_KEY]);
    const outboxRows = await countClient.query('SELECT aggregate_key FROM atlas_projection_outbox WHERE $1 = ANY(changed_packet_keys)', [TEST_PACKET_KEY]);
    results.receiptCount = receiptCount.rows[0].n;
    results.outboxCount = outboxRows.rows.length;
    const distinctAggregateKeys = new Set(outboxRows.rows.map((r) => r.aggregate_key));
    results.aggregateKeyDeterminismCheck = {
      outboxRowCount: outboxRows.rows.length,
      distinctAggregateKeyCount: distinctAggregateKeys.size,
      allSameAggregateKey: distinctAggregateKeys.size === 1,
    };
    if (receiptCount.rows[0].n !== 4 || outboxRows.rows.length !== 2 || distinctAggregateKeys.size !== 1) failed = true;
  } finally {
    countClient.release();
  }
}

main()
  .catch((error) => {
    failed = true;
    results.error = String(error?.stack ?? error);
  })
  .finally(async () => {
    await cleanup();
    await pool.end();
    console.log(JSON.stringify({
      status: failed ? 'PACKET_WRITE_TRANSACTION_PROOF_FAILED' : 'PACKET_WRITE_TRANSACTION_PROOF_PASSED',
      ...results,
      cleanedUp: true,
      writesPerformed: { atlas_packets: true, atlas_projection_outbox: true, atlas_packet_write_receipts: true, note: 'all disposable test rows deleted in cleanup, real corpus untouched' },
    }, null, 2));
    process.exitCode = failed ? 1 : 0;
  });
