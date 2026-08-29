#!/usr/bin/env node
/** Read-only Git/blob authority audit for one registered Graphify run. */
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const root = REPO_ROOT;
const runId = process.env.ATLAS_GRAPHIFY_RUN_ID ?? '14643371-f6f2-4131-906b-235a5c06619a';
const reportPath = path.join(root, 'docs/reports/graphify-git-source-authority-v1.json');
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 120000 });
let rows = [];
let run = null;
let databaseError = null;
try {
  const runResult = await pool.query(`SELECT run_id, repository_revision, workspace_revision, source_manifest_digest, status FROM public.graphify_runs WHERE run_id = $1`, [runId]);
  run = runResult.rows[0] ?? null;
  const fileResult = await pool.query(`SELECT source_ref, source_revision, content_hash, git_blob_oid, code_source_revision, workspace_revision FROM public.graphify_files WHERE last_seen_run_id = $1 ORDER BY source_ref`, [runId]);
  rows = fileResult.rows;
} catch (error) {
  databaseError = error instanceof Error ? error.message : String(error);
} finally {
  await pool.end();
}

const blobByPath = new Map();
if (run?.repository_revision) {
  try {
    const listing = execFileSync('git', ['ls-tree', '-r', '-z', String(run.repository_revision)], { cwd: root, encoding: 'utf8', maxBuffer: 20 * 1024 * 1024 });
    for (const entry of listing.split('\0')) {
      const match = entry.match(/^\d+\s+blob\s+([0-9a-f]{40})\t(.+)$/);
      if (match) blobByPath.set(match[2].replaceAll('\\', '/'), match[1]);
    }
  } catch (error) {
    databaseError = databaseError ?? `GIT_TREE_READ_FAILED:${error instanceof Error ? error.message : String(error)}`;
  }
}

const audited = rows.map((row) => {
  const sourceRef = String(row.source_ref).replaceAll('\\', '/');
  const expectedBlob = blobByPath.get(sourceRef) ?? null;
  const storedBlob = row.git_blob_oid ? String(row.git_blob_oid) : null;
  const storedCodeRevision = row.code_source_revision ? String(row.code_source_revision) : null;
  let repositoryContentHash = null;
  if (run?.repository_revision && expectedBlob) {
    try {
      repositoryContentHash = `sha256:${crypto.createHash('sha256').update(execFileSync('git', ['show', `${run.repository_revision}:${sourceRef}`], { cwd: root, maxBuffer: 20 * 1024 * 1024 })).digest('hex')}`;
    } catch { /* tree presence is reported separately */ }
  }
  const status = !expectedBlob
    ? 'NOT_IN_REPOSITORY_REVISION'
    : storedBlob && storedBlob === expectedBlob
      ? 'GIT_BLOB_MATCH'
      : storedBlob
        ? 'GIT_BLOB_MISMATCH'
        : 'GIT_BLOB_NOT_RECORDED';
  return { sourceRef, status, repositoryBlobOid: expectedBlob, repositoryContentHash, storedContentHash: row.content_hash ?? null, contentHashMatchesRepository: Boolean(repositoryContentHash && String(row.content_hash ?? '').replace(/^sha256:/, '').toLowerCase() === repositoryContentHash.replace(/^sha256:/, '')), storedGitBlobOid: storedBlob, storedCodeSourceRevision: storedCodeRevision, sourceRevision: row.source_revision ?? null, workspaceRevision: row.workspace_revision ?? null };
});
const counts = audited.reduce((out, row) => { out[row.status] = (out[row.status] ?? 0) + 1; return out; }, {});
const report = {
  schema: 'atlas.graphify-git-source-authority.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_GIT_BLOB_AUTHORITY_AUDIT',
  runId,
  run,
  databaseError,
  writes: { postgres: false, qdrant: false, neo4j: false, valkey: false },
  canonicalAuthority: false,
  rowCount: rows.length,
  repositoryTreeEntryCount: blobByPath.size,
  counts,
  gitAuthorityProven: rows.length > 0 && audited.every((row) => row.status === 'GIT_BLOB_MATCH'),
  repositoryContentHashMatchCount: audited.filter((row) => row.contentHashMatchesRepository).length,
  rows: audited,
};
report.auditChecksum = `sha256:${crypto.createHash('sha256').update(JSON.stringify(report), 'utf8').digest('hex')}`;
fs.mkdirSync(path.dirname(reportPath), { recursive: true });
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ schema: report.schema, runId, rowCount: report.rowCount, repositoryTreeEntryCount: report.repositoryTreeEntryCount, counts, gitAuthorityProven: report.gitAuthorityProven, reportPath }, null, 2));
