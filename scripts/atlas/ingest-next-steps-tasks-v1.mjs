#!/usr/bin/env node
/**
 * RECOMMENDATIONS-E2E-01 R2: idempotent ingest of the next_steps OPEN checklist tasks into kanban_tasks (SCRATCH ONLY).
 *
 * Input is the explicit output of extract-next-steps-tasks-v1.mjs (no "latest" discovery): --tasks=<tasks.jsonl> --receipt=<receipt.json>.
 * The receipt's sha256 of tasks.jsonl must match. Each doc's current bytes must still hash to the row's sourceRevision (drift guard).
 *
 * Decisions (see openspec/changes/parent-atlas-nlp-sidecar-feature-compiler/tasks.md RECOMMENDATIONS-E2E-01):
 *  - Only status=open tasks are ingested. A checked box in a doc is a claim, not a verified completion: done tasks are skipped, never written
 *    as completed, and no completed_at is invented.
 *  - Inserted as lane=todo, status=pending, priority=default (docs carry none), assignee/validation_command null, idempotency_key = task_id.
 *  - ON CONFLICT (task_id) refreshes ONLY feature_label, source_refs, source_revision and updated_at, and only when a value differs.
 *    status, lane, priority, claim and attempt fields are never touched.
 *  - No dependency rows are written (the docs have none).
 *
 * Safety contract (fail closed): target database name must end in _scratch, host must be loopback, current_database() is read back inside the
 * transaction and PostgreSQL must be 18+. Writes need ATLAS_SCRATCH_PG18_ALLOW_WRITES=1 in BOTH modes. rehearse (default) always ends in ROLLBACK and
 * PASSes only if an independent connection sees the namespace exactly as before; apply COMMITs and PASSes only if an independent connection reads the
 * rows back. A connection string or password is never printed.
 *
 * usage: ATLAS_SCRATCH_PG18_ALLOW_WRITES=1 node scripts/atlas/ingest-next-steps-tasks-v1.mjs --tasks=<tasks.jsonl> --receipt=<receipt.json> [--mode=rehearse|apply]
 * target: SCRATCH_DATABASE_URL, else the repo-resolved DATABASE_URL/DB_PASSWORD with only the database name swapped to legal_ai_live_integration_scratch.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { fileURLToPath } from 'node:url';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const arg = (name) => process.argv.slice(2).find((a) => a.startsWith(`--${name}=`))?.slice(name.length + 3);
const need = (name) => { const v = arg(name); if (!v) throw new Error(`EXPLICIT_${name.toUpperCase()}_REQUIRED`); return v; };
const mode = arg('mode') ?? 'rehearse';
if (mode !== 'rehearse' && mode !== 'apply') throw new Error('MODE_MUST_BE_rehearse_OR_apply');
if (process.env.ATLAS_SCRATCH_PG18_ALLOW_WRITES !== '1') throw new Error('SCRATCH_GATE: set ATLAS_SCRATCH_PG18_ALLOW_WRITES=1 (rehearsal rows are rolled back but still written)');

const sha = (b) => `sha256:${crypto.createHash('sha256').update(b).digest('hex')}`;
const inRepo = (p) => { const abs = path.resolve(ROOT, p); if (!abs.startsWith(`${ROOT}${path.sep}`)) throw new Error('INPUT_OUTSIDE_REPOSITORY'); return abs; };
const NS = 'nextsteps:';
const SCRATCH_DB_RE = /^[a-z0-9_]+_scratch$/;
const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);

// ---- inputs (explicit, checksummed)
const tasksPath = inRepo(need('tasks'));
const receipt = JSON.parse(fs.readFileSync(inRepo(need('receipt')), 'utf8'));
const tasksBytes = fs.readFileSync(tasksPath);
if (receipt.schema !== 'atlas.next-steps-task-extract.v1' || receipt.canonicalAuthority !== false || receipt.writesPerformed !== false) throw new Error('RECEIPT_NOT_ADMISSIBLE');
if (sha(tasksBytes) !== receipt.tasksJsonl?.sha256) throw new Error('TASKS_JSONL_CHECKSUM_MISMATCH');
const allRows = tasksBytes.toString('utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
if (allRows.length !== receipt.tasks) throw new Error('TASK_COUNT_MISMATCH');
const rows = allRows.filter((r) => r.status === 'open');
const doneSkipped = allRows.length - rows.length;

// ---- drift guard: every doc must still hash to the extracted sourceRevision; titles come from the same bytes
const docInfo = new Map();
for (const docPath of new Set(rows.map((r) => r.docPath))) {
  const bytes = fs.readFileSync(inRepo(docPath));
  const rev = sha(bytes);
  const title = (bytes.toString('utf8').split(/\r?\n/).slice(0, 40).find((l) => /^#{1,3}\s+\S/.test(l)) ?? '').replace(/^#+\s+/, '').trim();
  docInfo.set(docPath, { rev, title: title || path.basename(docPath) });
}
const drifted = [...new Set(rows.filter((r) => docInfo.get(r.docPath).rev !== r.sourceRevision).map((r) => r.docPath))];
if (drifted.length) throw new Error(`SOURCE_DRIFT: ${drifted.length} doc(s) changed since extraction (first: ${drifted[0]}); re-run the extractor`);

// ---- target (scratch only)
function targetUrl() {
  if (process.env.SCRATCH_DATABASE_URL) return process.env.SCRATCH_DATABASE_URL;
  const u = new URL(resolveDatabaseUrl(loadRepoEnv(process.env)));
  u.pathname = '/legal_ai_live_integration_scratch';
  return u.toString();
}
const url = new URL(targetUrl());
const dbName = decodeURIComponent(url.pathname.replace(/^\//, ''));
if (!SCRATCH_DB_RE.test(dbName)) throw new Error('SCRATCH_GATE: database name must match /^[a-z0-9_]+_scratch$/');
if (!LOOPBACK.has(url.hostname)) throw new Error('SCRATCH_GATE: host must be loopback');
const connectionString = url.toString();

const columns = {
  taskId: rows.map((r) => r.taskKey),
  featureId: rows.map((r) => r.featureId),
  label: rows.map((r) => docInfo.get(r.docPath).title.slice(0, 300)),
  refs: rows.map((r) => JSON.stringify([`${r.docPath}#L${r.line}`])),
  rev: rows.map((r) => docInfo.get(r.docPath).rev),
};
const UPSERT = `
  INSERT INTO public.kanban_tasks (task_id, feature_id, feature_label, source_refs, lane, status, idempotency_key, source_revision)
  SELECT t.task_id, t.feature_id, t.label, t.refs::jsonb, 'todo', 'pending', t.task_id, t.rev0
  FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[]) AS t(task_id, feature_id, label, refs, rev0)
  ON CONFLICT (task_id) DO UPDATE SET
    feature_label = EXCLUDED.feature_label, source_refs = EXCLUDED.source_refs, source_revision = EXCLUDED.source_revision, updated_at = now()
  WHERE (kanban_tasks.feature_label, kanban_tasks.source_refs, kanban_tasks.source_revision)
        IS DISTINCT FROM (EXCLUDED.feature_label, EXCLUDED.source_refs, EXCLUDED.source_revision)
  RETURNING (xmax = 0) AS inserted`;

const q = (c, text, params) => c.query(text, params);
const nsSnapshot = async (c) => (await q(c, `SELECT count(*)::int AS n, coalesce(md5(string_agg(task_id || coalesce(status,'') || coalesce(lane,''), ',' ORDER BY task_id)),'') AS d FROM public.kanban_tasks WHERE feature_id LIKE $1`, [`${NS}%`])).rows[0];
const otherSnapshot = async (c) => (await q(c, `SELECT count(*)::int AS n, coalesce(md5(string_agg(task_id || coalesce(status,'') || coalesce(lane,''), ',' ORDER BY task_id)),'') AS d FROM public.kanban_tasks WHERE feature_id NOT LIKE $1`, [`${NS}%`])).rows[0];

const pool = new pg.Pool({ connectionString, max: 3 });
const result = { schema: 'atlas.next-steps-task-ingest.v1', generatedAt: new Date().toISOString(), mode, dbName, canonicalAuthority: false, tasksInput: { rows: allRows.length, open: rows.length, doneSkipped }, status: 'FAIL', failReason: null };
let exitCode = 1;
try {
  const before = await nsSnapshot(pool); const beforeOther = await otherSnapshot(pool);
  const client = await pool.connect();
  let aborted = false;
  try {
    await client.query('BEGIN');
    const ident = (await client.query(`SELECT current_database() AS db, current_setting('server_version_num')::int AS v`)).rows[0];
    if (!SCRATCH_DB_RE.test(ident.db) || ident.db !== dbName) throw new Error('SCRATCH_IDENTITY_MISMATCH: current_database() is not the expected *_scratch database');
    if (ident.v < 180000) throw new Error('SCRATCH_IDENTITY_MISMATCH: server is not PostgreSQL 18+');
    const first = await client.query(UPSERT, [columns.taskId, columns.featureId, columns.label, columns.refs, columns.rev]);
    const inserted = first.rows.filter((r) => r.inserted).length;
    const second = await client.query(UPSERT, [columns.taskId, columns.featureId, columns.label, columns.refs, columns.rev]);
    const inTxn = await nsSnapshot(client); const otherInTxn = await otherSnapshot(client);
    const bad = (await client.query(`SELECT count(*)::int AS n FROM public.kanban_tasks WHERE feature_id LIKE $1 AND (lane <> 'todo' OR status <> 'pending' OR completed_at IS NOT NULL OR assignee IS NOT NULL OR attempt_count <> 0 OR idempotency_key <> task_id OR source_revision IS NULL)`, [`${NS}%`])).rows[0].n;
    const present = (await client.query(`SELECT count(*)::int AS n FROM public.kanban_tasks WHERE task_id = ANY($1::text[])`, [columns.taskId])).rows[0].n;
    Object.assign(result, { firstPass: { inserted, updated: first.rowCount - inserted, unchangedAlreadyPresent: rows.length - first.rowCount }, secondPassChangedRows: second.rowCount, ingestedKeysPresentInTxn: present, namespaceRowsInTxn: inTxn.n, badShapeRows: bad, otherRowsUnchangedInTxn: otherInTxn.n === beforeOther.n && otherInTxn.d === beforeOther.d });
    const ok = present === rows.length && second.rowCount === 0 && inTxn.n === before.n + inserted && bad === 0 && result.otherRowsUnchangedInTxn;
    if (!ok) { result.failReason = 'POST_CHECKS_FAILED'; aborted = true; }
    await client.query(mode === 'apply' && !aborted ? 'COMMIT' : 'ROLLBACK');
    result.committed = mode === 'apply' && !aborted; result.rolledBack = !result.committed;
  } catch (err) {
    try { await client.query('ROLLBACK'); } catch { /* connection already unusable */ }
    result.failReason = String(err.message).replace(/postgres(ql)?:\/\/\S+/gi, '<redacted>').slice(0, 300);
    result.committed = false; result.rolledBack = true;
  } finally { client.release(); }
  // independent connection: readback
  const independent = new pg.Pool({ connectionString, max: 1 });
  try {
    const after = await nsSnapshot(independent); const afterOther = await otherSnapshot(independent);
    result.independentReadback = { namespaceRows: after.n, expectedRows: result.committed ? before.n + (result.firstPass?.inserted ?? 0) : before.n, otherRowsUnchanged: afterOther.n === beforeOther.n && afterOther.d === beforeOther.d };
    const expectOk = after.n === result.independentReadback.expectedRows && result.independentReadback.otherRowsUnchanged && (result.committed || after.d === before.d);
    result.independentlyVerified = expectOk;
    if (!result.failReason && expectOk) { result.status = 'PASS'; exitCode = 0; } else if (!result.failReason) result.failReason = 'READBACK_MISMATCH';
  } finally { await independent.end(); }
} finally { await pool.end(); }

const outDir = path.join(ROOT, '.tmp/atlas/next-steps-task-ingest-v1', new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z'));
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'receipt.json'), `${JSON.stringify(result, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ ...result, receipt: path.relative(ROOT, path.join(outDir, 'receipt.json')).replaceAll('\\', '/') }, null, 2));
process.exit(exitCode);
