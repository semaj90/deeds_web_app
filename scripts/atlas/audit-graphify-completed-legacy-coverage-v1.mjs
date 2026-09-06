#!/usr/bin/env node
/** Measure whether graphify_files last_seen pointers hide completed history. */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const outPath = path.join(root, 'docs/reports/graphify-completed-legacy-coverage-v1.json');
const require = createRequire(import.meta.url);
const { Pool } = require('pg');
const pool = new Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv()), max: 1, statement_timeout: 120000 });
let summary = null;
let databaseError = null;
try { summary = (await pool.query(`SELECT count(*)::int AS total_rows, count(*) FILTER (WHERE last_run.status = 'RUNNING')::int AS last_seen_running, count(*) FILTER (WHERE first_run.status = 'COMPLETED' AND last_run.status = 'RUNNING')::int AS completed_first_running_last, count(*) FILTER (WHERE last_run.status = 'COMPLETED')::int AS last_seen_completed, count(*) FILTER (WHERE first_run.status = 'COMPLETED')::int AS first_seen_completed, count(*) FILTER (WHERE last_run.status = 'COMPLETED' AND gf.workspace_revision IS NOT NULL)::int AS completed_last_with_workspace_revision FROM public.graphify_files gf LEFT JOIN public.graphify_runs first_run ON first_run.run_id = gf.first_seen_run_id LEFT JOIN public.graphify_runs last_run ON last_run.run_id = gf.last_seen_run_id`)).rows[0] ?? null; }
catch (error) { databaseError = error instanceof Error ? error.message : String(error); }
finally { await pool.end(); }
const eroded = Number(summary?.completed_first_running_last ?? 0);
const report = { schema: 'atlas.graphify-completed-legacy-coverage.v1', status: databaseError ? 'DATABASE_READ_ERROR' : eroded === 0 ? 'NO_COMPLETED_HISTORY_EROSION_OBSERVED' : 'LEGACY_HISTORY_EROSION_OBSERVED', summary, historyErodedRows: eroded, readOnly: true, writes: { postgres: false, graphify: false, qdrant: false, neo4j: false, cache: false, modelCalls: false }, interpretation: eroded === 0 ? 'A completed-only last_seen bridge is not disproven by this aggregate; continue bounded differential selection.' : 'Some rows point to RUNNING last_seen records despite completed first_seen history; remain unqualified until immutable completed evidence is available.', nextGate: eroded === 0 ? 'GRAPHIFY_COMPLETED_ONLY_DIFFERENTIAL_REPLAY' : 'IMMUTABLE_COMPLETED_HISTORY_REQUIRED' };
await writeFile(outPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ report: path.relative(root, outPath).replaceAll('\\', '/'), status: report.status, historyErodedRows: eroded, readOnly: true }, null, 2));
