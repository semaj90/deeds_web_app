#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statfsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Int32, Table, Utf8, tableFromIPC, tableToIPC, vectorFromArray } from 'apache-arrow';
import { REPO_ROOT } from './connection-config.mjs';
import { buildDirectoryMetadataSummariesV1 } from './lib/directory-metadata-summaries-v1.mjs';

const arg = name => process.argv.find(value => value.startsWith(`${name}=`))?.slice(name.length + 1);
const root = path.resolve(REPO_ROOT);
const runId = arg('--run-id') ?? '';
if (!/^dir-summaries-[a-z0-9-]{1,48}$/.test(runId)) throw new Error('RUN_ID_INVALID');
const featureManifestPath = path.resolve(root, arg('--feature-manifest') ?? '');
const packageManifestPath = path.resolve(root, arg('--package-manifest') ?? '');
const rollupManifestPath = path.resolve(root, arg('--rollup-manifest') ?? '');
for (const filePath of [featureManifestPath, packageManifestPath, rollupManifestPath]) {
  if (!filePath.startsWith(`${root}${path.sep}`)) throw new Error('INPUT_OUTSIDE_REPOSITORY');
}
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
    : JSON.stringify(value);
const readJson = filePath => JSON.parse(readFileSync(filePath, 'utf8'));
function verifyReceipt(value, expectedSchema) {
  const body = { ...value };
  delete body.receiptSha256;
  if (value.schema !== expectedSchema || sha256(Buffer.from(canonical(body))) !== value.receiptSha256) {
    throw new Error('INPUT_RECEIPT_INVALID');
  }
}
function arrowRows(bytes) {
  const table = tableFromIPC(bytes);
  return Array.from({ length: table.numRows }, (_, index) => Object.fromEntries(
    table.schema.fields.map(field => [field.name, table.getChild(field.name).get(index)])));
}
function safeArtifact(filePath, expectedSha256) {
  const resolved = path.resolve(root, filePath);
  if (!resolved.startsWith(`${root}${path.sep}`)) throw new Error('INPUT_ARTIFACT_OUTSIDE_REPOSITORY');
  const bytes = readFileSync(resolved);
  if (sha256(bytes) !== expectedSha256) throw new Error('INPUT_ARTIFACT_CHECKSUM_INVALID');
  return bytes;
}

const featureManifest = readJson(featureManifestPath);
const packageManifest = readJson(packageManifestPath);
const rollupManifest = readJson(rollupManifestPath);
verifyReceipt(featureManifest, 'atlas.directory-feature-matrix.v1');
verifyReceipt(packageManifest, 'atlas.directory-package-candidates.v1');
verifyReceipt(rollupManifest, 'atlas.directory-intelligence-rollup.v1');
if (featureManifest.directoryPackageReceiptSha256 !== packageManifest.receiptSha256
  || featureManifest.directoryRollupReceiptSha256 !== rollupManifest.receiptSha256
  || packageManifest.directoryRollupReceiptSha256 !== rollupManifest.receiptSha256) {
  throw new Error('INPUT_LINEAGE_RECEIPT_MISMATCH');
}
const featureDir = path.dirname(featureManifestPath);
const directoryOrdinalBytes = safeArtifact(path.relative(root, path.join(featureDir, 'directory-ordinals.arrow')),
  featureManifest.artifacts['directory-ordinals.arrow'].sha256);
const featureOrdinalBytes = safeArtifact(path.relative(root, path.join(featureDir, 'feature-ordinals.arrow')),
  featureManifest.artifacts['feature-ordinals.arrow'].sha256);
const sparseBytes = safeArtifact(path.relative(root, path.join(featureDir, 'directory-features-sparse.arrow')),
  featureManifest.artifacts['directory-features-sparse.arrow'].sha256);
const packageBytes = safeArtifact(packageManifest.artifactPath, packageManifest.artifactSha256);
const directoryBytes = safeArtifact(rollupManifest.directoriesArtifactPath, rollupManifest.directoriesArtifactSha256);
const directoryOrdinals = arrowRows(directoryOrdinalBytes);
const featureOrdinals = arrowRows(featureOrdinalBytes);
const sparseRows = arrowRows(sparseBytes);
const packageRows = arrowRows(packageBytes);
const directoryRows = arrowRows(directoryBytes);
if (directoryRows.length !== featureManifest.directoryRows || directoryOrdinals.length !== directoryRows.length
  || featureOrdinals.length !== featureManifest.featureRows || sparseRows.length !== featureManifest.sparseValueRows) {
  throw new Error('INPUT_ROW_COUNT_MISMATCH');
}
const directoryPathByOrdinal = new Map(directoryOrdinals.map(row => [row.ordinal, row.relativePath]));
if (directoryPathByOrdinal.size !== directoryRows.length) throw new Error('DIRECTORY_ORDINAL_DUPLICATE');
const featureByOrdinal = new Map(featureOrdinals.map(row => [row.ordinal, row]));
if (featureByOrdinal.size !== featureOrdinals.length) throw new Error('FEATURE_ORDINAL_DUPLICATE');
const featuresByDirectory = new Map();
let previousKey = [-1, -1];
for (const row of sparseRows) {
  if (!directoryPathByOrdinal.has(row.entityOrdinal) || !featureByOrdinal.has(row.featureOrdinal)
    || row.value <= 0 || row.entityOrdinal < previousKey[0]
    || (row.entityOrdinal === previousKey[0] && row.featureOrdinal <= previousKey[1])) {
    throw new Error('SPARSE_MATRIX_ORDER_OR_VALUE_INVALID');
  }
  const relativePath = directoryPathByOrdinal.get(row.entityOrdinal);
  const feature = featureByOrdinal.get(row.featureOrdinal);
  const rows = featuresByDirectory.get(relativePath) ?? [];
  rows.push({ featureKey: feature.featureKey, evidenceKind: feature.evidenceKind, value: row.value });
  featuresByDirectory.set(relativePath, rows);
  previousKey = [row.entityOrdinal, row.featureOrdinal];
}
const inputBindings = {
  featureManifestReceiptSha256: featureManifest.receiptSha256,
  directoryPackageReceiptSha256: packageManifest.receiptSha256,
  directoryRollupReceiptSha256: rollupManifest.receiptSha256,
  featureArtifacts: Object.fromEntries(Object.entries(featureManifest.artifacts).map(([name, row]) => [name, row.sha256])),
  directoryPackageArtifactSha256: packageManifest.artifactSha256,
  directoryRollupArtifactSha256: rollupManifest.directoriesArtifactSha256,
  sourceInventorySha256: rollupManifest.sourceInventorySha256,
};
const result = buildDirectoryMetadataSummariesV1({ directories: directoryRows, featuresByDirectory,
  directPackageRows: packageRows, inputBindings });
if (result.summaries.length !== directoryRows.length || result.rejectedRows.length !== 0) {
  throw new Error('SUMMARY_COVERAGE_INCOMPLETE');
}
const fields = [
  ['relativePath', 'utf8'], ['parentPath', 'utf8'], ['depth', 'int32'], ['summaryKind', 'utf8'],
  ['summaryText', 'utf8'], ['topProfileLanguageCountsJson', 'utf8'], ['topPathRoleCountsJson', 'utf8'],
  ['topDirectPackageCandidatesJson', 'utf8'], ['inputDigest', 'utf8'], ['summarySha256', 'utf8'],
  ['coverageStatus', 'utf8'], ['unavailableEvidenceJson', 'utf8'],
];
const summaryRows = result.summaries.map(row => ({ ...row,
  topProfileLanguageCountsJson: canonical(row.topProfileLanguageCounts),
  topPathRoleCountsJson: canonical(row.topPathRoleCounts),
  topDirectPackageCandidatesJson: canonical(row.topDirectPackageCandidates),
  unavailableEvidenceJson: canonical(row.unavailableEvidence),
}));
const summaryBytes = tableToIPC(new Table(Object.fromEntries(fields.map(([name, type]) => [name,
  vectorFromArray(summaryRows.map(row => row[name] ?? (type === 'int32' ? 0 : '')),
    type === 'int32' ? new Int32() : new Utf8())]))), 'file');
const outputDir = path.join(root, '.tmp', 'atlas', 'directory-intelligence', runId);
const availableBytes = statfsSync(root).bavail * statfsSync(root).bsize;
if (availableBytes < (summaryBytes.byteLength + 1_000_000) * 2) throw new Error('INSUFFICIENT_OUTPUT_DISK_HEADROOM');
mkdirSync(outputDir, { recursive: false });
const artifactPath = path.join(outputDir, 'directory-summaries.arrow');
writeFileSync(artifactPath, summaryBytes, { flag: 'wx' });
const readback = tableFromIPC(readFileSync(artifactPath));
if (readback.numRows !== summaryRows.length || readback.numCols !== fields.length) throw new Error('OUTPUT_ARROW_READBACK_INVALID');
const manifest = {
  schema: 'atlas.directory-metadata-summaries.v1',
  status: 'DERIVED_ADVISORY_DETERMINISTIC_SUMMARIES',
  canonicalAuthority: false,
  writesPerformed: false,
  sourceInventorySha256: rollupManifest.sourceInventorySha256,
  inputBindings,
  directoryCount: directoryRows.length,
  summaryCount: summaryRows.length,
  rejectedRows: result.rejectedRows.length,
  summaryCoverage: 'ONE_SUMMARY_PER_DIRECTORY_IN_FROZEN_ROLLUP',
  contentCoverage: 'PROFILE_ROLE_AND_PACKAGE_REFERENCE_METADATA_ONLY; NO_AST_OR_SOURCE_TEXT_SUMMARIZATION',
  artifactPath: path.relative(root, artifactPath).replaceAll('\\', '/'),
  artifactSha256: sha256(summaryBytes),
  artifactBytes: summaryBytes.byteLength,
  columns: fields.map(([name]) => name),
  noDatabaseOrProjectionWrites: true,
};
manifest.receiptSha256 = sha256(Buffer.from(canonical(manifest)));
const manifestPath = path.join(outputDir, 'manifest.json');
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
const verification = readJson(manifestPath);
const receiptSha256 = verification.receiptSha256;
delete verification.receiptSha256;
if (sha256(Buffer.from(canonical(verification))) !== receiptSha256
  || sha256(readFileSync(artifactPath)) !== manifest.artifactSha256) throw new Error('OUTPUT_RECEIPT_READBACK_FAILED');
console.log(JSON.stringify({ status: manifest.status, manifestPath: path.relative(root, manifestPath).replaceAll('\\', '/'),
  receiptSha256, directoryCount: manifest.directoryCount, summaryCount: manifest.summaryCount,
  artifactBytes: manifest.artifactBytes, artifactSha256: manifest.artifactSha256 }));
