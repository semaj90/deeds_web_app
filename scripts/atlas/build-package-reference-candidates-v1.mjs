#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statfsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Int32, Table, Utf8, vectorFromArray, tableFromIPC } from 'apache-arrow';
import { REPO_ROOT } from './connection-config.mjs';
import { comparePackageSurfaceRowV1, extractPackageReferencesV1 } from './lib/package-reference-candidates-v1.mjs';

const arg = name => process.argv.find(value => value.startsWith(`${name}=`))?.slice(name.length + 1);
const root = path.resolve(REPO_ROOT);
const runId = arg('--run-id') ?? '';
if (!/^package-refs-[a-z0-9-]{1,48}$/.test(runId)) throw new Error('RUN_ID_INVALID');
const surfaceMapPath = path.resolve(root, arg('--surface-map') ?? '');
const directoryManifestPath = path.resolve(root, arg('--directory-manifest') ?? '');
for (const inputPath of [surfaceMapPath, directoryManifestPath]) {
  if (!inputPath.startsWith(`${root}${path.sep}`)) throw new Error('INPUT_OUTSIDE_REPOSITORY');
}

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
    : JSON.stringify(value);
const readJson = filePath => JSON.parse(readFileSync(filePath, 'utf8'));
const surfaceMapBytes = readFileSync(surfaceMapPath);
const surfaceMap = JSON.parse(surfaceMapBytes.toString('utf8'));
if (surfaceMap.schema !== 'atlas.whole-repository-package-surface-map.v3'
  || !Array.isArray(surfaceMap.fileRows) || !Array.isArray(surfaceMap.npm) || !Array.isArray(surfaceMap.pypi)) {
  throw new Error('PACKAGE_SURFACE_MAP_SCHEMA_INVALID');
}

const npmInventoryPath = path.resolve(root, surfaceMap.input.inventory);
const pythonModuleMapPath = path.resolve(root, surfaceMap.input.pythonModuleDistributionMap);
for (const inputPath of [npmInventoryPath, pythonModuleMapPath]) {
  if (!inputPath.startsWith(`${root}${path.sep}`)) throw new Error('PACKAGE_MAP_DEPENDENCY_OUTSIDE_REPOSITORY');
}
const npmInventoryBytes = readFileSync(npmInventoryPath);
const pythonModuleMapBytes = readFileSync(pythonModuleMapPath);
if (`sha256:${sha256(npmInventoryBytes)}` !== surfaceMap.input.inventorySha256
  || `sha256:${sha256(pythonModuleMapBytes)}` !== surfaceMap.input.pythonMapSha256) {
  throw new Error('PACKAGE_MAP_INPUT_CHECKSUM_MISMATCH');
}
const packageInventory = JSON.parse(npmInventoryBytes.toString('utf8'));
const moduleMap = JSON.parse(pythonModuleMapBytes.toString('utf8'));
const installedVersions = new Map();
for (const row of packageInventory.rows ?? []) {
  if (row.ecosystem === 'npm' && row.installed) {
    const entries = installedVersions.get(`npm:${row.name}`) ?? new Set();
    entries.add(row.installedVersion);
    installedVersions.set(`npm:${row.name}`, entries);
  }
}
for (const row of packageInventory.pypi ?? []) {
  if (row.installed) {
    const entries = installedVersions.get(`pypi:${row.name}`) ?? new Set();
    entries.add(row.installedVersion);
    installedVersions.set(`pypi:${row.name}`, entries);
  }
}
const npmPackageNames = new Set(surfaceMap.npm.map(row => row.package));
const pythonPackageNames = new Set(surfaceMap.pypi.map(row => row.package));
const moduleToDistributions = new Map(Object.entries(moduleMap).map(([moduleName, names]) => [moduleName, names]));

const directoryManifest = readJson(directoryManifestPath);
const directoryManifestBody = { ...directoryManifest };
delete directoryManifestBody.receiptSha256;
if (directoryManifest.schema !== 'atlas.directory-intelligence-path-snapshot.v1'
  || directoryManifest.status !== 'DERIVED_ADVISORY_SNAPSHOT'
  || sha256(Buffer.from(canonical(directoryManifestBody))) !== directoryManifest.receiptSha256) {
  throw new Error('DIRECTORY_METADATA_RECEIPT_INVALID');
}
const sourceArrowPath = path.resolve(root, directoryManifest.artifactPath);
if (!sourceArrowPath.startsWith(`${root}${path.sep}`)) throw new Error('DIRECTORY_ARROW_OUTSIDE_REPOSITORY');
const sourceArrowBytes = readFileSync(sourceArrowPath);
if (sha256(sourceArrowBytes) !== directoryManifest.artifactSha256) throw new Error('DIRECTORY_ARROW_CHECKSUM_INVALID');
const sourceTable = tableFromIPC(sourceArrowBytes);
const indexedFiles = new Map();
const requestedPaths = new Set(surfaceMap.fileRows.map(row => row.file));
const relativePaths = sourceTable.getChild('relativePath');
const entryKinds = sourceTable.getChild('entryKind');
const pathSizes = sourceTable.getChild('sizeBytes');
const sizePresence = sourceTable.getChild('sizeBytesPresent');
const indexingStatuses = sourceTable.getChild('indexingStatus');
const roles = sourceTable.getChild('role');
for (let index = 0; index < sourceTable.numRows; index += 1) {
  const relativePath = relativePaths.get(index);
  if (requestedPaths.has(relativePath)) indexedFiles.set(relativePath, {
    entryKind: entryKinds.get(index),
    sizeBytes: sizePresence.get(index) ? pathSizes.get(index) : null,
    indexingStatus: indexingStatuses.get(index),
    role: roles.get(index),
  });
}

const byteOrder = (left, right) => Buffer.compare(Buffer.from(left), Buffer.from(right));
const sourceRows = [...surfaceMap.fileRows].sort((left, right) => byteOrder(left.file, right.file));
const referenceRows = [];
const rejectedRows = [];
const sourceDigests = new Map();
for (const surfaceRow of sourceRows) {
  const relativePath = surfaceRow.file;
  const absolutePath = path.resolve(root, relativePath);
  if (!absolutePath.startsWith(`${root}${path.sep}`)) {
    rejectedRows.push({ sourcePath: relativePath, reason: 'SOURCE_PATH_OUTSIDE_REPOSITORY' });
    continue;
  }
  const inventoryRow = indexedFiles.get(relativePath);
  if (!inventoryRow || inventoryRow.entryKind !== 'FILE') {
    rejectedRows.push({ sourcePath: relativePath, reason: 'SOURCE_PATH_NOT_IN_FROZEN_INVENTORY' });
    continue;
  }
  let sourceBytes;
  let source;
  try {
    sourceBytes = readFileSync(absolutePath);
    source = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(sourceBytes);
  } catch {
    rejectedRows.push({ sourcePath: relativePath, reason: 'SOURCE_READ_OR_UTF8_DECODE_FAILED' });
    continue;
  }
  if (inventoryRow.sizeBytes !== null && BigInt(inventoryRow.sizeBytes) !== BigInt(sourceBytes.byteLength)) {
    rejectedRows.push({ sourcePath: relativePath, reason: 'SOURCE_SIZE_MISMATCH_WITH_FROZEN_INVENTORY' });
    continue;
  }
  const sourceSha256 = sha256(sourceBytes);
  const extension = path.extname(relativePath).toLowerCase();
  const extracted = extractPackageReferencesV1({
    source,
    relativePath,
    npmPackageNames,
    pythonPackageNames,
    moduleToDistributions,
  });
  const comparison = comparePackageSurfaceRowV1(surfaceRow, extracted.packageSet);
  if (!comparison.same) {
    rejectedRows.push({ sourcePath: relativePath, reason: 'PACKAGE_SET_CHANGED_SINCE_SURFACE_MAP',
      expectedPackages: comparison.expected, actualPackages: comparison.actual,
      missingPackages: comparison.missing, unexpectedPackages: comparison.unexpected });
    continue;
  }
  sourceDigests.set(relativePath, sourceSha256);
  for (const reference of extracted.references) {
    const key = `${reference.ecosystem}:${reference.packageName}`;
    const versions = [...(installedVersions.get(key) ?? [])].filter(value => typeof value === 'string').sort(byteOrder);
    const uniqueVersions = [...new Set(versions)];
    referenceRows.push({
      sourcePath: relativePath,
      sourceSha256,
      sourceAuthority: 'PHYSICAL_CONTENT_CHECKSUM_ONLY',
      workspaceRevision: '',
      workspaceRevisionPresent: false,
      sourceIndexingStatus: inventoryRow.indexingStatus,
      sourceRole: inventoryRow.role,
      sourceSurface: surfaceRow.surface,
      ecosystem: reference.ecosystem,
      packageName: reference.packageName,
      installedVersion: uniqueVersions.length === 1 ? uniqueVersions[0] : '',
      installedVersionStatus: uniqueVersions.length === 1 ? 'UNIQUE_IN_INVENTORY' : 'MISSING_OR_AMBIGUOUS',
      importSpecifier: reference.specifier,
      line1: reference.line1,
      startUtf16: reference.startUtf16,
      endUtf16: reference.endUtf16,
      startByte: reference.startByte,
      endByte: reference.endByte,
      edgeType: 'USES_PACKAGE',
      evidenceStatus: 'ADVISORY_REGEX_SPAN_NOT_AST_OR_RUNTIME_PROOF',
    });
  }
}

referenceRows.sort((left, right) => byteOrder(left.sourcePath, right.sourcePath)
  || left.startByte - right.startByte || byteOrder(left.packageName, right.packageName));
rejectedRows.sort((left, right) => byteOrder(left.sourcePath, right.sourcePath) || byteOrder(left.reason, right.reason));

const fields = [
  ['sourcePath', 'utf8'], ['sourceSha256', 'utf8'], ['sourceAuthority', 'utf8'],
  ['workspaceRevision', 'utf8'], ['workspaceRevisionPresent', 'bool'], ['sourceIndexingStatus', 'utf8'],
  ['sourceRole', 'utf8'], ['sourceSurface', 'utf8'], ['ecosystem', 'utf8'], ['packageName', 'utf8'],
  ['installedVersion', 'utf8'], ['installedVersionStatus', 'utf8'], ['importSpecifier', 'utf8'],
  ['line1', 'int32'], ['startUtf16', 'int32'], ['endUtf16', 'int32'], ['startByte', 'int32'], ['endByte', 'int32'],
  ['edgeType', 'utf8'], ['evidenceStatus', 'utf8'],
];
const columns = Object.fromEntries(fields.map(([name]) => [name, referenceRows.map(row => row[name])]));
const vectors = Object.fromEntries(fields.map(([name, type]) => [name,
  type === 'int32' ? vectorFromArray(columns[name], new Int32())
    : type === 'bool' ? vectorFromArray(columns[name])
      : vectorFromArray(columns[name], new Utf8()),
]));
const referencesBytes = (await import('apache-arrow')).tableToIPC(new Table(vectors), 'file');
const rejectedBytes = Buffer.from(rejectedRows.map(row => JSON.stringify(row)).join('\n') + (rejectedRows.length ? '\n' : ''), 'utf8');

const outputDir = path.join(root, '.tmp', 'atlas', 'directory-intelligence', runId);
const disk = statfsSync(root);
const freeBytes = disk.bavail * disk.bsize;
const estimatedBytes = referencesBytes.byteLength + rejectedBytes.byteLength + 8_000_000;
if (freeBytes < estimatedBytes * 2) throw new Error('INSUFFICIENT_OUTPUT_DISK_HEADROOM');
mkdirSync(outputDir, { recursive: true });
const referencesPath = path.join(outputDir, 'package-import-candidates.arrow');
const rejectedPath = path.join(outputDir, 'rejected-sources.jsonl');
writeFileSync(referencesPath, referencesBytes, { flag: 'wx' });
writeFileSync(rejectedPath, rejectedBytes, { flag: 'wx' });
const referencesReadback = tableFromIPC(readFileSync(referencesPath));
if (referencesReadback.numRows !== referenceRows.length || referencesReadback.numCols !== fields.length) {
  throw new Error('PACKAGE_REFERENCE_ARROW_READBACK_INVALID');
}

const packageCounts = new Map();
for (const row of referenceRows) {
  const key = `${row.ecosystem}:${row.packageName}`;
  packageCounts.set(key, (packageCounts.get(key) ?? 0) + 1);
}
const manifest = {
  schema: 'atlas.directory-intelligence-package-references.v1',
  status: 'DERIVED_ADVISORY_CANDIDATES',
  canonicalAuthority: false,
  writesPerformed: false,
  sourceSurfaceMapPath: path.relative(root, surfaceMapPath).replaceAll('\\', '/'),
  sourceSurfaceMapSha256: sha256(surfaceMapBytes),
  sourceLibraryInventorySha256: sha256(npmInventoryBytes),
  sourcePythonModuleMapSha256: sha256(pythonModuleMapBytes),
  sourceDirectorySnapshotReceipt: path.relative(root, directoryManifestPath).replaceAll('\\', '/'),
  sourceDirectorySnapshotReceiptSha256: directoryManifest.receiptSha256,
  sourcePathArtifactSha256: directoryManifest.artifactSha256,
  sourceFileRows: sourceRows.length,
  sourceFilesRechecked: sourceDigests.size,
  sourceFilesRejected: rejectedRows.length,
  importReferenceRows: referenceRows.length,
  installedPackagesObserved: { npm: surfaceMap.npm.length, pypi: surfaceMap.pypi.length },
  packageReferenceCounts: Object.fromEntries([...packageCounts.entries()].sort(([left], [right]) => byteOrder(left, right))),
  referencesArtifactPath: path.relative(root, referencesPath).replaceAll('\\', '/'),
  referencesArtifactSha256: sha256(referencesBytes),
  referencesArtifactBytes: referencesBytes.byteLength,
  referencesArtifactRows: referenceRows.length,
  referencesColumns: fields.map(([name]) => name),
  rejectedArtifactPath: path.relative(root, rejectedPath).replaceAll('\\', '/'),
  rejectedArtifactSha256: sha256(rejectedBytes),
  rejectedArtifactBytes: rejectedBytes.byteLength,
  noWorkspaceRevisionClaim: true,
  noAstOrRuntimeClaim: true,
  identityPolicy: 'source path plus current content checksum only; no canonical source, packet, or symbol identity minted',
  parserPolicy: 'existing static regex package-surface owner rechecked against current bytes; not AST or runtime proof',
};
manifest.receiptSha256 = sha256(Buffer.from(canonical(manifest)));
const manifestPath = path.join(outputDir, 'manifest.json');
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
const verifyManifest = readJson(manifestPath);
const expectedReceiptSha = verifyManifest.receiptSha256;
delete verifyManifest.receiptSha256;
if (sha256(Buffer.from(canonical(verifyManifest))) !== expectedReceiptSha
  || sha256(readFileSync(referencesPath)) !== manifest.referencesArtifactSha256
  || sha256(readFileSync(rejectedPath)) !== manifest.rejectedArtifactSha256) {
  throw new Error('PACKAGE_REFERENCE_RECEIPT_READBACK_FAILED');
}
console.log(JSON.stringify({
  status: manifest.status,
  manifestPath: path.relative(root, manifestPath).replaceAll('\\', '/'),
  receiptSha256: manifest.receiptSha256,
  sourceFilesRechecked: manifest.sourceFilesRechecked,
  sourceFilesRejected: manifest.sourceFilesRejected,
  importReferenceRows: manifest.importReferenceRows,
  packageCount: packageCounts.size,
}));
