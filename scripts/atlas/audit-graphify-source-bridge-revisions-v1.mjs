#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';
import { classifyGraphifySourceBridgeV1 } from './lib/graphify-source-bridge-classification-v1.mjs';

const args = process.argv.slice(2);
const valueFor = (name) => {
  const index = args.indexOf(name);
  return index < 0 ? null : args[index + 1] ?? null;
};
const admission = JSON.parse(fs.readFileSync(path.join(REPO_ROOT, 'docs/reports/workspace-revision-tournament-admission-v1.json'), 'utf8'));
const workspaceRevision = valueFor('--workspace-revision') ?? admission.workspaceRevision;
const outputArg = valueFor('--output');
if (!/^sha256:[0-9a-f]{64}$/i.test(String(workspaceRevision ?? ''))) {
  throw new Error('GRAPHIFY_BRIDGE_WORKSPACE_REVISION_INVALID');
}
if (!outputArg) throw new Error('GRAPHIFY_BRIDGE_OUTPUT_REQUIRED_UNDER_TMP');
const outputPath = path.resolve(REPO_ROOT, outputArg);
const tmpRoot = path.join(REPO_ROOT, '.tmp');
const tmpRelative = path.relative(tmpRoot, outputPath);
if (!tmpRelative || tmpRelative.startsWith('..') || path.isAbsolute(tmpRelative)) {
  throw new Error('GRAPHIFY_BRIDGE_OUTPUT_MUST_REMAIN_UNDER_TMP');
}

const snapshotPath = path.join(
  REPO_ROOT,
  'docs/reports/workspace-source-snapshots',
  `${String(admission.snapshotRevision).replace(/^sha256:/, '')}.json`,
);
const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
const manifestRows = (snapshot.sources ?? [])
  .filter((row) => row.repositoryId === 'repo:root')
  .map((row) => ({
    sourceRef: String(row.sourceRef ?? row.repositoryRelativePath ?? '').replaceAll('\\', '/'),
    sourceRevision: row.sourceRevision,
    contentDigest: String(row.contentDigest ?? '').replace(/^sha256:/i, '').toLowerCase(),
    byteLength: Number(row.byteLength),
  }))
  .sort((left, right) => Buffer.compare(Buffer.from(left.sourceRef), Buffer.from(right.sourceRef)));
if (manifestRows.length === 0 || manifestRows.some((row) => !row.sourceRef || !row.sourceRevision
  || !/^[0-9a-f]{64}$/i.test(row.contentDigest) || !Number.isSafeInteger(row.byteLength))) {
  throw new Error('GRAPHIFY_BRIDGE_MANIFEST_INVALID');
}

const databaseUrl = resolveDatabaseUrl(loadRepoEnv(process.env));
const pool = new pg.Pool({
  connectionString: databaseUrl,
  max: 1,
  connectionTimeoutMillis: 10000,
  statement_timeout: 120000,
  application_name: 'atlas-graphify-source-bridge-revisions-v1',
});
const client = await pool.connect();
let rows = [];
try {
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  rows = (await client.query(`
    SELECT source_ref::text, workspace_revision::text,
           code_source_revision::text, content_hash::text, byte_length::int
      FROM public.graphify_files
     WHERE source_ref = ANY($1::text[])
     ORDER BY source_ref, workspace_revision, code_source_revision
  `, [manifestRows.map((row) => row.sourceRef)])).rows;
  await client.query('ROLLBACK');
} catch (error) {
  try { await client.query('ROLLBACK'); } catch {}
  throw error;
} finally {
  client.release();
  await pool.end();
}

const classifications = classifyGraphifySourceBridgeV1({ manifestRows, graphifyRows: rows, workspaceRevision });
const counts = classifications.reduce((result, row) => {
  result[row.classification] = (result[row.classification] ?? 0) + 1;
  return result;
}, {});
const checksum = (value) => crypto.createHash('sha256').update(value, 'utf8').digest('hex');
const receipt = {
  schema: 'atlas.graphify-source-bridge-revisions.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY',
  databaseTransaction: 'REPEATABLE READ ONLY; ROLLED BACK',
  workspaceRevision,
  snapshotRevision: admission.snapshotRevision,
  manifestSourceCount: manifestRows.length,
  graphifyRowsForManifestRefs: rows.length,
  classifications: counts,
  manifestChecksum: checksum(JSON.stringify(manifestRows.map((row) => [row.sourceRef, row.sourceRevision, row.contentDigest, row.byteLength]))),
  rowsChecksum: checksum(JSON.stringify(rows.map((row) => [row.source_ref, row.workspace_revision, row.code_source_revision, row.content_hash, row.byte_length]))),
  sample: classifications.slice(0, 100),
  canonicalAuthority: false,
  writesPerformed: false,
};
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: 'wx' });
console.log(JSON.stringify({ ...receipt, sample: undefined, outputPath: path.relative(REPO_ROOT, outputPath), outputFileSha256: checksum(fs.readFileSync(outputPath, 'utf8')) }, null, 2));
