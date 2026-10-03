#!/usr/bin/env node
/**
 * Task 4.1 dry-run parity proof for openspec/changes/parent-atlas-chunk-index-whole-file-hash.
 *
 * Strictly read-only: for a small bounded sample of `repo:root` rows in the
 * admitted execution's graphify_execution_file_membership_v2 membership, read
 * the real file bytes off disk (relative to the repo root), compute
 * sha256(bytes).digest('hex'), and compare byte-for-byte against the row's
 * own persisted content_hash. Zero writes to any table -- this only checks
 * whether a fresh file_content_hash writer (not yet built; separately gated
 * as task 5.1) COULD produce values that match graphify_files' existing
 * whole-file hash authority, before any such writer is built.
 *
 * Usage: node scripts/atlas/prove-file-content-hash-parity-v1.mjs [--limit N]
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const require = createRequire(import.meta.url);
const { Pool } = require('pg');

const root = path.resolve(import.meta.dirname, '..', '..');
const reportPath = path.join(root, 'docs/reports/file-content-hash-parity-proof-v1.json');

const arg = (name, fallback) => {
  const idx = process.argv.indexOf(name);
  return idx >= 0 ? process.argv[idx + 1] : fallback;
};
const LIMIT = Number(arg('--limit', '20'));

const selected = JSON.parse(fs.readFileSync(path.join(root, 'docs/reports/promotion-gate-receipt-currentness-v1.json'), 'utf8'));
const executionId = selected.admittedExecutionId;
const workspaceRevision = selected.admittedWorkspaceRevision;

const pool = new Pool({
  connectionString: resolveDatabaseUrl(loadRepoEnv()),
  max: 2,
  application_name: 'prove-file-content-hash-parity-v1',
});

const rows = [];
let error = null;

try {
  const sample = await pool.query(
    `SELECT repository_relative_path, source_ref, content_hash, workspace_revision
       FROM public.graphify_execution_file_membership_v2
      WHERE execution_id = $1::uuid AND repository_id = 'repo:root'
      ORDER BY repository_relative_path
      LIMIT $2`,
    [executionId, LIMIT],
  );

  for (const row of sample.rows) {
    const relPath = row.repository_relative_path;
    const absPath = path.join(root, relPath);
    let liveHash = null;
    let readError = null;
    let byteLength = null;
    try {
      const bytes = fs.readFileSync(absPath);
      byteLength = bytes.byteLength;
      liveHash = crypto.createHash('sha256').update(bytes).digest('hex');
    } catch (caught) {
      readError = caught instanceof Error ? caught.message : String(caught);
    }
    const storedHash = String(row.content_hash ?? '').toLowerCase().replace(/^sha256:/, '');
    rows.push({
      sourceRef: row.source_ref,
      relativePath: relPath,
      workspaceRevisionMatches: row.workspace_revision === workspaceRevision,
      storedHash,
      liveComputedHash: liveHash,
      byteLength,
      readError,
      exactMatch: Boolean(liveHash) && liveHash === storedHash,
    });
  }
} catch (caught) {
  error = caught instanceof Error ? caught.message : String(caught);
} finally {
  await pool.end();
}

const exactMatches = rows.filter((r) => r.exactMatch).length;
const readFailures = rows.filter((r) => r.readError).length;
const mismatches = rows.filter((r) => !r.exactMatch && !r.readError).length;

const report = {
  schema: 'atlas.file-content-hash-parity-proof.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY',
  gate: 'parent-atlas-chunk-index-whole-file-hash task 4.1',
  admittedExecutionId: executionId,
  admittedWorkspaceRevision: workspaceRevision,
  sampleSize: rows.length,
  counts: { exactMatches, mismatches, readFailures },
  status: error
    ? 'PARITY_PROOF_ERROR'
    : rows.length === 0
      ? 'PARITY_PROOF_NO_SAMPLE'
      : exactMatches === rows.length
        ? 'PARITY_PROOF_EXACT_ALL'
        : 'PARITY_PROOF_MISMATCH_FOUND',
  rows,
  error,
  writesPerformed: false,
  postgresWrites: false,
};
report.reportChecksum = crypto.createHash('sha256').update(JSON.stringify(report)).digest('hex');
fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({ status: report.status, counts: report.counts, sampleSize: report.sampleSize, reportPath: 'docs/reports/file-content-hash-parity-proof-v1.json' }, null, 2));
