#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statfsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { tableFromIPC } from 'apache-arrow';
import { buildDirectoryPathArrowV1 } from './lib/directory-intelligence-arrow-v1.mjs';
import { openPathManifestStream, verifyPathManifestArtifact } from './lib/path-manifest-stream-v1.mjs';
import { REPO_ROOT } from './connection-config.mjs';

const arg = name => process.argv.find(value => value.startsWith(`${name}=`))?.slice(name.length + 1);
const inputPath = path.resolve(REPO_ROOT, arg('--input') ?? '');
const runId = arg('--run-id') ?? '';
if (!/^whole-repo-[a-z0-9-]{1,48}$/.test(runId)) throw new Error('RUN_ID_INVALID');
const root = path.resolve(REPO_ROOT);
const outputDir = path.join(root, '.tmp', 'atlas', 'directory-intelligence', runId);
if (!inputPath.startsWith(`${root}${path.sep}`)) throw new Error('INPUT_OUTSIDE_REPOSITORY');
const inventory = JSON.parse(readFileSync(inputPath, 'utf8'));
if (inventory.schema !== 'atlas.language-coverage-inventory.v2'
  || inventory.authority !== 'DERIVED_ADVISORY' || inventory.workspace?.enumerationStatus !== 'COMPLETE') {
  throw new Error('INPUT_INVENTORY_NOT_COMPLETE_ADVISORY_V2');
}
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
    : JSON.stringify(value);
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const inventoryBody = Object.fromEntries(Object.entries(inventory).filter(([key]) => key !== 'inventorySha256'));
if (sha256(Buffer.from(canonical(inventoryBody))) !== inventory.inventorySha256) throw new Error('INVENTORY_CHECKSUM_INVALID');
const pathManifest = path.resolve(root, inventory.workspace.pathManifestPath);
if (!pathManifest.startsWith(`${root}${path.sep}`)) throw new Error('PATH_MANIFEST_OUTSIDE_REPOSITORY');
const pathManifestIntegrity = await verifyPathManifestArtifact(pathManifest, inventory.workspace);
const pathManifestSha256 = pathManifestIntegrity.contentSha256;
const manifestBytes = pathManifestIntegrity.contentBytes;
const disk = statfsSync(root);
const availableBytes = disk.bavail * disk.bsize;
if (availableBytes < manifestBytes * 2) throw new Error('INSUFFICIENT_OUTPUT_DISK_HEADROOM');

async function* rows() {
  const lines = readline.createInterface({ input: openPathManifestStream(pathManifest, inventory.workspace), crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line) continue;
    const row = JSON.parse(line);
    if (typeof row.relativePath !== 'string') throw new Error('PATH_MANIFEST_PATH_INVALID');
    yield row;
  }
}

const artifact = await buildDirectoryPathArrowV1(rows());
if (artifact.rowCount !== inventory.workspace.enumeratedPathCount) throw new Error('PATH_MANIFEST_ROW_COUNT_MISMATCH');
const table = tableFromIPC(artifact.bytes);
if (table.numRows !== artifact.rowCount || table.numCols !== artifact.columnCount) throw new Error('ARROW_READBACK_SHAPE_MISMATCH');
mkdirSync(outputDir, { recursive: true });
const artifactPath = path.join(outputDir, 'path-metadata.arrow');
writeFileSync(artifactPath, artifact.bytes, { flag: 'wx' });
const body = {
  schema: 'atlas.directory-intelligence-path-snapshot.v1',
  status: 'DERIVED_ADVISORY_SNAPSHOT', canonicalAuthority: false, writesPerformed: false,
  sourceInventoryPath: path.relative(root, inputPath).replaceAll('\\', '/'),
  sourceInventorySha256: inventory.inventorySha256,
  pathManifestPath: path.relative(root, pathManifest).replaceAll('\\', '/'),
  pathManifestSha256,
  sourceEnumerationStatus: inventory.workspace.enumerationStatus,
  sourceWorkspaceRevision: inventory.workspace.workspaceRevision,
  graphifyQualification: inventory.graphifyOverlay?.qualificationStatus ?? 'NOT_PROVIDED',
  artifactPath: path.relative(root, artifactPath).replaceAll('\\', '/'),
  artifactSha256: sha256(artifact.bytes), artifactBytes: artifact.bytes.byteLength,
  rows: artifact.rowCount, columns: artifact.columnCount,
  ordering: 'exact source path manifest order; source manifest checksum binds ordering',
  identityPolicy: 'path metadata only; no packet, AST, or symbol identity minted',
};
body.receiptSha256 = sha256(Buffer.from(canonical(body)));
const manifestPath = path.join(outputDir, 'manifest.json');
writeFileSync(manifestPath, `${JSON.stringify(body, null, 2)}\n`, { flag: 'wx' });
const readback = JSON.parse(readFileSync(manifestPath, 'utf8'));
const expectedDigest = readback.receiptSha256;
delete readback.receiptSha256;
if (sha256(Buffer.from(canonical(readback))) !== expectedDigest) throw new Error('MANIFEST_CHECKSUM_READBACK_FAILED');
if (sha256(readFileSync(artifactPath)) !== body.artifactSha256) throw new Error('ARROW_CHECKSUM_READBACK_FAILED');
console.log(JSON.stringify({ status: body.status, manifestPath: path.relative(root, manifestPath),
  receiptSha256: body.receiptSha256, artifactSha256: body.artifactSha256, rows: body.rows,
  bytes: body.artifactBytes, graphifyQualification: body.graphifyQualification }));
