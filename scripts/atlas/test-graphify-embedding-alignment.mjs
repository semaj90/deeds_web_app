#!/usr/bin/env node
/** Dry-run smoke test for the daily Graphify embedding alignment chain. */
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { REPO_ROOT } from './connection-config.mjs';

const checks = [
  ['canonical embedding plan', 'backfill-graphify-file-embeddings-768.mjs', ['--limit=4', '--since-hours=24']],
  ['signature RFF plan', 'backfill-graphify-rff-embeddings-768.mjs', ['--signature-only', '--limit=4', '--since-hours=24']],
  ['content Qdrant projection plan', 'project-graphify-embeddings-qdrant.mjs', ['--vector-name=content', '--limit=4', '--since-hours=24', '--out=docs/reports/test-graphify-content-projection.json']],
  ['signature Qdrant projection plan', 'project-graphify-embeddings-qdrant.mjs', ['--vector-name=signature', '--limit=4', '--since-hours=24', '--out=docs/reports/test-graphify-signature-projection.json']],
  ['feature alignment receipt', 'build-graphify-daily-feature-alignment.mjs', ['--limit=16', '--since-hours=24']],
  ['lexical owner receipt', 'audit-graphify-lexical-owner.mjs', ['--out=docs/reports/test-graphify-lexical-owner.json']],
];

const reportPaths = [
  'docs/reports/graphify-file-embedding-backfill-v1.json',
  'docs/reports/graphify-rff-embedding-backfill-v1.json',
  'docs/reports/test-graphify-content-projection.json',
  'docs/reports/test-graphify-signature-projection.json',
  'docs/reports/graphify-daily-feature-alignment-v1.json',
  'docs/reports/test-graphify-lexical-owner.json',
];
const failures = [];
for (const [label, script, args] of checks) {
  const result = spawnSync(process.execPath, [path.join(REPO_ROOT, 'scripts/atlas', script), ...args], { cwd: REPO_ROOT, encoding: 'utf8' });
  if (result.status !== 0) failures.push(`${label}: process exit ${result.status}: ${(result.stderr || result.stdout).slice(-300)}`);
}

function readReport(relativePath) {
  const absolutePath = path.join(REPO_ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) { failures.push(`${relativePath}: report missing`); return null; }
  try { return JSON.parse(fs.readFileSync(absolutePath, 'utf8')); } catch (error) { failures.push(`${relativePath}: invalid JSON ${error.message}`); return null; }
}

const canonical = readReport(reportPaths[0]);
if (canonical && !['DRY_RUN', 'PASS'].includes(canonical.status)) failures.push(`canonical plan status: ${canonical.status}`);
if (canonical && canonical.scope?.declaredType !== 'vector(768)') failures.push(`canonical vector type: ${canonical.scope?.declaredType ?? 'missing'}`);
const rff = readReport(reportPaths[1]);
if (rff && !['DRY_RUN', 'BLOCKED_DIMENSION_CONTRACT'].includes(rff.status)) failures.push(`RFF plan status: ${rff.status}`);
const content = readReport(reportPaths[2]);
if (content && content.qdrant?.vectorName !== 'content') failures.push('content projection vector name mismatch');
if (content && content.sourceColumn !== 'content_embedding_768') failures.push('content projection source column mismatch');
if (content && !content.qdrant?.projectionRevision) failures.push('content projection revision missing');
if (content && !content.payloadFields?.includes('canonical_id')) failures.push('content canonical payload field missing');
const signature = readReport(reportPaths[3]);
if (signature && signature.qdrant?.vectorName !== 'signature') failures.push('signature projection vector name mismatch');
if (signature && signature.sourceColumn !== 'signature_embedding') failures.push('signature projection source column mismatch');
if (signature && !signature.qdrant?.projectionRevision) failures.push('signature projection revision missing');
const alignment = readReport(reportPaths[4]);
if (alignment && alignment.readOnly !== true) failures.push('alignment receipt is not read-only');
if (alignment) {
  for (const lane of ['semantic_768', 'bm25', 'ast', 'error_embedding', 'signature_embedding', 'pagerank', 'feature_pagerank', 'centroid', 'latent_64', 'qdrant']) {
    if (!alignment.coverage?.[lane]) failures.push(`alignment lane missing: ${lane}`);
  }
}
const lexical = readReport(reportPaths[5]);
if (lexical && lexical.readOnly !== true) failures.push('lexical owner receipt is not read-only');
if (lexical && lexical.owner !== 'POSTGRES_FTS_TSVECTOR_TS_RANK_CD') failures.push(`lexical owner mismatch: ${lexical.owner ?? 'missing'}`);

if (failures.length) {
  console.error(JSON.stringify({ status: 'FAIL', failures }, null, 2));
  process.exit(1);
}
console.log(JSON.stringify({ status: 'PASS', checks: checks.map(([label]) => label), dryRunOnly: true }, null, 2));
