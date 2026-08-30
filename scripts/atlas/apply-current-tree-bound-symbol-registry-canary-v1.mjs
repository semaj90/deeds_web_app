#!/usr/bin/env node

/**
 * Apply the reviewed five-row stable-symbol canary and verify readback.
 * This file is intentionally inert unless both --apply and the dedicated
 * authorization flag are supplied.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import dotenv from 'dotenv';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: path.resolve(root, 'sveltekit-frontend/.env') });
dotenv.config({ path: path.resolve(root, 'sveltekit-frontend/.env.local'), override: true });

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const authorized = process.env.ATLAS_AUTHORIZE_SYMBOL_REGISTRY_CANARY === '1';
const inputPath = path.resolve(root, '.tmp/atlas/current-tree-bound-symbol-registry-canary-v1.ndjson');
const reportPath = path.resolve(root, 'docs/reports/current-tree-bound-symbol-registry-canary-apply-v1.json');
const connectionString = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const digest = (value) => `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;

function assertLocalNonProductionDatabase(value) {
  const url = new URL(value);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (url.hostname !== '127.0.0.1' || url.port !== '5434' || database !== 'legal_ai_db') {
    throw new Error(`NON_PRODUCTION_DATABASE_REQUIRED:${url.hostname}:${url.port}:${database}`);
  }
}

const raw = await fs.readFile(inputPath, 'utf8');
const rows = raw.split(/\r?\n/).filter(Boolean).map(JSON.parse);
if (rows.length !== 5) throw new Error(`EXPECTED_FIVE_CANARY_ROWS:${rows.length}`);
if (rows.some((row) => row.promotionAuthorized !== false || row.writes !== false)) throw new Error('CANARY_INPUT_NOT_REVIEW_ONLY');

const report = {
  schema: 'atlas.current-tree-bound-symbol-registry-canary-apply.v1',
  gate: 'GRAPH-RESOLVE-06B.3',
  mode: apply ? 'APPLY' : 'DRY_RUN',
  authorization: {
    requiredFlag: 'ATLAS_AUTHORIZE_SYMBOL_REGISTRY_CANARY=1',
    provided: authorized,
    explicitApplyFlag: apply,
  },
  inputPath: path.relative(root, inputPath).replaceAll('\\', '/'),
  inputChecksum: digest(raw),
  selectedRowCount: rows.length,
  attempted: 0,
  inserted: 0,
  alreadyPresent: 0,
  readback: 0,
  mismatches: [],
  databaseWrites: false,
  symbolVersionWrites: 0,
  edgeWrites: 0,
  readOnly: !apply,
  lockAcquired: null,
};

// Transaction-scoped advisory lock (auto-releases on COMMIT/ROLLBACK) so a second concurrent
// invocation of this exact canary lane fails fast instead of racing the insert+readback against
// this run. The insert itself is idempotent (ON CONFLICT DO NOTHING), so concurrency can't
// corrupt data -- but without the lock, a concurrent run's commit landing between our INSERT and
// our readback SELECT could make the mismatch check observe writes from a different transaction
// under default READ COMMITTED semantics. REPEATABLE READ pins the whole transaction to one
// snapshot so the readback can only ever see this run's own writes.
const lockNameDigest = createHash('sha256')
  .update('atlas.symbol-registry-canary.GRAPH-RESOLVE-06B.3', 'utf8')
  .digest();
const lockKey1 = lockNameDigest.readInt32BE(0);
const lockKey2 = lockNameDigest.readInt32BE(4);

if (!apply) {
  report.status = 'DRY_RUN_READY';
  report.nextGate = 'SET_EXPLICIT_AUTHORIZATION_AND_USE_APPLY';
  await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report, null, 2));
  process.exit(0);
}
if (!authorized) throw new Error('EXPLICIT_SYMBOL_REGISTRY_CANARY_AUTHORIZATION_REQUIRED');
assertLocalNonProductionDatabase(connectionString);

const pool = new pg.Pool({ connectionString });
try {
  await pool.query('BEGIN');
  await pool.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
  const lockResult = await pool.query('SELECT pg_try_advisory_xact_lock($1, $2) AS acquired', [lockKey1, lockKey2]);
  report.lockAcquired = lockResult.rows[0].acquired === true;
  if (!report.lockAcquired) throw new Error('SYMBOL_REGISTRY_CANARY_LOCK_NOT_ACQUIRED_CONCURRENT_RUN_IN_PROGRESS');
  for (const row of rows) {
    report.attempted += 1;
    const result = await pool.query(
      `INSERT INTO public.atlas_symbol_registry
        (stable_symbol_id, canonical_key, language, symbol_kind,
         canonical_name, canonical_qualified_name, created_from_nomination_id,
         created_from_source_ref, created_from_source_revision, registry_revision, status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'active')
       ON CONFLICT (canonical_key) DO NOTHING
       RETURNING stable_symbol_id`,
      [row.stable_symbol_id, row.symbol_key, row.language, row.kind, row.name,
        row.qualified_name, row.nomination_id, row.source_ref, row.source_revision,
        'atlas-current-tree-bound-symbol-canary-v1'],
    );
    if (result.rowCount > 0) report.inserted += 1;
    else report.alreadyPresent += 1;
  }
  const keys = rows.map((row) => row.symbol_key);
  const readback = await pool.query(
    `SELECT stable_symbol_id, canonical_key, language, symbol_kind,
            canonical_name, canonical_qualified_name, created_from_nomination_id,
            created_from_source_ref, created_from_source_revision, registry_revision, status
       FROM public.atlas_symbol_registry
      WHERE canonical_key = ANY($1::text[])
      ORDER BY canonical_key`,
    [keys],
  );
  report.readback = readback.rowCount;
  const actualByKey = new Map(readback.rows.map((row) => [row.canonical_key, row]));
  for (const row of rows) {
    const actual = actualByKey.get(row.symbol_key);
    if (!actual || actual.stable_symbol_id !== row.stable_symbol_id || actual.canonical_key !== row.symbol_key || actual.language !== row.language || actual.symbol_kind !== row.kind || actual.canonical_name !== row.name || actual.canonical_qualified_name !== row.qualified_name || actual.created_from_nomination_id !== row.nomination_id || actual.created_from_source_ref !== row.source_ref || actual.created_from_source_revision !== row.source_revision || actual.registry_revision !== 'atlas-current-tree-bound-symbol-canary-v1' || actual.status !== 'active') {
      report.mismatches.push({ canonicalKey: row.symbol_key, reason: !actual ? 'READBACK_MISSING' : 'READBACK_FIELD_MISMATCH' });
    }
  }
  if (report.mismatches.length > 0 || report.readback !== rows.length) throw new Error('SYMBOL_REGISTRY_CANARY_READBACK_FAILED');
  await pool.query('COMMIT');
  report.databaseWrites = true;
  report.readOnly = false;
  report.status = 'CANARY_APPLIED_AND_READBACK_PROVEN';
  report.nextGate = 'MATERIALIZE_SYMBOL_VERSIONS_CANARY';
} catch (error) {
  await pool.query('ROLLBACK');
  report.status = 'APPLY_ROLLED_BACK';
  report.error = error.message;
  report.databaseWrites = false;
  process.exitCode = 1;
} finally {
  await pool.end();
}

await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
