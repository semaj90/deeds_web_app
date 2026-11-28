#!/usr/bin/env node
/**
 * ContentHashBackfillV1 — gated, fail-closed backfill of `atlas_packets.content_hash`
 * for the ONE provably-safe subset: packets whose `source_ref` maps to exactly one
 * distinct `codebase_chunk_index.content_hash` value (single-chunk files).
 *
 * Why this subset only: `codebase_chunk_index.content_hash` is the fixed join target
 * of packages/parent-atlas-runtime/src/adapters/postgres-fts.adapter.ts's exact
 * (source_ref, content_hash) join. It is the only hash value that can ever bind that
 * join. Packets whose source_ref maps to MULTIPLE distinct chunk hashes (multi-chunk
 * files) cannot be represented by a single scalar content_hash without an operator
 * decision on packet/chunk granularity — this script does not attempt that and never
 * touches those rows. See scripts/atlas/audit-atlas-packets-content-hash-source.mjs
 * for the full hash-authority audit this backfill is scoped from.
 *
 * Modes:
 *   --dry-run       (default) select + report, write zero rows.
 *   --apply-bounded  Update only the disposable CH_BF_06 fixture using the explicit
 *                     ATLAS_CH_BF_06_DATABASE_URL and authorization environment variables.
 *   --replay         re-run selection, verify checksum matches the prior apply and a
 *                     second apply changes zero additional rows.
 *   --limit=N         bounded selection size (default 1000, larger than the ~332-row
 *                     eligible set so no artificial truncation occurs on first run).
 *
 * Never touches Qdrant/Neo4j/Redis. Postgres writes happen only in --apply-bounded
 * mode, only for rows in the frozen, unambiguous selection.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, ...rest] = arg.replace(/^--/, '').split('=');
  return [key, rest.join('=') || 'true'];
}));
const MODE = args.has('apply-bounded') ? 'APPLY_BOUNDED' : args.has('replay') ? 'REPLAY' : 'DRY_RUN';
const LIMIT = Number(args.get('limit') ?? (MODE === 'APPLY_BOUNDED' ? 9 : 1000));
const MAX_LIMIT = MODE === 'APPLY_BOUNDED' ? 9 : 20000;
if (!Number.isSafeInteger(LIMIT) || LIMIT < 1 || LIMIT > MAX_LIMIT) {
  throw new Error('ATLAS_PACKETS_CONTENT_HASH_BACKFILL_INVALID_LIMIT');
}

const RECEIPT_PATH = path.join(REPO_ROOT, MODE === 'APPLY_BOUNDED'
  ? '.tmp/review/atlas-packets-content-hash-backfill-ch-bf-06-apply.json'
  : `docs/reports/atlas-packets-content-hash-backfill-v1-${MODE.toLowerCase()}.json`);

const receipt = {
  schema: 'atlas.atlas-packets-content-hash-backfill.v1',
  generatedAt: new Date().toISOString(),
  mode: MODE,
  limit: LIMIT,
  status: 'UNKNOWN',
  gates: {},
  selectionChecksum: null,
  counts: { selected: 0, updated: 0, alreadyPopulated: 0, readbackMatched: 0 },
  replay: { attempted: false, selectionChecksumMatch: null, secondApplyChangedRows: null },
  postgresWrites: false,
  qdrantWrites: false,
  neo4jWrites: false,
  valkeyWrites: false,
};

function gate(id, name, proven, detail) {
  receipt.gates[id] = { name, proven, ...detail };
  return proven;
}

const FIXTURE_NAME = 'atlas_ch_bf_06_fixture';

function assertDisposableFixtureUrl(value) {
  if (!value) throw new Error('EXPLICIT_CH_BF_06_FIXTURE_DATABASE_URL_REQUIRED');
  const url = new URL(value);
  if (url.protocol !== 'postgresql:' || url.hostname !== '127.0.0.1' || url.port !== '55434'
      || url.pathname !== `/${FIXTURE_NAME}` || url.username !== FIXTURE_NAME
      || url.search || url.hash) {
    throw new Error('CH_BF_06_DISPOSABLE_FIXTURE_REQUIRED');
  }
}

let databaseUrl;
if (MODE === 'APPLY_BOUNDED') {
  if (process.env.ATLAS_AUTHORIZE_ATLAS_PACKETS_CONTENT_HASH_BACKFILL !== '1') {
    throw new Error('EXPLICIT_ATLAS_PACKETS_CONTENT_HASH_BACKFILL_AUTHORIZATION_REQUIRED');
  }
  databaseUrl = process.env.ATLAS_CH_BF_06_DATABASE_URL;
  assertDisposableFixtureUrl(databaseUrl);
} else {
  databaseUrl = resolveDatabaseUrl(loadRepoEnv(process.env));
}
const pool = new pg.Pool({
  connectionString: databaseUrl,
  max: 1,
  connectionTimeoutMillis: 5000,
  statement_timeout: 60000,
});

let allGatesPass = true;
let client;
let transactionOpen = false;

try {
  client = await pool.connect();
  const applying = MODE === 'APPLY_BOUNDED';
  await client.query(applying ? 'BEGIN ISOLATION LEVEL REPEATABLE READ' : 'BEGIN READ ONLY');
  transactionOpen = true;
  // ---- CH_BF_01 DATABASE_CONTEXT_PROVEN ----
  const ctx = await client.query(`
    SELECT current_database() AS database_name, current_user AS current_user,
           current_schema() AS current_schema,
           current_setting('transaction_isolation') AS transaction_isolation
  `);
  if (applying) {
    const live = ctx.rows[0];
    if (live.database_name !== FIXTURE_NAME || live.current_user !== FIXTURE_NAME
        || live.transaction_isolation !== 'repeatable read') {
      throw new Error('CH_BF_06_FIXTURE_IDENTITY_OR_ISOLATION_MISMATCH');
    }
    const lockDigest = crypto.createHash('sha256')
      .update('atlas.atlas-packets-content-hash-backfill-v1', 'utf8').digest();
    const lockResult = await client.query('SELECT pg_try_advisory_xact_lock($1, $2) AS acquired',
      [lockDigest.readInt32BE(0), lockDigest.readInt32BE(4)]);
    receipt.transaction = { isolation: live.transaction_isolation, advisoryLockAcquired: lockResult.rows[0]?.acquired === true, committed: false, rolledBack: false };
    if (!receipt.transaction.advisoryLockAcquired) {
      throw new Error('ATLAS_PACKETS_CONTENT_HASH_BACKFILL_LOCK_NOT_ACQUIRED');
    }
  }
  const bf01 = gate('CH_BF_01', 'DATABASE_CONTEXT_PROVEN', true, { live: ctx.rows[0] });
  allGatesPass &&= bf01;

  // ---- CH_BF_02 UNAMBIGUOUS_SELECTION_DETERMINISTIC ----
  // Same classification query as audit-atlas-packets-content-hash-source.mjs:
  // exactly one distinct codebase_chunk_index.content_hash per packet source_ref,
  // and the packet does not already have a content_hash (idempotent scope).
  const selectionRes = await client.query(`
    WITH unique_matches AS (
      SELECT p.packet_key, p.source_ref,
             count(DISTINCT c.content_hash) AS distinct_chunk_hashes,
             (array_agg(DISTINCT c.content_hash))[1] AS candidate_content_hash
      FROM public.atlas_packets p
      JOIN public.codebase_chunk_index c ON c.source_ref = p.source_ref
      WHERE p.content_hash IS NULL
      GROUP BY p.packet_key, p.source_ref
    )
    SELECT packet_key, source_ref, candidate_content_hash
    FROM unique_matches
    WHERE distinct_chunk_hashes = 1
    ORDER BY packet_key
    LIMIT $1
  `, [LIMIT]);
  const selection = selectionRes.rows;
  const selectionChecksum = crypto.createHash('sha256')
    .update(selection.map((r) => `${r.packet_key}:${r.candidate_content_hash}`).join('\n'), 'utf8')
    .digest('hex');
  receipt.selectionChecksum = selectionChecksum;
  receipt.counts.selected = selection.length;
  const bf02 = gate('CH_BF_02', 'UNAMBIGUOUS_SELECTION_DETERMINISTIC', selection.length > 0, {
    orderBy: ['packet_key'],
    selectedCount: selection.length,
    requestedLimit: LIMIT,
    selectionChecksum,
    joinDefinition: 'atlas_packets.source_ref = codebase_chunk_index.source_ref, ' +
      'count(DISTINCT codebase_chunk_index.content_hash) = 1, atlas_packets.content_hash IS NULL',
  });
  allGatesPass &&= bf02;

  // ---- CH_BF_03/04: only meaningful in APPLY_BOUNDED / REPLAY ----
  if (MODE === 'APPLY_BOUNDED') {
    if (!allGatesPass) {
      gate('CH_BF_03', 'UPDATE_ONLY_APPLY_PROVEN', false, {
        attempted: false,
        reason: 'BLOCKED_BY_PRIOR_GATE',
        blockingGates: Object.entries(receipt.gates).filter(([, g]) => !g.proven).map(([id]) => id),
      });
      gate('CH_BF_04', 'INDEPENDENT_READBACK_PROVEN', false, { attempted: false, reason: 'BLOCKED_BY_PRIOR_GATE' });
    } else {
      let updated = 0, alreadyPopulated = 0;
      for (const row of selection) {
        const res = await client.query(
          `UPDATE public.atlas_packets SET content_hash = $1, updated_at = now()
           WHERE packet_key = $2 AND source_ref = $3 AND content_hash IS NULL`,
          [row.candidate_content_hash, row.packet_key, row.source_ref],
        );
        if (res.rowCount > 0) { updated++; }
        else { alreadyPopulated++; }
      }
      receipt.counts.updated = updated;
      receipt.counts.alreadyPopulated = alreadyPopulated;
      gate('CH_BF_03', 'UPDATE_ONLY_APPLY_PROVEN', true, { updated, alreadyPopulated });

      // Read back the complete frozen selection before COMMIT. Any mismatch throws,
      // causing the surrounding transaction to roll back all updates.
      const readback = await client.query(
        `SELECT p.packet_key, p.source_ref, p.content_hash, c.content_hash AS expected
         FROM public.atlas_packets p
         JOIN public.codebase_chunk_index c ON c.source_ref = p.source_ref
         WHERE p.packet_key = ANY($1::text[]) AND c.content_hash IS NOT NULL
         GROUP BY p.packet_key, p.source_ref, p.content_hash, c.content_hash`,
        [selection.map((row) => row.packet_key)],
      );
      const actualByKey = new Map(readback.rows.map((row) => [row.packet_key, row]));
      const readbackMismatches = selection
        .filter((row) => {
          const actual = actualByKey.get(row.packet_key);
          return !actual || actual.source_ref !== row.source_ref || actual.content_hash !== row.candidate_content_hash || actual.expected !== row.candidate_content_hash;
        })
        .map((row) => row.packet_key);
      const readbackMatched = selection.length - readbackMismatches.length;
      receipt.counts.readbackMatched = readbackMatched;
      const allRowsMatch = readbackMismatches.length === 0 && readback.rows.length === selection.length;
      gate('CH_BF_04', 'PRECOMMIT_READBACK_PROVEN', allRowsMatch, {
        expected: selection.length, actual: readbackMatched, rowsRead: readback.rows.length, mismatches: readbackMismatches,
      });
      if (!allRowsMatch) {
        throw new Error('ATLAS_PACKETS_CONTENT_HASH_BACKFILL_READBACK_FAILED');
      }
      await client.query('COMMIT');
      transactionOpen = false;
      receipt.transaction.committed = true;
      receipt.postgresWrites = updated > 0;
    }
  } else {
    gate('CH_BF_03', 'UPDATE_ONLY_APPLY_PROVEN', null, { attempted: false, reason: `SKIPPED_${MODE}` });
    gate('CH_BF_04', 'INDEPENDENT_READBACK_PROVEN', null, { attempted: false, reason: `SKIPPED_${MODE}` });
  }

  // ---- CH_BF_05 IDEMPOTENT_REPLAY_PROVEN ----
  if (MODE === 'REPLAY') {
    receipt.replay.attempted = true;
    let priorReceipt = null;
    const priorPath = path.join(REPO_ROOT, 'docs/reports/atlas-packets-content-hash-backfill-v1-apply_bounded.json');
    try { priorReceipt = JSON.parse(fs.readFileSync(priorPath, 'utf8')); } catch { /* no prior apply yet */ }

    // A second apply-bounded pass should update zero additional rows because the
    // WHERE content_hash IS NULL guard excludes everything already backfilled.
    const secondPass = await client.query(`
      WITH unique_matches AS (
        SELECT p.packet_key,
               count(DISTINCT c.content_hash) AS distinct_chunk_hashes
        FROM public.atlas_packets p
        JOIN public.codebase_chunk_index c ON c.source_ref = p.source_ref
        WHERE p.content_hash IS NULL
        GROUP BY p.packet_key
      )
      SELECT count(*)::int AS n FROM unique_matches WHERE distinct_chunk_hashes = 1
    `);
    const remainingEligible = Number(secondPass.rows[0].n);
    receipt.replay.secondApplyChangedRows = remainingEligible;
    const selectionChecksumMatch = priorReceipt?.selectionChecksum === selectionChecksum;
    receipt.replay.selectionChecksumMatch = priorReceipt ? selectionChecksumMatch : null;
    gate('CH_BF_05', 'IDEMPOTENT_REPLAY_PROVEN', priorReceipt ? remainingEligible === 0 : null, {
      priorReceiptPath: priorReceipt ? path.relative(REPO_ROOT, priorPath).replaceAll('\\', '/') : null,
      remainingEligibleAfterApply: remainingEligible,
      reason: priorReceipt ? undefined : 'NO_PRIOR_APPLY_BOUNDED_RECEIPT_TO_REPLAY_AGAINST',
      note: 'remainingEligibleAfterApply counts packets still matching the same unambiguous-selection ' +
        'criteria with content_hash still NULL. Zero means the prior apply was complete for the frozen ' +
        'selection at that time; a nonzero value here means NEW eligible packets appeared since (e.g. ' +
        'new codebase_chunk_index rows), not a replay failure.',
    });
  } else {
    gate('CH_BF_05', 'IDEMPOTENT_REPLAY_PROVEN', null, { attempted: false, reason: `SKIPPED_${MODE}` });
  }

  receipt.status = MODE === 'APPLY_BOUNDED'
    ? (allGatesPass && receipt.gates.CH_BF_03?.proven && receipt.gates.CH_BF_04?.proven ? 'PASS' : 'BLOCKED')
    : MODE === 'REPLAY'
      ? (receipt.gates.CH_BF_05?.proven === true ? 'PASS' : receipt.gates.CH_BF_05?.proven === null ? 'NO_PRIOR_RECEIPT' : 'DRIFTED')
      : 'DRY_RUN_COMPLETE';
} catch (error) {
  receipt.status = 'ERROR';
  receipt.error = error instanceof Error ? error.message : String(error);
} finally {
  if (transactionOpen) {
    try {
      await client.query('ROLLBACK');
      if (receipt.transaction) receipt.transaction.rolledBack = true;
    } catch {
      receipt.status = 'ERROR';
      receipt.rollbackError = 'ATLAS_PACKETS_CONTENT_HASH_BACKFILL_ROLLBACK_UNCONFIRMED';
    }
  }
  client?.release();
  await pool.end();
}

fs.mkdirSync(path.dirname(RECEIPT_PATH), { recursive: true });
fs.writeFileSync(RECEIPT_PATH, `${JSON.stringify(receipt, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  status: receipt.status,
  mode: receipt.mode,
  gates: Object.fromEntries(Object.entries(receipt.gates).map(([id, g]) => [id, g.proven])),
  counts: receipt.counts,
  replay: receipt.replay,
  transaction: receipt.transaction,
  error: receipt.error,
  postgresWrites: receipt.postgresWrites,
  receiptPath: path.relative(REPO_ROOT, RECEIPT_PATH).replaceAll('\\', '/'),
}, null, 2));
if (receipt.status === 'ERROR' || receipt.status === 'BLOCKED') process.exitCode = 2;
