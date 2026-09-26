#!/usr/bin/env node
/** Read-only byte/revision audit for one registered Graphify run. */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const root = REPO_ROOT;
const runIdArgIndex = process.argv.indexOf('--run-id');
const requestedRunId = process.env.ATLAS_GRAPHIFY_RUN_ID?.trim()
  || (runIdArgIndex >= 0 ? process.argv[runIdArgIndex + 1]?.trim() : null)
  || null;
const reportPath = path.join(root, 'docs/reports/current-graphify-source-revision-v1.json');
const digest = (bytes) => `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
const safePath = (sourceRef) => {
  const absolute = path.resolve(root, String(sourceRef).replaceAll('\\', '/'));
  return absolute.startsWith(`${root}${path.sep}`) ? absolute : null;
};

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 120000 });
let rows = [];
let databaseError = null;
let runId = requestedRunId;
let runSelection = requestedRunId ? 'EXPLICIT_RUN_ID' : 'EXPLICIT_RUN_ID_REQUIRED';
try {
  if (!runId) throw new Error('EXPLICIT_GRAPHIFY_RUN_ID_REQUIRED');
  if (!runId) throw new Error('SOURCE_AUTHORITY_UNAVAILABLE: no completed Graphify execution owns file observations');
  const run = await pool.query('SELECT status FROM public.graphify_runs WHERE run_id = $1', [runId]);
  if (run.rows[0]?.status !== 'COMPLETED') {
    throw new Error(`SOURCE_AUTHORITY_NOT_TERMINAL: selected run ${runId} has status ${run.rows[0]?.status ?? 'MISSING'}`);
  }
  const result = await pool.query(`
    SELECT gf.source_ref, gf.source_revision, gf.content_hash, gf.workspace_revision,
           gf.parse_status, gf.last_seen_run_id, gr.status AS run_status
      FROM public.graphify_files gf
      LEFT JOIN public.graphify_runs gr ON gr.run_id = gf.last_seen_run_id
     WHERE gf.last_seen_run_id = $1
     ORDER BY gf.source_ref`, [runId]);
  rows = result.rows;
} catch (error) {
  databaseError = error instanceof Error ? error.message : String(error);
} finally {
  await pool.end();
}

const audited = rows.map((row) => {
  const absolute = safePath(row.source_ref);
  if (!absolute || !fs.existsSync(absolute)) return { sourceRef: row.source_ref, status: 'SOURCE_UNAVAILABLE', sourceRevision: row.source_revision ?? null, contentHash: row.content_hash ?? null };
  const actualHash = digest(fs.readFileSync(absolute));
  const expectedHash = String(row.content_hash ?? '').toLowerCase().startsWith('sha256:') ? String(row.content_hash).toLowerCase() : `sha256:${String(row.content_hash ?? '').toLowerCase()}`;
  return {
    sourceRef: row.source_ref,
    status: actualHash === expectedHash ? 'CONTENT_MATCH' : 'CONTENT_MISMATCH',
    sourceRevision: row.source_revision ?? null,
    contentHash: row.content_hash ?? null,
    actualContentHash: actualHash,
    parseStatus: row.parse_status,
  };
});
const counts = audited.reduce((out, row) => { out[row.status] = (out[row.status] ?? 0) + 1; return out; }, {});
const report = {
  schema: 'atlas.current-graphify-source-revision.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_SOURCE_BYTES_AUDIT',
  runId,
  runSelection,
  databaseError,
  writes: { postgres: false, qdrant: false, neo4j: false, valkey: false },
  canonicalAuthority: false,
  rowCount: rows.length,
  counts,
  sourceRevisionPresent: audited.filter((row) => Boolean(row.sourceRevision)).length,
  rows: audited,
  status: databaseError
    ? 'AUDIT_FAILED'
    : rows.length === 0
      ? 'SOURCE_AUTHORITY_UNAVAILABLE'
      : counts.CONTENT_MISMATCH || counts.SOURCE_UNAVAILABLE
        ? 'SOURCE_BYTES_NOT_PROVEN'
        : 'SOURCE_BYTES_MATCH_CONTENT_HASH',
};
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
// Reports are frequently read by the workstation/status process while this
// audit is running. Replace through a process-unique sibling so readers never
// observe a partial JSON document and Windows does not fail on a direct
// truncate/write race.
const reportTempPath = `${reportPath}.${process.pid}.${Date.now()}.tmp`;
try {
  fs.writeFileSync(reportTempPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.renameSync(reportTempPath, reportPath);
} finally {
  try { fs.unlinkSync(reportTempPath); } catch {}
}
console.log(JSON.stringify({ schema: report.schema, status: report.status, runId, runSelection, rowCount: report.rowCount, counts, sourceRevisionPresent: report.sourceRevisionPresent, reportPath }, null, 2));
