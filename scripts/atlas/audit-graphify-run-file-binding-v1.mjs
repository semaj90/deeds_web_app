#!/usr/bin/env node

/** Read-only audit of Graphify lifecycle rows and their file-row ownership. */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const root = REPO_ROOT;
const reportPath = path.join(root, 'docs/reports/graphify-run-file-binding-v1.json');
const pool = new pg.Pool({
  connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)),
  max: 1,
  statement_timeout: 30000,
});

let rows = [];
let databaseError = null;
try {
  const result = await pool.query(`
    SELECT
      r.run_id::text AS run_id,
      r.status,
      r.workspace_id::text AS workspace_id,
      r.workspace_revision,
      r.started_at,
      r.completed_at,
      COUNT(f.source_ref)::int AS file_row_count,
      COUNT(f.source_revision)::int AS source_revision_count,
      COUNT(f.content_hash)::int AS content_hash_count
    FROM public.graphify_runs r
    LEFT JOIN public.graphify_files f ON f.last_seen_run_id = r.run_id
    GROUP BY r.run_id, r.status, r.workspace_id, r.workspace_revision, r.started_at, r.completed_at
    ORDER BY r.started_at DESC NULLS LAST
    LIMIT 100
  `);
  rows = result.rows;
} catch (error) {
  databaseError = error instanceof Error ? error.message : String(error);
} finally {
  await pool.end();
}

const classified = rows.map((row) => ({
  ...row,
  classification: row.status === 'COMPLETED' && row.completed_at && row.file_row_count > 0
    ? 'COMPLETED_BOUND'
    : row.status === 'COMPLETED' && row.file_row_count === 0
      ? 'COMPLETED_UNBOUND'
      : row.status === 'RUNNING' && row.file_row_count > 0
        ? 'RUNNING_BOUND_NOT_TERMINAL'
        : row.status === 'RUNNING'
          ? 'RUNNING_UNBOUND'
          : 'OTHER',
}));

const counts = classified.reduce((out, row) => {
  out[row.classification] = (out[row.classification] ?? 0) + 1;
  return out;
}, {});

const report = {
  schema: 'atlas.graphify-run-file-binding.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY',
  writesPerformed: false,
  canonicalAuthority: false,
  databaseError,
  runCount: classified.length,
  counts,
  rows: classified,
  status: databaseError
    ? 'AUDIT_FAILED'
    : classified.some((row) => row.classification === 'COMPLETED_BOUND')
      ? 'COMPLETED_BOUND_OWNER_PRESENT'
      : 'NO_COMPLETED_BOUND_OWNER',
  nextGate: 'GRAPHIFY-RUN-FILE-BINDING-01',
};

fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  status: report.status,
  counts: report.counts,
  reportPath: 'docs/reports/graphify-run-file-binding-v1.json',
  writesPerformed: false,
}, null, 2));
