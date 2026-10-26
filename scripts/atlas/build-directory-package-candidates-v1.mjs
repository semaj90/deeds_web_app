#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statfsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Int32, Table, Utf8, tableFromIPC, tableToIPC, vectorFromArray } from 'apache-arrow';
import { REPO_ROOT } from './connection-config.mjs';
import { aggregateDirectoryPackageCandidatesV1 } from './lib/directory-package-candidates-v1.mjs';

const arg = name => process.argv.find(value => value.startsWith(`${name}=`))?.slice(name.length + 1);
const root = path.resolve(REPO_ROOT);
const runId = arg('--run-id') ?? '';
if (!/^dir-package-[a-z0-9-]{1,48}$/.test(runId)) throw new Error('RUN_ID_INVALID');
const packageManifestPath = path.resolve(root, arg('--package-manifest') ?? '');
const rollupManifestPath = path.resolve(root, arg('--rollup-manifest') ?? '');
for (const filePath of [packageManifestPath, rollupManifestPath]) {
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

const packageManifest = readJson(packageManifestPath);
verifyReceipt(packageManifest, 'atlas.directory-intelligence-package-references.v1');
const rollupManifest = readJson(rollupManifestPath);
verifyReceipt(rollupManifest, 'atlas.directory-intelligence-rollup.v1');
if (packageManifest.sourcePathArtifactSha256 !== rollupManifest.sourceArrowSha256
  || packageManifest.sourceDirectorySnapshotReceiptSha256 !== rollupManifest.sourcePathManifestReceiptSha256) {
  throw new Error('PACKAGE_AND_DIRECTORY_SNAPSHOT_MISMATCH');
}
const packageArtifactPath = path.resolve(root, packageManifest.referencesArtifactPath);
const directoryArtifactPath = path.resolve(root, rollupManifest.directoriesArtifactPath);
for (const artifactPath of [packageArtifactPath, directoryArtifactPath]) {
  if (!artifactPath.startsWith(`${root}${path.sep}`)) throw new Error('INPUT_ARTIFACT_OUTSIDE_REPOSITORY');
}
const packageBytes = readFileSync(packageArtifactPath);
const directoryBytes = readFileSync(directoryArtifactPath);
if (sha256(packageBytes) !== packageManifest.referencesArtifactSha256
  || sha256(directoryBytes) !== rollupManifest.directoriesArtifactSha256) throw new Error('INPUT_ARTIFACT_CHECKSUM_INVALID');

const packageTable = tableFromIPC(packageBytes);
const directoryTable = tableFromIPC(directoryBytes);
const references = [];
for (let index = 0; index < packageTable.numRows; index += 1) {
  references.push(Object.fromEntries(packageTable.schema.fields.map(field => [field.name, packageTable.getChild(field.name).get(index)])));
}
const directories = [];
for (let index = 0; index < directoryTable.numRows; index += 1) {
  directories.push({
    directoryPath: directoryTable.getChild('directoryPath').get(index),
    profileLanguageCountsJson: directoryTable.getChild('profileLanguageCountsJson').get(index),
  });
}
const aggregated = aggregateDirectoryPackageCandidatesV1({ references, directories });
const fields = [
  ['directoryPath', 'utf8'], ['ecosystem', 'utf8'], ['packageName', 'utf8'],
  ['directReferenceCount', 'int32'], ['subtreeReferenceCount', 'int32'],
  ['directFileCount', 'int32'], ['subtreeFileCount', 'int32'],
  ['versionQualifiedReferenceCount', 'int32'], ['versionUnqualifiedReferenceCount', 'int32'],
  ['versionCountsJson', 'utf8'], ['profileLanguageCountsJson', 'utf8'], ['evidenceStatus', 'utf8'],
];
const vectors = Object.fromEntries(fields.map(([name, type]) => [name,
  type === 'int32' ? vectorFromArray(aggregated.rows.map(row => row[name]), new Int32())
    : vectorFromArray(aggregated.rows.map(row => row[name]), new Utf8()),
]));
const outputBytes = tableToIPC(new Table(vectors), 'file');
const rejectedBytes = Buffer.from(aggregated.rejected.map(row => JSON.stringify(row)).join('\n')
  + (aggregated.rejected.length ? '\n' : ''), 'utf8');
const outputDir = path.join(root, '.tmp', 'atlas', 'directory-intelligence', runId);
const disk = statfsSync(root);
if (disk.bavail * disk.bsize < (outputBytes.byteLength + rejectedBytes.byteLength + 1_000_000) * 2) {
  throw new Error('INSUFFICIENT_OUTPUT_DISK_HEADROOM');
}
mkdirSync(outputDir, { recursive: true });
const artifactPath = path.join(outputDir, 'directory-package-candidates.arrow');
const rejectedPath = path.join(outputDir, 'rejected-package-candidates.jsonl');
writeFileSync(artifactPath, outputBytes, { flag: 'wx' });
writeFileSync(rejectedPath, rejectedBytes, { flag: 'wx' });
const readback = tableFromIPC(readFileSync(artifactPath));
if (readback.numRows !== aggregated.rows.length || readback.numCols !== fields.length) throw new Error('OUTPUT_ARROW_READBACK_INVALID');
const manifest = {
  schema: 'atlas.directory-package-candidates.v1',
  status: 'DERIVED_ADVISORY_TAXONOMY',
  canonicalAuthority: false,
  writesPerformed: false,
  packageReferencesManifest: path.relative(root, packageManifestPath).replaceAll('\\', '/'),
  packageReferencesReceiptSha256: packageManifest.receiptSha256,
  packageReferencesArtifactSha256: packageManifest.referencesArtifactSha256,
  directoryRollupManifest: path.relative(root, rollupManifestPath).replaceAll('\\', '/'),
  directoryRollupReceiptSha256: rollupManifest.receiptSha256,
  directoryArtifactSha256: rollupManifest.directoriesArtifactSha256,
  inputReferenceRows: references.length,
  inputDirectoryRows: directories.length,
  outputDirectoryPackageRows: aggregated.rows.length,
  rejectedRows: aggregated.rejected.length,
  artifactPath: path.relative(root, artifactPath).replaceAll('\\', '/'),
  artifactSha256: sha256(outputBytes),
  artifactBytes: outputBytes.byteLength,
  rejectedArtifactPath: path.relative(root, rejectedPath).replaceAll('\\', '/'),
  rejectedArtifactSha256: sha256(rejectedBytes),
  featureSemantics: 'counts of regex-derived package-reference candidates aggregated by relative directory ancestry; language counts copied from the profile inventory rollup',
  authorityLimit: 'no workspace revision, canonical source identity, parser validation, package export validation, semantic domain label, or runtime-use claim',
};
manifest.receiptSha256 = sha256(Buffer.from(canonical(manifest)));
const manifestPath = path.join(outputDir, 'manifest.json');
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
const verify = readJson(manifestPath);
const receiptSha256 = verify.receiptSha256;
delete verify.receiptSha256;
if (sha256(Buffer.from(canonical(verify))) !== receiptSha256
  || sha256(readFileSync(artifactPath)) !== manifest.artifactSha256
  || sha256(readFileSync(rejectedPath)) !== manifest.rejectedArtifactSha256) throw new Error('OUTPUT_RECEIPT_READBACK_FAILED');
console.log(JSON.stringify({ status: manifest.status, manifestPath: path.relative(root, manifestPath).replaceAll('\\', '/'),
  receiptSha256, outputDirectoryPackageRows: manifest.outputDirectoryPackageRows, rejectedRows: manifest.rejectedRows }));
