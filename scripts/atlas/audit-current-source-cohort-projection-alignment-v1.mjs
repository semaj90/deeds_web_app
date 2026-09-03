#!/usr/bin/env node

/**
 * Read-only alignment audit for the current lineage cohort versus the exact
 * source projection cohort and indexable-source manifest.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(fileURLToPath(new URL('../..', import.meta.url)));
const lineagePath = path.join(root, 'docs/reports/current-source-cohort-lineage-v1.json');
const projectionPath = path.join(root, 'docs/reports/current-source-projection-cohort-v1.json');
const manifestPath = path.join(root, '.tmp/atlas/indexable-source-manifest-v1/manifest.jsonl');
const reportPath = path.join(root, 'docs/reports/current-source-cohort-projection-alignment-v1.json');

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));
const readJsonl = (filePath) => fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean).map(JSON.parse);
const normalize = (value) => String(value ?? '').trim().replaceAll('\\', '/').replace(/^\.\//, '').toLowerCase();
const digest = (value) => `sha256:${crypto.createHash('sha256').update(value, 'utf8').digest('hex')}`;
const fileDigest = (relativePath) => {
  try {
    return digest(fs.readFileSync(path.join(root, relativePath)));
  } catch {
    return null;
  }
};
const bareHash = (value) => String(value ?? '').replace(/^sha256:/i, '').toLowerCase();

const lineage = readJson(lineagePath);
const projection = readJson(projectionPath);
const manifest = readJsonl(manifestPath);
const lineageRows = (lineage.rows ?? []).filter((row) => row.relativePath && row.sourceRevision);
const projectionRows = projection.cohort ?? [];
const projectionByRef = new Map(projectionRows.map((row) => [normalize(row.relativePath), row]));
const manifestByRef = new Map(manifest.map((row) => [normalize(row.relativePath), row]));

const rows = lineageRows.map((row) => {
  const ref = normalize(row.relativePath);
  const admitted = projectionByRef.get(ref) ?? null;
  const manifestRow = manifestByRef.get(ref) ?? null;
  const currentHash = fileDigest(row.relativePath);
  const lineageHash = bareHash(row.sourceRevision);
  const manifestHash = bareHash(manifestRow?.contentHash);
  let hashClassification = 'UNKNOWN';
  if (!currentHash) hashClassification = 'CURRENT_FILE_MISSING';
  else if (lineageHash && bareHash(currentHash) === lineageHash) hashClassification = 'LINEAGE_REVISION_MATCHES_CURRENT_FILE';
  else if (manifestHash && bareHash(currentHash) === manifestHash) hashClassification = 'MANIFEST_HASH_MATCHES_CURRENT_FILE';
  else if (lineageHash && manifestHash && lineageHash === manifestHash) hashClassification = 'LINEAGE_MANIFEST_MATCH_BUT_CURRENT_DRIFT';
  else if (manifestRow) hashClassification = 'HASH_MISMATCH_OR_SCOPE_DRIFT';
  else hashClassification = 'MANIFEST_MISSING';
  let classification = 'LINEAGE_ONLY_NOT_PROJECTION_ADMITTED';
  if (admitted) classification = 'PROJECTION_EXACT_FILE_BYTES_ADMITTED';
  else if (!manifestRow) classification = 'LINEAGE_ONLY_MANIFEST_MISSING';
  else if (manifestRow.canonicalAdmission !== true) classification = 'MANIFEST_NOT_CANONICALLY_ADMITTED';
  return {
    relativePath: row.relativePath,
    sourceRevision: row.sourceRevision,
    workspaceRevision: row.workspaceRevision ?? null,
    projectionHash: admitted?.filesystemHash ?? null,
    manifestHash: manifestRow?.contentHash ?? null,
    currentFilesystemHash: currentHash,
    hashClassification,
    manifestStatus: manifestRow?.status ?? null,
    manifestCanonicalAdmission: manifestRow?.canonicalAdmission ?? null,
    classification,
  };
});

const counts = {};
for (const row of rows) counts[row.classification] = (counts[row.classification] ?? 0) + 1;
const output = {
  schema: 'atlas.current-source-cohort-projection-alignment.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY',
  inputs: {
    lineage: 'docs/reports/current-source-cohort-lineage-v1.json',
    projection: 'docs/reports/current-source-projection-cohort-v1.json',
    manifest: '.tmp/atlas/indexable-source-manifest-v1/manifest.jsonl',
  },
  counts: { lineageRows: lineageRows.length, projectionRows: projectionRows.length, manifestRows: manifest.length, ...counts },
  rows,
  selectionChecksum: digest(rows.map((row) => `${row.relativePath}|${row.sourceRevision}|${row.classification}`).join('\n')),
  canonicalAuthority: false,
  postgresWrites: false,
  qdrantWrites: false,
  graphifyWrites: false,
  relationshipWrites: false,
  status: 'COMPLETE_READ_ONLY',
  nextGate: 'SOURCE-PROJECTION-EXACT-BYTES-ADMISSION-01',
};
fs.writeFileSync(reportPath, `${JSON.stringify(output, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: output.status, counts: output.counts, selectionChecksum: output.selectionChecksum, reportPath: 'docs/reports/current-source-cohort-projection-alignment-v1.json', writes: false }, null, 2));
