#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statfsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Int32, Table, Utf8, tableFromIPC, tableToIPC, vectorFromArray } from 'apache-arrow';
import { REPO_ROOT } from './connection-config.mjs';
import { buildRuntimeOwnerDirectoryCandidatesV1 } from './lib/runtime-owner-directory-candidates-v1.mjs';

const arg = name => process.argv.find(value => value.startsWith(`${name}=`))?.slice(name.length + 1);
const root = path.resolve(REPO_ROOT);
const runId = arg('--run-id') ?? '';
if (!/^runtime-owner-candidates-[a-z0-9-]{1,48}$/.test(runId)) throw new Error('RUN_ID_INVALID');
const resolveRepoPath = relativePath => {
  const resolved = path.resolve(root, relativePath);
  if (!resolved.startsWith(`${root}${path.sep}`)) throw new Error('INPUT_OUTSIDE_REPOSITORY');
  return resolved;
};
const inventoryManifestPathArg = arg('--inventory-manifest') ?? '.tmp/atlas/directory-intelligence/whole-repo-20261022t204016z/manifest.json';
const rollupManifestPathArg = arg('--rollup-manifest') ?? '.tmp/atlas/directory-intelligence/rollup-fresh-20261023-a/manifest.json';
const rollupManifestPath = resolveRepoPath(rollupManifestPathArg);
const registryPath = path.join(root, 'docs/architecture/runtime-ownership-registry.json');
const rollupManifest = JSON.parse(readFileSync(rollupManifestPath, 'utf8'));
const inventoryManifestPath = resolveRepoPath(inventoryManifestPathArg);
const inventoryManifest = JSON.parse(readFileSync(inventoryManifestPath, 'utf8'));
const registryBytes = readFileSync(registryPath);
const registry = JSON.parse(registryBytes.toString('utf8'));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
    : JSON.stringify(value);
const verifyReceipt = (manifest, schema) => {
  const body = { ...manifest };
  delete body.receiptSha256;
  if (manifest.schema !== schema || sha256(Buffer.from(canonical(body))) !== manifest.receiptSha256) throw new Error('INPUT_RECEIPT_INVALID');
};
verifyReceipt(inventoryManifest, 'atlas.directory-intelligence-path-snapshot.v1');
verifyReceipt(rollupManifest, 'atlas.directory-intelligence-rollup.v1');
if (inventoryManifest.sourceEnumerationStatus !== 'COMPLETE' || inventoryManifest.canonicalAuthority !== false
  || inventoryManifest.writesPerformed !== false || rollupManifest.canonicalAuthority !== false || rollupManifest.writesPerformed !== false) {
  throw new Error('INPUT_SNAPSHOT_STATUS_INVALID');
}
if (path.resolve(root, rollupManifest.sourcePathManifestReceipt) !== inventoryManifestPath) throw new Error('INPUT_INVENTORY_MANIFEST_MISMATCH');
const inventoryBytes = readFileSync(resolveRepoPath(rollupManifest.sourceArrowPath));
const directoryBytes = readFileSync(resolveRepoPath(rollupManifest.directoriesArtifactPath));
if (sha256(inventoryBytes) !== rollupManifest.sourceArrowSha256
  || sha256(directoryBytes) !== rollupManifest.directoriesArtifactSha256
  || inventoryManifest.receiptSha256 !== rollupManifest.sourcePathManifestReceiptSha256
  || inventoryManifest.artifactSha256 !== rollupManifest.sourceArrowSha256
  || inventoryManifest.rows !== rollupManifest.sourcePathCount
  || inventoryManifest.sourceInventorySha256 !== rollupManifest.sourceInventorySha256) {
  throw new Error('RUNTIME_OWNER_INVENTORY_ROLLUP_MISMATCH');
}
const inventoryTable = tableFromIPC(inventoryBytes);
const directoryTable = tableFromIPC(directoryBytes);
const inventoryPaths = new Set();
const currentFileDigests = new Map();
for (let index = 0; index < inventoryTable.numRows; index += 1) {
  const relativePath = inventoryTable.getChild('relativePath').get(index);
  if (inventoryTable.getChild('entryKind').get(index) === 'FILE') inventoryPaths.add(relativePath);
}
const directoryPaths = new Set();
for (let index = 0; index < directoryTable.numRows; index += 1) directoryPaths.add(directoryTable.getChild('directoryPath').get(index));
for (const capability of Object.values(registry.capabilities ?? {})) {
  const ownerPath = typeof capability?.owner?.path === 'string' ? capability.owner.path.replaceAll('\\', '/') : '';
  if (!ownerPath || ownerPath.includes(' -> ') || ownerPath.includes(';') || ownerPath.includes(':')
    || ownerPath.startsWith('/') || ownerPath.split('/').includes('..') || !inventoryPaths.has(ownerPath)) continue;
  currentFileDigests.set(ownerPath, sha256(readFileSync(resolveRepoPath(ownerPath))));
}
const result = buildRuntimeOwnerDirectoryCandidatesV1({ registry, inventoryPaths, directoryPaths, currentFileDigests });
const candidateRows = result.rows;
const candidateBytes = tableToIPC(new Table({
  capabilityId: vectorFromArray(candidateRows.map(row => row.capabilityId), new Utf8()),
  ownerClassification: vectorFromArray(candidateRows.map(row => row.ownerClassification), new Utf8()),
  ownerPath: vectorFromArray(candidateRows.map(row => row.ownerPath), new Utf8()),
  ownerFileSha256: vectorFromArray(candidateRows.map(row => row.ownerFileSha256), new Utf8()),
  parentDirectoryPath: vectorFromArray(candidateRows.map(row => row.parentDirectoryPath), new Utf8()),
  evidenceKind: vectorFromArray(candidateRows.map(row => row.evidenceKind), new Utf8()),
  executionProven: vectorFromArray(candidateRows.map(row => row.executionProven), new Int32()),
  sourceRevisionQualified: vectorFromArray(candidateRows.map(row => row.sourceRevisionQualified), new Int32()),
}), 'file');
const rejectedBytes = Buffer.from(`${JSON.stringify(result.rejected, null, 2)}\n`);
const outputDir = path.join(root, '.tmp/atlas/directory-intelligence/runtime-owner-candidates', runId);
const disk = statfsSync(root);
const outputSize = candidateBytes.byteLength + rejectedBytes.byteLength + 100_000;
if (disk.bavail * disk.bsize < outputSize * 2) throw new Error('INSUFFICIENT_OUTPUT_DISK_HEADROOM');
mkdirSync(outputDir, { recursive: true });
writeFileSync(path.join(outputDir, 'runtime-owner-candidates.arrow'), candidateBytes, { flag: 'wx' });
writeFileSync(path.join(outputDir, 'rejected.json'), rejectedBytes, { flag: 'wx' });
const registrySha256 = sha256(registryBytes);
const manifest = {
  schema: 'atlas.runtime-owner-directory-candidates.v1', status: 'DECLARED_OWNER_PATHS_ADVISORY_ONLY',
  canonicalAuthority: false, productionStoreWrites: false, executionProven: false, sourceRevisionQualified: false,
  registryPath: 'docs/architecture/runtime-ownership-registry.json', registrySha256,
  inventoryManifestPath: path.relative(root, inventoryManifestPath).replaceAll('\\', '/'),
  inventoryManifestReceiptSha256: inventoryManifest.receiptSha256,
  inventorySha256: inventoryManifest.sourceInventorySha256, pathArtifactSha256: rollupManifest.sourceArrowSha256,
  rollupManifestPath: path.relative(root, rollupManifestPath).replaceAll('\\', '/'),
  rollupReceiptSha256: rollupManifest.receiptSha256, directoryArtifactSha256: rollupManifest.directoriesArtifactSha256,
  ownerCandidates: candidateRows.length, rejectedOwners: result.rejected.length,
  rejectionReasons: Object.fromEntries([...new Set(result.rejected.map(row => row.reason))].sort().map(reason => [reason, result.rejected.filter(row => row.reason === reason).length])),
  artifacts: { 'runtime-owner-candidates.arrow': { sha256: sha256(candidateBytes), bytes: candidateBytes.byteLength },
    'rejected.json': { sha256: sha256(rejectedBytes), bytes: rejectedBytes.byteLength } },
  semanticLimit: 'Declared capability ownership paths do not prove runtime execution, request traffic, source-revision admission, or canonical identity.',
};
manifest.receiptSha256 = sha256(Buffer.from(canonical(manifest)));
writeFileSync(path.join(outputDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
if (tableFromIPC(readFileSync(path.join(outputDir, 'runtime-owner-candidates.arrow'))).numRows !== candidateRows.length
  || sha256(readFileSync(path.join(outputDir, 'rejected.json'))) !== manifest.artifacts['rejected.json'].sha256) {
  throw new Error('RUNTIME_OWNER_OUTPUT_READBACK_FAILED');
}
console.log(JSON.stringify({ status: manifest.status, outputDir: path.relative(root, outputDir).replaceAll('\\', '/'),
  ownerCandidates: manifest.ownerCandidates, rejectedOwners: manifest.rejectedOwners, receiptSha256: manifest.receiptSha256 }));
