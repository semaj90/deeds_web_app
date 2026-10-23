#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statfsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tableFromIPC } from 'apache-arrow';
import { REPO_ROOT } from './connection-config.mjs';
import { buildDirectoryRollupV1 } from './lib/directory-intelligence-rollup-v1.mjs';

const arg = name => process.argv.find(value => value.startsWith(`${name}=`))?.slice(name.length + 1);
const manifestInput = path.resolve(REPO_ROOT, arg('--input') ?? '');
const runId = arg('--run-id') ?? '';
if (!/^rollup-[a-z0-9-]{1,48}$/.test(runId)) throw new Error('RUN_ID_INVALID');
const root = path.resolve(REPO_ROOT);
if (!manifestInput.startsWith(`${root}${path.sep}`)) throw new Error('INPUT_OUTSIDE_REPOSITORY');

const inputManifest = JSON.parse(readFileSync(manifestInput, 'utf8'));
const sourceManifestBody = { ...inputManifest };
delete sourceManifestBody.receiptSha256;
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
    : JSON.stringify(value);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
if (inputManifest.schema !== 'atlas.directory-intelligence-path-snapshot.v1'
  || inputManifest.status !== 'DERIVED_ADVISORY_SNAPSHOT'
  || inputManifest.canonicalAuthority !== false || inputManifest.writesPerformed !== false
  || sha256(Buffer.from(canonical(sourceManifestBody))) !== inputManifest.receiptSha256) {
  throw new Error('INPUT_PATH_MANIFEST_RECEIPT_INVALID');
}

const sourceArrowPath = path.resolve(root, inputManifest.artifactPath);
if (!sourceArrowPath.startsWith(`${root}${path.sep}`)) throw new Error('SOURCE_ARROW_OUTSIDE_REPOSITORY');
const sourceArrowBytes = readFileSync(sourceArrowPath);
if (sha256(sourceArrowBytes) !== inputManifest.artifactSha256) throw new Error('SOURCE_ARROW_CHECKSUM_INVALID');
const sourceTable = tableFromIPC(sourceArrowBytes);
if (sourceTable.numRows !== inputManifest.rows) throw new Error('SOURCE_ARROW_ROW_COUNT_INVALID');

const sourceInventoryPath = path.resolve(root, inputManifest.sourceInventoryPath);
if (!sourceInventoryPath.startsWith(`${root}${path.sep}`)) throw new Error('SOURCE_INVENTORY_OUTSIDE_REPOSITORY');
const inventory = JSON.parse(readFileSync(sourceInventoryPath, 'utf8'));
const inventoryBody = { ...inventory };
delete inventoryBody.inventorySha256;
if (sha256(Buffer.from(canonical(inventoryBody))) !== inventory.inventorySha256
  || inventory.inventorySha256 !== inputManifest.sourceInventorySha256
  || inventory.workspace.enumerationStatus !== 'COMPLETE') throw new Error('SOURCE_INVENTORY_INVALID');

const disk = statfsSync(root);
const availableBytes = disk.bavail * disk.bsize;
const requiredBytes = sourceArrowBytes.byteLength * 2;
if (availableBytes < requiredBytes) throw new Error('INSUFFICIENT_OUTPUT_DISK_HEADROOM');

const rollup = buildDirectoryRollupV1(sourceTable);
if (rollup.pathCount !== inputManifest.rows || rollup.rootRecordCount !== 1) throw new Error('ROLLUP_INPUT_COVERAGE_MISMATCH');
const outputDir = path.join(root, '.tmp', 'atlas', 'directory-intelligence', runId);
mkdirSync(outputDir, { recursive: true });
const directoriesPath = path.join(outputDir, 'directories.arrow');
const edgesPath = path.join(outputDir, 'containment-edges.arrow');
writeFileSync(directoriesPath, rollup.directoryBytes, { flag: 'wx' });
writeFileSync(edgesPath, rollup.edgeBytes, { flag: 'wx' });

const directoriesReadback = tableFromIPC(readFileSync(directoriesPath));
const edgesReadback = tableFromIPC(readFileSync(edgesPath));
if (directoriesReadback.numRows !== rollup.directoryCount || edgesReadback.numRows !== rollup.edgeCount) {
  throw new Error('ROLLUP_ARROW_READBACK_SHAPE_INVALID');
}
const body = {
  schema: 'atlas.directory-intelligence-rollup.v1',
  status: 'DERIVED_ADVISORY_ROLLUP',
  canonicalAuthority: false,
  writesPerformed: false,
  sourcePathManifestReceipt: path.relative(root, manifestInput).replaceAll('\\', '/'),
  sourcePathManifestReceiptSha256: inputManifest.receiptSha256,
  sourceInventorySha256: inputManifest.sourceInventorySha256,
  sourceArrowPath: path.relative(root, sourceArrowPath).replaceAll('\\', '/'),
  sourceArrowSha256: inputManifest.artifactSha256,
  sourcePathCount: rollup.pathCount,
  directoriesArtifactPath: path.relative(root, directoriesPath).replaceAll('\\', '/'),
  directoriesArtifactSha256: sha256(rollup.directoryBytes),
  directoriesArtifactBytes: rollup.directoryBytes.byteLength,
  directories: rollup.directoryCount,
  directoryColumns: rollup.directoryColumns,
  edgesArtifactPath: path.relative(root, edgesPath).replaceAll('\\', '/'),
  edgesArtifactSha256: sha256(rollup.edgeBytes),
  edgesArtifactBytes: rollup.edgeBytes.byteLength,
  containmentEdges: rollup.edgeCount,
  edgeColumns: rollup.edgeColumns,
  unresolvedParentCount: rollup.unresolvedParentCount,
  featureDistributionStatus: 'NOT_AVAILABLE_NO_QUALIFIED_FEATURE_INPUT',
  edgeIdentityPolicy: 'CONTAINS edge derives from relative path only; not canonical source or symbol identity',
  summarySemantics: 'deterministic metadata aggregates only; no source text, model, or inferred domain labels',
};
body.receiptSha256 = sha256(Buffer.from(canonical(body)));
const outputManifest = path.join(outputDir, 'manifest.json');
writeFileSync(outputManifest, `${JSON.stringify(body, null, 2)}\n`, { flag: 'wx' });

const check = JSON.parse(readFileSync(outputManifest, 'utf8'));
const expectedDigest = check.receiptSha256;
delete check.receiptSha256;
if (sha256(Buffer.from(canonical(check))) !== expectedDigest
  || sha256(readFileSync(directoriesPath)) !== body.directoriesArtifactSha256
  || sha256(readFileSync(edgesPath)) !== body.edgesArtifactSha256) throw new Error('ROLLUP_RECEIPT_READBACK_FAILED');
console.log(JSON.stringify({
  status: body.status,
  manifestPath: path.relative(root, outputManifest).replaceAll('\\', '/'),
  receiptSha256: body.receiptSha256,
  directoriesArtifactSha256: body.directoriesArtifactSha256,
  edgesArtifactSha256: body.edgesArtifactSha256,
  sourcePathCount: body.sourcePathCount,
  directories: body.directories,
  containmentEdges: body.containmentEdges,
  unresolvedParentCount: body.unresolvedParentCount,
}));
