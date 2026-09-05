#!/usr/bin/env node
/** Compare legacy revision ordering with a completed-run-only selection, read-only. */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const plan = JSON.parse(await readFile(path.join(root, 'docs/reports/fresh-origin-bounded-cohort-plan-v1.json'), 'utf8'));
const outPath = path.join(root, 'docs/reports/graphify-completed-differential-replay-v1.json');
const require = createRequire(import.meta.url);
const { Pool } = require('pg');
const pool = new Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv()), max: 1, statement_timeout: 120000 });
let rows = [];
let databaseError = null;
try { rows = (await pool.query(`select gf.source_ref, gf.workspace_revision, gf.code_source_revision, gf.source_revision, gf.content_hash, gf.last_seen_run_id, gf.first_seen_run_id, last_run.status as last_status, last_run.completed_at as last_completed_at from public.graphify_files gf left join public.graphify_runs last_run on last_run.run_id = gf.last_seen_run_id where gf.source_ref = any($1::text[]) order by gf.source_ref, last_run.completed_at desc nulls last, gf.last_seen_run_id desc`, [plan.rows.map((row) => row.sourceRef)])).rows; }
catch (error) { databaseError = error instanceof Error ? error.message : String(error); }
finally { await pool.end(); }
const groups = new Map();
for (const row of rows) { const list = groups.get(row.source_ref) ?? []; list.push(row); groups.set(row.source_ref, list); }
const selections = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([sourceRef, candidates]) => {
  const old = [...candidates].sort((a, b) => String(b.workspace_revision ?? '').localeCompare(String(a.workspace_revision ?? '')) || String(b.code_source_revision ?? '').localeCompare(String(a.code_source_revision ?? '')))[0] ?? null;
  const completed = candidates.filter((row) => row.last_status === 'COMPLETED' && row.last_completed_at).sort((a, b) => String(b.last_completed_at).localeCompare(String(a.last_completed_at)) || String(b.last_seen_run_id).localeCompare(String(a.last_seen_run_id)))[0] ?? null;
  return { sourceRef, candidateCount: candidates.length, oldHashOrderedRunId: old?.last_seen_run_id ?? null, oldHashOrderedStatus: old?.last_status ?? null, newCompletedRunId: completed?.last_seen_run_id ?? null, newCompletedStatus: completed?.last_status ?? null, selectionChanged: (old?.last_seen_run_id ?? null) !== (completed?.last_seen_run_id ?? null), completedAvailable: Boolean(completed) };
});
const material = selections.map((row) => `${row.sourceRef}\0${row.newCompletedRunId ?? ''}`).join('\n');
const report = { schema: 'atlas.graphify-completed-differential-replay.v1', status: databaseError ? 'DATABASE_READ_ERROR' : selections.length === plan.rows.length && selections.every((row) => row.completedAvailable) ? 'COMPLETED_ONLY_SELECTION_AVAILABLE' : 'COMPLETED_ONLY_SELECTION_INCOMPLETE', plan: 'docs/reports/fresh-origin-bounded-cohort-plan-v1.json', originWorkspaceRevision: plan.originWorkspaceRevision ?? null, counts: { proposed: plan.rows.length, observedRefs: selections.length, completedAvailable: selections.filter((row) => row.completedAvailable).length, selectionChanged: selections.filter((row) => row.selectionChanged).length }, selectedRunIdsChecksum: `sha256:${createHash('sha256').update(material, 'utf8').digest('hex')}`, selections, databaseError, readOnly: true, authorization: false, writes: { postgres: false, graphify: false, qdrant: false, neo4j: false, cache: false, modelCalls: false }, nextGate: 'PKT_LINEAGE_08_READ_ONLY_REPLAY_WITH_EXPLICIT_CURRENT_SOURCE_INPUT' };
await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ report: path.relative(root, outPath).replaceAll('\\', '/'), status: report.status, counts: report.counts, authorization: false }, null, 2));
