#!/usr/bin/env node
/**
 * S01-08H apply — authorized by the operator's exact typed token for this gate. Applies the frozen
 * DDL (docs/reports/stable-file-schema-ddl-v1.sql) inside ONE bounded transaction: re-verify the
 * frozen checksums, pre-apply collision check, execute, catalog readback against the frozen
 * manifest's expectations, COMMIT only if everything matches. Any mismatch -> ROLLBACK.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const APPLY_TOKEN = 'apply S01-08H stable file schema';
const suppliedToken = process.argv.slice(2).join(' ');
if (suppliedToken !== APPLY_TOKEN) { console.error(`Refusing to run: exact apply token required, got ${JSON.stringify(suppliedToken)}`); process.exit(2); }

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCHEMA = 'atlas.stable-file-schema-apply.v1';
const ddlPath = path.join(root, 'docs/reports/stable-file-schema-ddl-v1.sql');
const rollbackPath = path.join(root, 'docs/reports/stable-file-schema-rollback-v1.sql');
const manifestPath = path.join(root, 'docs/reports/stable-file-schema-apply-manifest-v1.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

const ddlText = fs.readFileSync(ddlPath, 'utf8');
const rollbackText = fs.readFileSync(rollbackPath, 'utf8');
const ddlChecksumNow = 'sha256:' + crypto.createHash('sha256').update(ddlText).digest('hex');
const rollbackChecksumNow = 'sha256:' + crypto.createHash('sha256').update(rollbackText).digest('hex');
if (ddlChecksumNow !== manifest.ddlChecksum || rollbackChecksumNow !== manifest.rollbackChecksum) {
  console.error('Checksum mismatch between frozen manifest and current files; refusing to apply');
  process.exit(2);
}

const DATABASE_URL = resolveDatabaseUrl(loadRepoEnv(process.env));
const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
const client = await pool.connect();
const report = { schema: SCHEMA, generatedAt: new Date().toISOString(), ddlChecksum: ddlChecksumNow, manifestFile: 'docs/reports/stable-file-schema-apply-manifest-v1.json', status: 'PENDING', reasons: [] };

try {
  await client.query('BEGIN');

  const pre = await client.query(`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_name = ANY($1::text[])`, [manifest.expectedTables]);
  if (pre.rows.length > 0) throw new Error(`Pre-apply collision: ${pre.rows.map((r) => r.table_name).join(', ')} already exist`);

  await client.query(ddlText);

  const readback = {};
  for (const table of manifest.expectedTables) {
    const cols = (await client.query(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 ORDER BY ordinal_position`, [table])).rows.map((r) => r.column_name);
    const rowCount = (await client.query(`SELECT count(*)::int AS n FROM ${table}`)).rows[0].n;
    const constraints = (await client.query(`SELECT conname, contype, pg_get_constraintdef(oid) AS def FROM pg_constraint WHERE conrelid = $1::regclass`, [table])).rows;
    readback[table] = { columns: cols, rowCount, constraints };
  }

  const missingTable = manifest.expectedTables.filter((t) => !readback[t] || readback[t].columns.length === 0);
  const nonEmptyTable = manifest.expectedTables.filter((t) => readback[t]?.rowCount !== 0);
  const expectedColumnsMismatch = manifest.expectedTables.filter((t) => {
    const got = new Set(readback[t]?.columns ?? []);
    return !manifest.expectedColumns[t].every((c) => got.has(c));
  });
  const fkCount = Object.values(readback).reduce((n, t) => n + t.constraints.filter((c) => c.contype === 'f').length, 0);
  const expectedFkCount = manifest.expectedFKs.length;

  const invariants = {
    fourTablesCreated: manifest.expectedTables.every((t) => readback[t]),
    zeroCollisions: pre.rows.length === 0,
    zeroMissingColumns: missingTable.length === 0 && expectedColumnsMismatch.length === 0,
    allTablesEmpty: nonEmptyTable.length === 0,
    fkCountMatches: fkCount === expectedFkCount,
  };
  const allHold = Object.values(invariants).every(Boolean);
  if (!allHold) throw new Error(`SCHEMA_APPLY_INVARIANT_FAILURE: ${JSON.stringify(invariants)}`);

  await client.query('COMMIT');
  report.status = 'SCHEMA_APPLIED';
  report.invariants = invariants;
  report.readback = Object.fromEntries(Object.entries(readback).map(([t, v]) => [t, { columnCount: v.columns.length, rowCount: v.rowCount, constraintCount: v.constraints.length }]));
  report.fkCount = fkCount;
} catch (err) {
  await client.query('ROLLBACK').catch(() => {});
  report.status = 'SCHEMA_APPLY_ABORTED';
  report.reasons.push(String(err && err.message ? err.message : err));
} finally {
  client.release();
}

if (report.status === 'SCHEMA_APPLIED') {
  const post = await pool.query(`SELECT table_name, (SELECT count(*) FROM information_schema.columns c WHERE c.table_name = t.table_name)::int AS col_count FROM information_schema.tables t WHERE table_schema='public' AND table_name = ANY($1::text[])`, [manifest.expectedTables]);
  report.independentPostTransactionReadback = post.rows;
}

const body = JSON.stringify(report, null, 2);
const sha12 = crypto.createHash('sha256').update(body).digest('hex').slice(0, 12);
fs.writeFileSync(path.join(root, 'docs/reports', `stable-file-schema-apply-v1.${sha12}.json`), body + '\n', { flag: 'wx' });
fs.writeFileSync(path.join(root, 'docs/reports/stable-file-schema-apply-v1.json'), body + '\n');
console.log(report.status, JSON.stringify(report.invariants ?? report.reasons));
await pool.end();
if (report.status !== 'SCHEMA_APPLIED') process.exit(1);
