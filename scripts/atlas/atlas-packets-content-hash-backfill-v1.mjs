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
 *   --apply-bounded  UPDATE atlas_packets SET content_hash = ... WHERE content_hash IS NULL
 *                     for the frozen selection only. Idempotent (NULL guard). Fails
 *                     closed unless all prior gates pass.
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
const LIMIT = Math.max(1, Math.min(20000, Number(args.get('limit') ?? 1000)));

const RECEIPT_PATH = path.join(REPO_ROOT, `docs/reports/atlas-packets-content-hash-backfill-v1-${MODE.toLowerCase()}.json`);

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

function assertLocalNonProductionDatabase(value) {
  const url = new URL(value);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (url.hostname !== '127.0.0.1' || url.port !== '5434' || database !== 'legal_ai_db') {
    throw new Error(`NON_PRODUCTION_DATABASE_REQUIRED:${url.hostname}:${url.port}:${database}`);
  }
}

const env = loadRepoEnv(process.env);
const databaseUrl = resolveDatabaseUrl(env);
if (MODE === 'APPLY_BOUNDED') {
  if (env.ATLAS_AUTHORIZE_ATLAS_PACKETS_CONTENT_HASH_BACKFILL !== '1') {
    throw new Error('EXPLICIT_ATLAS_PACKETS_CONTENT_HASH_BACKFILL_AUTHORIZATION_REQUIRED');
  }
  assertLocalNonProductionDatabase(databaseUrl);
}
const pool = new pg.Pool({
  connectionString: databaseUrl,
  max: 1,
  connectionTimeoutMillis: 5000,
  statement_timeout: 60000,
});

let allGatesPass = true;

try {
  // ---- CH_BF_01 DATABASE_CONTEXT_PROVEN ----
  const ctx = await pool.query(`
    SELECT current_database() AS database_name, current_user AS current_user,
           current_schema() AS current_schema
  `);
  const bf01 = gate('CH_BF_01', 'DATABASE_CONTEXT_PROVEN', true, { live: ctx.rows[0] });
  allGatesPass &&= bf01;

  // ---- CH_BF_02 UNAMBIGUOUS_SELECTION_DETERMINISTIC ----
  // Same classification query as audit-atlas-packets-content-hash-source.mjs:
  // exactly one distinct codebase_chunk_index.content_hash per packet source_ref,
  // and the packet does not already have a content_hash (idempotent scope).
  const selectionRes = await pool.query(`
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
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
        const lockDigest = crypto.createHash('sha256')
          .update('atlas.atlas-packets-content-hash-backfill-v1', 'utf8')
          .digest();
        const lockResult = await client.query(
          'SELECT pg_try_advisory_xact_lock($1, $2) AS acquired',
          [lockDigest.readInt32BE(0), lockDigest.readInt32BE(4)],
        );
        if (lockResult.rows[0]?.acquired !== true) {
          throw new Error('ATLAS_PACKETS_CONTENT_HASH_BACKFILL_LOCK_NOT_ACQUIRED');
        }
        let updated = 0, alreadyPopulated = 0;
        for (const row of selection) {
          const res = await client.query(
            `UPDATE atlas_packets SET content_hash = $1, updated_at = now()
             WHERE packet_key = $2 AND content_hash IS NULL`,
            [row.candidate_content_hash, row.packet_key],
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
           WHERE p.packet_key = ANY($1::text[])
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
        gate('CH_BF_04', 'INDEPENDENT_READBACK_PROVEN', readbackMismatches.length === 0, {
          expected: selection.length, actual: readbackMatched, mismatches: readbackMismatches,
        });
        if (readbackMismatches.length > 0 || readback.rows.length !== selection.length) {
          throw new Error('ATLAS_PACKETS_CONTENT_HASH_BACKFILL_READBACK_FAILED');
        }
        await client.query('COMMIT');
        receipt.postgresWrites = updated > 0;
      } catch (err) {
        await client.query('ROLLBACK');
        throw err;
      } finally {
        client.release();
      }
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
    const secondPass = await pool.query(`
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
  postgresWrites: receipt.postgresWrites,
  receiptPath: path.relative(REPO_ROOT, RECEIPT_PATH).replaceAll('\\', '/'),
}, null, 2));
