#!/usr/bin/env node
/**
 * test-registry-canary-v1 -- bounded ingestion of a named Vitest report into
 * atlas_test_registry / _aliases / _versions / atlas_test_execution_receipts, through the governed
 * repositories only (RECEIPT-WRITER-01). Receipts only: no atlas_evidence / materializer writes.
 *
 *   node scripts/atlas/test-registry-canary-v1.mjs --report=<vitest json>     DB-read-only dry-run; writes a local receipt
 *   ... --rehearse                          full flow inside ONE outer transaction, always ROLLBACK
 *   ... --apply                             same flow; COMMIT only if every in-transaction gate passes.
 *                                           Post-commit readback is audit-only and cannot roll back.
 *                                           Needs TEST_REGISTRY_CANARY_APPLY_AUTHORIZED=1.
 *
 * The repositories open their own BEGIN/COMMIT/ROLLBACK; a savepoint adapter maps those onto one pinned
 * client so a failure anywhere rolls back everything (the existing prove-vitest-evidence.mjs apply loop
 * is not all-or-nothing). Imports dist/core/* because dist/index.js does not export these modules (G7).
 * Vitest 3.2.7 writes fractional startTime/endTime but the compiler schema is .int() (G8); times are
 * floored here and the raw and normalized checksums are both recorded in the receipt.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const argv = process.argv.slice(2);
const flag = (n) => argv.includes(n);
const opt = (n, d) => { const a = argv.find((v) => v.startsWith(`${n}=`)); return a ? a.slice(n.length + 1) : d; };
const MODE = flag('--apply') ? 'apply' : flag('--rehearse') ? 'rehearse' : 'dry-run';
const reportPath = opt('--report', '');
const receiptLabel = opt('--receipt-label', '');
const U = (rel) => import(pathToFileURL(path.join(REPO_ROOT, rel)).href);
const sha = (buf) => createHash('sha256').update(buf).digest('hex');
const head = () => { try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim(); } catch { return 'unknown-source-revision'; } };

const sourceRevision = opt('--source-revision', head());
const runRevision = opt('--run-revision', `canary:${path.basename(reportPath, '.json')}`);
const registryRevision = opt('--registry-revision', runRevision);
const producerRevision = opt('--producer-revision', 'test-registry-canary-v1');
const RECEIPT = path.join(REPO_ROOT, '.tmp', 'atlas', `test-registry-canary-v1.${MODE}${receiptLabel ? `.${receiptLabel}` : ''}.receipt.json`);

/** Pins repository calls to one client; inner BEGIN/COMMIT/ROLLBACK become savepoints. */
function savepointAdapter(client) {
  const stack = []; let n = 0;
  const run = (sql, params) => {
    const t = typeof sql === 'string' ? sql.trim().toUpperCase() : '';
    if (t === 'BEGIN') { const s = `sp_${++n}`; stack.push(s); return client.query(`SAVEPOINT ${s}`); }
    if (t === 'COMMIT' || t === 'ROLLBACK') {
      const s = stack.pop(); if (!s) throw new Error(`${t}_WITHOUT_SAVEPOINT`);
      return client.query(t === 'COMMIT' ? `RELEASE SAVEPOINT ${s}` : `ROLLBACK TO SAVEPOINT ${s}`);
    }
    return client.query(sql, params);
  };
  const c = { query: run, release() {} };
  return { query: run, connect: async () => c };
}

export async function counts(q, runRevision, receiptIds) {
  const r = await q(`select
    count(*)::int receipts,
    count(*) filter (where stable_test_id is not null)::int linked,
    count(*) filter (where stable_test_id is null)::int unlinked
    from atlas_test_execution_receipts
    where run_revision = $1 and execution_receipt_id = any($2::text[])`, [runRevision, receiptIds]);
  return r.rows[0];
}

export function hasStableResolutionReplay(first, second) {
  return second.ambiguous === 0
    && second.canonical === first.canonical
    && second.unresolved === first.unresolved;
}

export function allCanaryChecksPassed(checks) {
  return checks.every((check) => check.ok === true && check.status !== 'NOT_EXERCISED');
}

async function main() {
  if (!reportPath) { console.error('--report=<vitest json> is required'); process.exitCode = 2; return; }
  if (receiptLabel && !/^[A-Za-z0-9._-]+$/.test(receiptLabel)) { console.error('--receipt-label may contain only letters, numbers, dot, underscore, and hyphen'); process.exitCode = 2; return; }
  const rawBytes = fs.readFileSync(reportPath);
  const report = JSON.parse(rawBytes);
  const floored = [];
  const fl = (o, k) => { if (o[k] != null && !Number.isInteger(o[k])) { floored.push(k); o[k] = Math.floor(o[k]); } };
  fl(report, 'startTime');
  for (const f of report.testResults ?? []) { fl(f, 'startTime'); fl(f, 'endTime'); }

  const comp = await U('packages/parent-atlas/dist/core/vitest-test-evidence-compiler.js');
  const regm = await U('packages/parent-atlas/dist/core/test-case-registry.js');
  const execm = await U('packages/parent-atlas/dist/core/test-execution-repository.js');
  const compiled = comp.compileVitestJsonReport({ report, source_revision: sourceRevision, run_revision: runRevision, producer_revision: producerRevision, repo_root: path.join(REPO_ROOT, 'sveltekit-frontend') });
  const noms = compiled.nominations; const execs = compiled.executions;
  if (!noms.length || noms.length !== execs.length) throw new Error(`COMPILER_MISMATCH noms=${noms.length} execs=${execs.length}`);
  const n = noms.length;

  const receipt = {
    schema: 'atlas.test-registry-canary-receipt.v1', mode: MODE, at: new Date().toISOString(), writesCommitted: false,
    input: { reportPath: path.relative(REPO_ROOT, path.resolve(reportPath)).replaceAll('\\', '/'), rawReportSha256: sha(rawBytes), compiledReportChecksum: compiled.receipt.report_checksum, runnerSha256: sha(fs.readFileSync(fileURLToPath(import.meta.url))),
      normalization: floored.length ? { kind: 'FLOOR_FRACTIONAL_TIMES', fieldsAdjusted: floored.length, note: 'G8: compiler schema is .int(); raw file checksum differs from compiled checksum' } : { kind: 'NONE' } },
    revisions: { sourceRevision, runRevision, registryRevision, producerRevision },
    tests: n, checks: [], status: 'PENDING',
  };
  const check = (name, ok, detail) => { receipt.checks.push({ name, ok: !!ok, ...(detail !== undefined ? { detail } : {}) }); return !!ok; };
  check('keys-are-derived-form', noms.every((x) => x.test_key.startsWith('test-key:')));
  check('keys-and-receipt-ids-distinct', new Set(noms.map((x) => x.test_key)).size === n && new Set(execs.map((x) => x.execution_receipt_id)).size === n);

  const dbUrl = resolveDatabaseUrl(loadRepoEnv(process.env));
  const pool = new pg.Pool({ connectionString: dbUrl, max: 2, connectionTimeoutMillis: 5000 });
  try {
    const receiptIds = execs.map((execution) => execution.execution_receipt_id);
    const pre = await counts((s, p) => pool.query(s, p), runRevision, receiptIds);
    receipt.preImage = pre;
    check('canary-receipt-ids-unused', pre.receipts === 0, pre);
    const resolveAll = async (repo) => { const t = { canonical: 0, ambiguous: 0, unresolved: 0 }; const out = []; for (const nom of noms) { const r = await repo.resolveNomination({ nomination: nom, registry_revision: registryRevision }); t[r.status]++; out.push(r); } return { t, out }; };

    if (MODE === 'dry-run') {
      const { t } = await resolveAll(regm.createTestCaseRegistryRepository(pool));
      receipt.resolution = t;
      check('no-ambiguous', t.ambiguous === 0, t);
      receipt.status = allCanaryChecksPassed(receipt.checks) ? 'DRY_RUN_OK' : 'DRY_RUN_FAILED';
      return finish(receipt);
    }
    if (pre.receipts !== 0) throw new Error('CANARY_RECEIPT_IDS_ALREADY_EXIST');
    if (MODE === 'apply' && process.env.TEST_REGISTRY_CANARY_APPLY_AUTHORIZED !== '1') {
      console.error('REFUSED: --apply needs TEST_REGISTRY_CANARY_APPLY_AUTHORIZED=1 (operator go-ahead).'); process.exitCode = 2; return;
    }

    const client = await pool.connect();
    let committed = false;
    try {
      await client.query('BEGIN');
      const adapter = savepointAdapter(client);
      const reg = regm.createTestCaseRegistryRepository(adapter);
      const exe = execm.createTestExecutionRepository(adapter);
      const q = (s, p) => client.query(s, p);

      // pass 1: resolve -> refuse ambiguous -> preserve unresolved IDs as NULL -> persist -> read back
      const first = await resolveAll(reg);
      receipt.resolution = first.t;
      if (!check('no-ambiguous', first.t.ambiguous === 0, first.t)) throw new Error('AMBIGUOUS_RESOLUTION_REFUSED');
      const stableIds = [];
      for (let i = 0; i < n; i++) {
        const resolution = first.out[i];
        if (resolution.status === 'canonical') {
          const rb = await reg.readback({ stable_test_id: resolution.stable_test_id, producer_revision: producerRevision });
          if (rb.stable_test_id !== resolution.stable_test_id) throw new Error(`REGISTRY_READBACK_ID_MISMATCH:${resolution.stable_test_id}`);
        }
        const expectedStableId = resolution.stable_test_id ?? null;
        stableIds.push(expectedStableId);
        const er = await exe.persist({ observation: execs[i], resolution, producer_revision: producerRevision });
        if (er.stable_test_id !== expectedStableId) throw new Error(`EXECUTION_LINK_MISMATCH:${execs[i].execution_receipt_id}`);
      }
      const afterFirst = await counts(q, runRevision, receiptIds);
      check('counts-after-pass-1', afterFirst.receipts === n && afterFirst.linked === first.t.canonical && afterFirst.unlinked === first.t.unresolved, { pre, afterFirst, resolution: first.t });

      // pass 2: idempotency -- canonical and unresolved classifications remain stable; unresolved stays unlinked
      const second = await resolveAll(reg);
      check('pass-2-resolution-stable', hasStableResolutionReplay(first.t, second.t) && second.out.every((r, i) => (r.stable_test_id ?? null) === (first.out[i].stable_test_id ?? null) && r.status === first.out[i].status), { first: first.t, second: second.t });
      for (let i = 0; i < n; i++) {
        const er = await exe.persist({ observation: execs[i], resolution: second.out[i], producer_revision: producerRevision });
        if (er.stable_test_id !== (second.out[i].stable_test_id ?? null)) throw new Error(`REPLAY_LINK_MISMATCH:${execs[i].execution_receipt_id}`);
      }
      const afterSecond = await counts(q, runRevision, receiptIds);
      check('idempotent-second-pass', JSON.stringify(afterSecond) === JSON.stringify(afterFirst));

      // negative tests (JS-level throws; they do not abort the SQL transaction)
      const expectThrow = async (name, fn, needle) => { try { await fn(); check(name, false, 'did not throw'); } catch (e) { check(name, String(e.message).includes(needle), e.message); } };
      await expectThrow('allow_create-false-throws', () => reg.promoteNomination({ nomination: noms[0], registry_revision: registryRevision, producer_revision: producerRevision, allow_create: false }), 'TEST_PROMOTION_REQUIRES_EXPLICIT_ALLOW_CREATE');
      await expectThrow('changed-status-replay-throws', () => exe.persist({ observation: { ...execs[0], status: execs[0].status === 'passed' ? 'failed' : 'passed' }, resolution: second.out[0], producer_revision: producerRevision }), 'TEST_EXECUTION_IMMUTABILITY_CONFLICT');
      const canonicalIndices = second.out.map((resolution, i) => resolution.status === 'canonical' ? i : -1).filter((i) => i >= 0);
      if (canonicalIndices.length >= 2) {
        await expectThrow('key-mismatch-throws', () => exe.persist({ observation: execs[canonicalIndices[1]], resolution: second.out[canonicalIndices[0]], producer_revision: producerRevision }), 'TEST_EXECUTION_RESOLUTION_KEY_MISMATCH');
      } else {
        receipt.checks.push({ name: 'key-mismatch-negative-test', ok: false, status: 'NOT_EXERCISED', detail: 'requires two canonical fixtures; current cohort has fewer' });
      }
      const afterNeg = await counts(q, runRevision, receiptIds);
      check('negative-tests-wrote-nothing', JSON.stringify(afterNeg) === JSON.stringify(afterSecond));
      receipt.stableTestIds = stableIds; receipt.countsInside = afterNeg;

      const allOk = allCanaryChecksPassed(receipt.checks);
      if (MODE === 'apply' && allOk) { await client.query('COMMIT'); committed = true; receipt.writesCommitted = true; }
      else await client.query('ROLLBACK');
      receipt.status = MODE === 'apply' ? (allOk ? 'APPLIED' : 'ROLLED_BACK_CHECKS_FAILED') : (allOk ? 'REHEARSAL_OK_ROLLED_BACK' : 'REHEARSAL_FAILED_ROLLED_BACK');
    } catch (e) {
      if (!committed) await client.query('ROLLBACK').catch(() => {});
      receipt.status = 'FAILED_ROLLED_BACK'; receipt.error = String(e.message ?? e); process.exitCode = 1;
    } finally { client.release(); }

    const post = await counts((s, p) => pool.query(s, p), runRevision, receiptIds);
    receipt.postState = post;
    if (!receipt.writesCommitted) {
      const same = ['receipts', 'linked', 'unlinked'].every((k) => post[k] === pre[k]);
      check('pre-image-restored-after-rollback', same, { pre, post });
    } else {
      const expectedLinked = firstCanonicalCount(receipt);
      check('independent-readback-linked-receipts', post.linked === expectedLinked && post.unlinked === receipt.tests - expectedLinked, { ...post, expectedLinked });
      if (!allCanaryChecksPassed(receipt.checks)) receipt.status = 'APPLIED_POSTCHECK_FAILED';
    }
    if (!allCanaryChecksPassed(receipt.checks)) process.exitCode = process.exitCode || 1;
    finish(receipt);
  } finally { await pool.end().catch(() => {}); }
}

function firstCanonicalCount(receipt) {
  return receipt.resolution?.canonical ?? 0;
}

function finish(receipt) {
  fs.mkdirSync(path.dirname(RECEIPT), { recursive: true });
  fs.writeFileSync(RECEIPT, JSON.stringify(receipt, null, 2), { flag: 'wx' });
  for (const c of receipt.checks) console.log(`${c.status ?? (c.ok ? 'PASS' : 'FAIL')}  ${c.name}`);
  console.log(`mode=${receipt.mode} status=${receipt.status} tests=${receipt.tests} writesCommitted=${receipt.writesCommitted}`);
  console.log(`receipt: ${path.relative(REPO_ROOT, RECEIPT)}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main().catch((e) => { console.error(e); process.exit(1); });
