#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statfsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Int32, Table, Utf8, tableFromIPC, tableToIPC, vectorFromArray } from 'apache-arrow';
import { REPO_ROOT } from './connection-config.mjs';
import { buildDirectoryFeatureMatrixV1 } from './lib/directory-feature-matrix-v1.mjs';

const arg = name => process.argv.find(value => value.startsWith(`${name}=`))?.slice(name.length + 1);
const root = path.resolve(REPO_ROOT);
const runId = arg('--run-id') ?? '';
if (!/^dir-features-[a-z0-9-]{1,48}$/.test(runId)) throw new Error('RUN_ID_INVALID');
const packageManifestPath = path.resolve(root, arg('--package-manifest') ?? '');
const packageRowsPath = path.resolve(root, arg('--package-rows') ?? '');
const rollupManifestPath = path.resolve(root, arg('--rollup-manifest') ?? '');
for (const inputPath of [packageManifestPath, packageRowsPath, rollupManifestPath]) {
  if (!inputPath.startsWith(`${root}${path.sep}`)) throw new Error('INPUT_OUTSIDE_REPOSITORY');
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

const packageManifest = readJson(packageManifestPath);
verifyReceipt(packageManifest, 'atlas.directory-intelligence-package-references.v1');
const packageRowsManifest = readJson(packageRowsPath);
verifyReceipt(packageRowsManifest, 'atlas.directory-package-candidates.v1');
const rollupManifest = readJson(rollupManifestPath);
verifyReceipt(rollupManifest, 'atlas.directory-intelligence-rollup.v1');
if (packageRowsManifest.packageReferencesReceiptSha256 !== packageManifest.receiptSha256
  || packageRowsManifest.directoryRollupReceiptSha256 !== rollupManifest.receiptSha256) {
  throw new Error('FEATURE_INPUT_RECEIPT_MISMATCH');
}
const packageArtifactPath = path.resolve(root, packageRowsManifest.artifactPath);
const directoryArtifactPath = path.resolve(root, rollupManifest.directoriesArtifactPath);
for (const artifactPath of [packageArtifactPath, directoryArtifactPath]) {
  if (!artifactPath.startsWith(`${root}${path.sep}`)) throw new Error('INPUT_ARTIFACT_OUTSIDE_REPOSITORY');
}
const packageBytes = readFileSync(packageArtifactPath);
const directoryBytes = readFileSync(directoryArtifactPath);
if (sha256(packageBytes) !== packageRowsManifest.artifactSha256
  || sha256(directoryBytes) !== rollupManifest.directoriesArtifactSha256) throw new Error('INPUT_ARTIFACT_CHECKSUM_INVALID');

const packageTable = tableFromIPC(packageBytes);
const directoryTable = tableFromIPC(directoryBytes);
const packageRows = [];
for (let index = 0; index < packageTable.numRows; index += 1) {
  packageRows.push(Object.fromEntries(packageTable.schema.fields.map(field => [field.name, packageTable.getChild(field.name).get(index)])));
}
const directories = [];
for (let index = 0; index < directoryTable.numRows; index += 1) {
  directories.push({
    directoryPath: directoryTable.getChild('directoryPath').get(index),
    profileLanguageCountsJson: directoryTable.getChild('profileLanguageCountsJson').get(index),
    roleCountsJson: directoryTable.getChild('roleCountsJson').get(index),
  });
}
const result = buildDirectoryFeatureMatrixV1({ directories, packageRows });
const directoryBytesOut = tableToIPC(new Table({
  ordinal: vectorFromArray(result.directoryRows.map(row => row.ordinal), new Int32()),
  relativePath: vectorFromArray(result.directoryRows.map(row => row.directoryPath), new Utf8()),
}), 'file');
const featureBytesOut = tableToIPC(new Table({
  ordinal: vectorFromArray(result.featureRows.map(row => row.ordinal), new Int32()),
  featureKey: vectorFromArray(result.featureRows.map(row => row.featureKey), new Utf8()),
  evidenceKind: vectorFromArray(result.featureRows.map(row => row.evidenceKind), new Utf8()),
}), 'file');
const matrixBytesOut = tableToIPC(new Table({
  entityOrdinal: vectorFromArray(result.sparseRows.map(row => row.entityOrdinal), new Int32()),
  featureOrdinal: vectorFromArray(result.sparseRows.map(row => row.featureOrdinal), new Int32()),
  value: vectorFromArray(result.sparseRows.map(row => row.value), new Int32()),
}), 'file');
const outputDir = path.join(root, '.tmp', 'atlas', 'directory-intelligence', runId);
const disk = statfsSync(root);
const outputSize = directoryBytesOut.byteLength + featureBytesOut.byteLength + matrixBytesOut.byteLength;
if (disk.bavail * disk.bsize < (outputSize + 2_000_000) * 2) throw new Error('INSUFFICIENT_OUTPUT_DISK_HEADROOM');
mkdirSync(outputDir, { recursive: true });
const outputs = [
  ['directory-ordinals.arrow', directoryBytesOut],
  ['feature-ordinals.arrow', featureBytesOut],
  ['directory-features-sparse.arrow', matrixBytesOut],
];
for (const [name, bytes] of outputs) writeFileSync(path.join(outputDir, name), bytes, { flag: 'wx' });
const readbacks = outputs.map(([name]) => tableFromIPC(readFileSync(path.join(outputDir, name))));
if (readbacks[0].numRows !== result.directoryRows.length
  || readbacks[1].numRows !== result.featureRows.length
  || readbacks[2].numRows !== result.sparseRows.length) throw new Error('FEATURE_ARROW_READBACK_INVALID');
const manifest = {
  schema: 'atlas.directory-feature-matrix.v1',
  status: 'DERIVED_ADVISORY_SPARSE_FEATURES',
  canonicalAuthority: false,
  writesPerformed: false,
  packageReferenceReceiptSha256: packageManifest.receiptSha256,
  directoryPackageReceiptSha256: packageRowsManifest.receiptSha256,
  directoryRollupReceiptSha256: rollupManifest.receiptSha256,
  directoryRows: result.directoryRows.length,
  featureRows: result.featureRows.length,
  sparseValueRows: result.sparseRows.length,
  featureKinds: Object.fromEntries([...new Set(result.featureRows.map(row => row.evidenceKind))].sort().map(kind => [kind,
    result.featureRows.filter(row => row.evidenceKind === kind).length])),
  ordering: { directories: 'UTF-8 bytewise relative path', features: 'UTF-8 bytewise feature key', sparse: 'entity ordinal then feature ordinal' },
  artifacts: Object.fromEntries(outputs.map(([name, bytes]) => [name, { sha256: sha256(bytes), bytes: bytes.byteLength }])),
  identityPolicy: 'run-local ordinals map to relative paths and feature strings; never canonical identity or persistent feature IDs',
  evidencePolicy: 'profile and role counts derive from physical inventory; package counts derive from regex import candidates; no feature labels, embeddings, or reviewed relevance judgments',
  noDatabaseOrGpuWrites: true,
};
manifest.receiptSha256 = sha256(Buffer.from(canonical(manifest)));
const manifestPath = path.join(outputDir, 'manifest.json');
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
const readbackManifest = readJson(manifestPath);
const receiptSha256 = readbackManifest.receiptSha256;
delete readbackManifest.receiptSha256;
if (sha256(Buffer.from(canonical(readbackManifest))) !== receiptSha256) throw new Error('FEATURE_RECEIPT_READBACK_FAILED');
for (const [name, expected] of Object.entries(manifest.artifacts)) {
  if (sha256(readFileSync(path.join(outputDir, name))) !== expected.sha256) throw new Error('FEATURE_ARTIFACT_READBACK_FAILED');
}
console.log(JSON.stringify({ status: manifest.status, manifestPath: path.relative(root, manifestPath).replaceAll('\\', '/'),
  receiptSha256, directoryRows: manifest.directoryRows, featureRows: manifest.featureRows,
  sparseValueRows: manifest.sparseValueRows }));
