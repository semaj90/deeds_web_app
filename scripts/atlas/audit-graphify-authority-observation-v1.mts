#!/usr/bin/env node
/**
 * S01-03 — GRAPHIFY-AUTHORITY-OBSERVATION-03. READ-ONLY, evidence-based (not a timed wait).
 * Consumes existing proofs and adds one independent fresh parity readback, then emits ONE immutable receipt:
 *   READ_PARITY_OBSERVATION_PROVEN | READ_PARITY_OBSERVATION_BLOCKED (with the exact failed criteria).
 * It does not run Graphify, apply an owner decision, change any reader, backfill, or retire the legacy boolean.
 * Refuses to overwrite an existing receipt unless --reobserve is passed (immutability).
 */
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const TSX_CLI = resolve(ROOT, 'sveltekit-frontend/node_modules/tsx/dist/cli.mjs');
const VITEST = resolve(ROOT, 'sveltekit-frontend/node_modules/vitest/vitest.mjs');
const RECEIPT = resolve(ROOT, 'docs/reports/graphify-authority-observation-v1.json');
const EXPECTED = '74d50c86-8194-45ea-8c3d-61aab737ef83';
const digest = (bytes: Buffer | string) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;
const readJson = (rel: string) => JSON.parse(readFileSync(resolve(ROOT, rel), 'utf8'));
const fileDigest = (rel: string) => digest(readFileSync(resolve(ROOT, rel)));
const argv = process.argv.slice(2);

if (existsSync(RECEIPT) && !argv.includes('--reobserve')) {
  console.log(JSON.stringify({ status: 'RECEIPT_ALREADY_EMITTED_IMMUTABLE', receipt: RECEIPT, hint: 'pass --reobserve to write a new observation' }));
  process.exit(0);
}

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 60000 });
async function fingerprint() {
  const a = await pool.query(`SELECT count(*)::int AS n, md5(coalesce(string_agg(row_to_json(a)::text, '|' ORDER BY execution_id), '')) AS h FROM public.graphify_execution_authority a`);
  const l = await pool.query(`SELECT count(*)::int AS n, md5(coalesce(string_agg(execution_id::text || ':' || workspace_revision, '|' ORDER BY execution_id), '')) AS h FROM public.graphify_executions WHERE canonical_authority IS TRUE`);
  const t = await pool.query(`SELECT count(*)::int AS n FROM public.graphify_executions`);
  return { authorityRows: a.rows[0], legacyCanonicalRows: l.rows[0], executions: t.rows[0].n };
}

// ---- evidence read BEFORE anything is re-run (the fresh parity run overwrites its own report file) ----
const APPLY_RECORD = 'docs/reports/current-graphify-execution-owner-decision-v1.json';
const before = { db: await fingerprint(), applyRecordDigest: fileDigest(APPLY_RECORD) };
const importReceiptFile = 'docs/reports/graphify-execution-authority-import-receipt-v1.json';
const importReceiptDigest = fileDigest(importReceiptFile);
// Initial parity comes from the COMMITTED version (a prior independent event), not the working file, which earlier runs of this gate overwrite.
const initialParityBytes = spawnSync('git', ['show', 'HEAD:docs/reports/graphify-authority-read-parity-v1.json'], { cwd: ROOT, maxBuffer: 64 * 1024 * 1024 }).stdout;
const initialParity = JSON.parse(initialParityBytes.toString('utf8'));
const initialParityDigest = digest(initialParityBytes);
const rehearsal = readJson('docs/reports/current-graphify-execution-owner-decision-rehearsal-v1.json');
const applyRecord = readJson(APPLY_RECORD);
const census = readJson('docs/reports/graphify-authority-reader-shadow-census-v1.json');
const authorityRow = (await pool.query(`SELECT execution_id::text AS execution_id, authority_state, import_receipt FROM public.graphify_execution_authority`)).rows;

// ---- writer convergence tests (real vitest run, per-test results) ----
const vitestOut = join(tmpdir(), `authority-observation-vitest-${process.pid}.json`);
const vitest = spawnSync(process.execPath, [VITEST, 'run', 'tests/atlas/graphify-owner-decision-v1.test.ts', '--reporter=json', `--outputFile=${vitestOut}`], { cwd: resolve(ROOT, 'sveltekit-frontend'), encoding: 'utf8', timeout: 900000, maxBuffer: 64 * 1024 * 1024 });
const vitestJson = existsSync(vitestOut) ? JSON.parse(readFileSync(vitestOut, 'utf8')) : null;
const writerTests: Array<{ title: string; status: string }> = (vitestJson?.testResults ?? []).flatMap((f: any) => f.assertionResults.map((a: any) => ({ title: a.title, status: a.status })));
const testPassed = (fragment: string) => writerTests.some((t) => t.title.includes(fragment) && t.status === 'passed');

// ---- fresh, independent parity readback (existing read-only tool; own REPEATABLE READ READ ONLY transaction) ----
const parityRun = spawnSync(process.execPath, [TSX_CLI, resolve(ROOT, 'scripts/atlas/audit-graphify-authority-read-parity-v1.mts')], { cwd: ROOT, encoding: 'utf8', timeout: 600000, maxBuffer: 64 * 1024 * 1024 });
const freshParity = readJson('docs/reports/graphify-authority-read-parity-v1.json');

// ---- static: reader-side authority-table SELECTs must live only in the one shared helper ----
const HELPER = 'sveltekit-frontend/src/lib/server/atlas/admission/graphify-authority-shadow-read-v1.ts';
const PARITY_PROOF_LOADER = 'sveltekit-frontend/src/lib/server/atlas/admission/graphify-authority-read-parity-v1.ts'; // whole-table parity comparator + its own loader (the shadow helper imports its comparator); not per-reader scoped shadow selection
const NON_SHADOW_ALLOWED = new Set([ // writers / importer / the parity proof tool itself / parity loader: not reader shadow selection
  PARITY_PROOF_LOADER,
  'scripts/atlas/apply-graphify-execution-authority-import-v1.mts', 'scripts/atlas/audit-graphify-authority-read-parity-v1.mts',
  'scripts/atlas/lib/graphify-owner-decision-v1.mjs', 'scripts/atlas/apply-current-graphify-execution-owner-decision-v1.mjs',
  'scripts/atlas/audit-graphify-authority-reader-shadow-census-v1.mts', 'scripts/atlas/audit-graphify-authority-observation-v1.mts',
]);
const walk = (dir: string, out: string[] = []) => {
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === '.svelte-kit' || name.startsWith('.tmp')) continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) walk(full, out); else if (/\.(mts|mjs|ts)$/.test(name) && !/\.(spec|test)\./.test(name)) out.push(full);
  }
  return out;
};
const selectRe = /FROM\s+public\.graphify_execution_authority\b/i;
const selectFiles = [...walk(resolve(ROOT, 'scripts/atlas')), ...walk(resolve(ROOT, 'sveltekit-frontend/src'))]
  .map((f) => relative(ROOT, f).replaceAll('\\', '/'))
  .filter((rel) => selectRe.test(readFileSync(resolve(ROOT, rel), 'utf8')));
const stray = selectFiles.filter((rel) => rel !== HELPER && !NON_SHADOW_ALLOWED.has(rel));

const after = { db: await fingerprint(), applyRecordDigest: fileDigest(APPLY_RECORD) };
await pool.end();

const nonParity = (p: any) => Object.entries(p.counts ?? {}).filter(([k, v]) => k !== 'PARITY_PROVEN' && k !== 'NO_SELECTION' && Number(v) > 0);
const importAt = new Date(JSON.parse(readFileSync(resolve(ROOT, importReceiptFile), 'utf8')).generatedAt).getTime();
const criteria = {
  IMPORT_AUTHORITY_MATCH: authorityRow.length === 1 && authorityRow[0].execution_id === EXPECTED && authorityRow[0].import_receipt === importReceiptDigest && authorityRow[0].authority_state === 'LEGACY_IMPORTED',
  WRITER_AUTHORITY_FIRST: testPassed('upserts the authority row as SELECTED with provenance, then promotes the legacy field'),
  WRITER_PROVENANCE_REQUIRED: testPassed('refuses without real selection provenance') && testPassed('never writes a NULL selected_by'),
  WRITER_ROLLBACK_REHEARSAL_PASS: rehearsal.mode === 'REHEARSAL_ROLLED_BACK' && rehearsal.writesPerformed === false && rehearsal.readbackVerified === true && rehearsal.chosenExecutionId === EXPECTED,
  WRITER_TESTS_ALL_PASSED: writerTests.length > 0 && writerTests.every((t) => t.status === 'passed') && vitest.status === 0,
  READER_SHADOW_8_OF_8: census.status === 'GRAPHIFY_AUTHORITY_READER_SHADOW_02_PROVEN' && census.readerCount === 8 && census.parityProven === 8,
  SHADOW_IMPLEMENTATION_COUNT_ONE: stray.length === 0 && selectFiles.includes(HELPER),
  INITIAL_PARITY_PROVEN: initialParity.status === 'PARITY_PROVEN' && initialParity.readParityProven === true && new Date(initialParity.generatedAt).getTime() >= importAt && nonParity(initialParity).length === 0,
  SUBSEQUENT_PARITY_PROVEN: parityRun.status === 0 && freshParity.status === 'PARITY_PROVEN' && freshParity.readParityProven === true && new Date(freshParity.generatedAt).getTime() > new Date(census.generatedAt).getTime(),
  SELECTED_EXECUTION_UNCHANGED: freshParity.revisions?.some((r: any) => r.legacyExecutionIds?.includes(EXPECTED) && r.authorityExecutionIds?.includes(EXPECTED)) === true && authorityRow[0]?.execution_id === EXPECTED,
  AUTHORITY_STATE_UNCHANGED: authorityRow[0]?.authority_state === 'LEGACY_IMPORTED',
  GATE_0A_APPLY_RECORD_INTACT: applyRecord.mode === 'APPLY' && applyRecord.writesPerformed === true && applyRecord.chosenExecutionId === EXPECTED && before.applyRecordDigest === after.applyRecordDigest,
  MISMATCH_RECEIPT_COUNT_ZERO: nonParity(initialParity).length === 0 && nonParity(freshParity).length === 0 && census.readers.every((r: any) => !r.failures.some((f: string) => /DISAGREEMENT|MISMATCH|AMBIGUOUS/.test(f))),
  PERSISTENT_MUTATION_DURING_OBSERVATION_ZERO: JSON.stringify(before.db) === JSON.stringify(after.db) && freshParity.writesPerformed === false && freshParity.mutationAuthorized === false,
  RUNTIME_OWNER_STILL_LEGACY: freshParity.runtimeOwner === 'LEGACY_CANONICAL_AUTHORITY' && freshParity.runtimeReaderCutover === false && census.readerCutover === false,
};
const failed = Object.entries(criteria).filter(([, ok]) => !ok).map(([k]) => k);
const status = failed.length === 0 ? 'READ_PARITY_OBSERVATION_PROVEN' : 'READ_PARITY_OBSERVATION_BLOCKED';
const body = {
  schema: 'atlas.graphify-authority-observation.v1',
  gate: 'GRAPHIFY-AUTHORITY-OBSERVATION-03',
  generatedAt: new Date().toISOString(),
  status, failedCriteria: failed, criteria,
  expectedExecutionId: EXPECTED, runtimeOwner: 'LEGACY_CANONICAL_AUTHORITY', readerCutover: false, mutationAuthorized: false,
  evidence: {
    importReceipt: { file: importReceiptFile, digest: importReceiptDigest, dbImportReceipt: authorityRow[0]?.import_receipt ?? null },
    initialParity: { file: 'docs/reports/graphify-authority-read-parity-v1.json (git HEAD blob, committed before this observation)', generatedAt: initialParity.generatedAt, digest: initialParityDigest, status: initialParity.status },
    freshParity: { generatedAt: freshParity.generatedAt, status: freshParity.status, counts: freshParity.counts },
    writerTests: { exitCode: vitest.status, tests: writerTests },
    rehearsal: { file: 'docs/reports/current-graphify-execution-owner-decision-rehearsal-v1.json', mode: rehearsal.mode, generatedAt: rehearsal.generatedAt, reportChecksum: rehearsal.reportChecksum },
    gate0aApplyRecord: { file: APPLY_RECORD, digest: after.applyRecordDigest, generatedAt: applyRecord.generatedAt, mode: applyRecord.mode },
    census: { file: 'docs/reports/graphify-authority-reader-shadow-census-v1.json', status: census.status, receiptChecksum: census.receiptChecksum, generatedAt: census.generatedAt },
    staticShadowSelectFiles: { helper: HELPER, parityProofLoader: PARITY_PROOF_LOADER, classification: 'helper = ONE per-reader scoped shadow selection; parityProofLoader = whole-table parity comparator loader (distinct purpose); others are writers/importer/parity tool/this census machinery', allSelectFiles: selectFiles, strayReaderSelectFiles: stray },
    integrity: { before, after },
  },
  databaseWrites: JSON.stringify(before.db) === JSON.stringify(after.db) ? 0 : 'FINGERPRINT_CHANGED',
};
writeFileSync(RECEIPT, `${JSON.stringify({ ...body, receiptChecksum: digest(JSON.stringify(body)) }, null, 2)}\n`);
console.log(JSON.stringify({ status, failedCriteria: failed, criteria, receipt: RECEIPT }, null, 2));
process.exitCode = failed.length === 0 ? 0 : 1;
