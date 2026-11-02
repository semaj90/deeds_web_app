#!/usr/bin/env node
/**
 * Validate a reviewed null-content-hash manifest without touching Postgres or
 * Qdrant. This is intentionally a dry-run boundary; it has no apply mode.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const reportDir = process.env.NULL_HASH_AUDIT_REPORT_DIR ?? 'docs/reports';
const reportPath = process.env.NULL_HASH_AUDIT_REPORT ?? path.join(reportDir, 'null-content-hash-repairability.json');
const manifestPath = process.env.NULL_HASH_AUDIT_MANIFEST ?? path.join(reportDir, 'null-content-hash-repairability.ndjson');
const outputPath = process.env.NULL_HASH_REPAIR_DRY_RUN_REPORT ?? path.join(reportDir, 'null-content-hash-repair-dry-run.json');
const collection = process.env.QDRANT_COLLECTION_V2 ?? 'codebase_chunks_768_v2';

function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stable(item)}`).join(',')}}`;
  }
  return JSON.stringify(value) ?? 'null';
}

function digest(value) {
  return createHash('sha256').update(stable(value), 'utf8').digest('hex');
}

function fail(message) {
  throw new Error(`NULL_HASH_DRY_RUN_INVALID:${message}`);
}

const audit = JSON.parse(readFileSync(reportPath, 'utf8'));
const rows = readFileSync(manifestPath, 'utf8').trim()
  ? readFileSync(manifestPath, 'utf8').trim().split(/\r?\n/).map((line) => JSON.parse(line))
  : [];

if (audit.readOnly !== true || audit.mutationAuthorized !== false) fail('audit-is-not-read-only');
if (audit.collection !== collection) fail(`collection-mismatch:${audit.collection}:${collection}`);
if (digest(rows) !== audit.manifestChecksum) fail('manifest-checksum-mismatch');
if (rows.length !== audit.metadataRepairCandidates) fail('candidate-count-mismatch');

const invalid = [];
for (const [index, row] of rows.entries()) {
  const errors = [];
  if (row.schema !== 'atlas.null-content-hash-repair-candidate.v1') errors.push('schema');
  if (!row.postgresId || row.qdrantPointId !== row.postgresId) errors.push('point-id-not-postgres-id');
  if (row.qdrantCollection !== collection) errors.push('collection');
  if (!row.relativePath || !row.computedContentHash) errors.push('source-identity');
  if (row.proposedChunkId !== `card:${row.relativePath}:${row.computedContentHash}`) errors.push('proposed-chunk-id');
  if (row.expectedOldPayloadContentHash !== null) errors.push('old-content-hash-not-null');
  if (row.canonicalWritesAuthorized !== false) errors.push('mutation-authorized');
  if (errors.length) invalid.push({ index, postgresId: row.postgresId ?? null, errors });
}

const result = {
  schema: 'atlas.null-content-hash-repair-dry-run.v1',
  status: invalid.length === 0 ? 'DRY_RUN_ELIGIBLE' : 'DRY_RUN_REJECTED',
  readOnly: true,
  mutationAuthorized: false,
  applySupported: false,
  collection,
  auditReport: reportPath,
  manifest: manifestPath,
  manifestChecksum: audit.manifestChecksum,
  candidateCount: rows.length,
  invalidCount: invalid.length,
  invalid,
  postgresWrites: 0,
  qdrantWrites: 0,
  valkeyWrites: 0,
  vectorWrites: 0,
  embeddingWrites: 0,
};

writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
console.log(JSON.stringify({ ...result, reportPath: outputPath }, null, 2));
