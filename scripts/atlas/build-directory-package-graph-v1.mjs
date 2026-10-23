#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statfsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Int32, Table, Utf8, tableFromIPC, tableToIPC, vectorFromArray } from 'apache-arrow';
import { REPO_ROOT } from './connection-config.mjs';
import { buildDirectoryPackageGraphV1, traverseDirectoryPackageGraphV1 } from './lib/directory-package-graph-v1.mjs';

const arg = name => process.argv.find(value => value.startsWith(`${name}=`))?.slice(name.length + 1);
const root = path.resolve(REPO_ROOT);
const runId = arg('--run-id') ?? '';
if (!/^dir-graph-[a-z0-9-]{1,48}$/.test(runId)) throw new Error('RUN_ID_INVALID');
const packageManifestPath = path.resolve(root, arg('--package-manifest') ?? '');
const rollupManifestPath = path.resolve(root, arg('--rollup-manifest') ?? '');
for (const inputPath of [packageManifestPath, rollupManifestPath]) {
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
function rows(table) {
  return Array.from({ length: table.numRows }, (_, index) => Object.fromEntries(
    table.schema.fields.map(field => [field.name, table.getChild(field.name).get(index)])));
}

const packageManifest = readJson(packageManifestPath);
const rollupManifest = readJson(rollupManifestPath);
verifyReceipt(packageManifest, 'atlas.directory-intelligence-package-references.v1');
verifyReceipt(rollupManifest, 'atlas.directory-intelligence-rollup.v1');
if (packageManifest.sourcePathArtifactSha256 !== rollupManifest.sourceArrowSha256
  || packageManifest.sourceDirectorySnapshotReceiptSha256 !== rollupManifest.sourcePathManifestReceiptSha256) {
  throw new Error('INPUT_SNAPSHOT_MISMATCH');
}
const packageArtifactPath = path.resolve(root, packageManifest.referencesArtifactPath);
const directoryArtifactPath = path.resolve(root, rollupManifest.directoriesArtifactPath);
for (const artifactPath of [packageArtifactPath, directoryArtifactPath]) {
  if (!artifactPath.startsWith(`${root}${path.sep}`)) throw new Error('INPUT_ARTIFACT_OUTSIDE_REPOSITORY');
}
const referenceBytes = readFileSync(packageArtifactPath);
const directoryBytes = readFileSync(directoryArtifactPath);
if (sha256(referenceBytes) !== packageManifest.referencesArtifactSha256
  || sha256(directoryBytes) !== rollupManifest.directoriesArtifactSha256) throw new Error('INPUT_ARTIFACT_CHECKSUM_INVALID');
const references = rows(tableFromIPC(referenceBytes));
const directories = rows(tableFromIPC(directoryBytes)).map(row => ({ directoryPath: row.directoryPath }));
const graph = buildDirectoryPackageGraphV1({ directories, references });
const requestedStart = arg('--start-directory') ?? '.';
const traversal = traverseDirectoryPackageGraphV1({ nodes: graph.nodes, edges: graph.edges,
  startNodeKey: `dir:${requestedStart}`, maxHops: Number(arg('--max-hops') ?? 3),
  maxFanout: Number(arg('--max-fanout') ?? 40) });

const nodeFields = [
  ['ordinal', 'int32'], ['nodeKey', 'utf8'], ['nodeType', 'utf8'], ['relativePath', 'utf8'],
  ['sourceSha256', 'utf8'], ['ecosystem', 'utf8'], ['packageName', 'utf8'], ['identityStatus', 'utf8'],
];
const edgeFields = [
  ['sourceOrdinal', 'int32'], ['targetOrdinal', 'int32'], ['edgeType', 'utf8'], ['evidenceStatus', 'utf8'],
  ['sourcePath', 'utf8'], ['sourceSha256', 'utf8'], ['importSpecifier', 'utf8'], ['startByte', 'int32'],
  ['endByte', 'int32'], ['line1', 'int32'], ['installedVersion', 'utf8'], ['installedVersionStatus', 'utf8'],
];
const toArrow = (fields, values) => tableToIPC(new Table(Object.fromEntries(fields.map(([name, type]) => [name,
  vectorFromArray(values.map(row => row[name] ?? (type === 'int32' ? 0 : '')),
    type === 'int32' ? new Int32() : new Utf8())]))), 'file');
const nodeBytes = toArrow(nodeFields, graph.nodes);
const edgeBytes = toArrow(edgeFields, graph.edges);
const traversalBytes = Buffer.from(`${JSON.stringify(traversal, null, 2)}\n`);
const outputDir = path.join(root, '.tmp', 'atlas', 'directory-intelligence', runId);
if (statfsSync(root).bavail * statfsSync(root).bsize < (nodeBytes.byteLength + edgeBytes.byteLength + traversalBytes.byteLength + 1_000_000) * 2) {
  throw new Error('INSUFFICIENT_OUTPUT_DISK_HEADROOM');
}
mkdirSync(outputDir, { recursive: false });
const artifacts = [
  ['nodes.arrow', nodeBytes], ['typed-edges.arrow', edgeBytes], ['traversal.json', traversalBytes],
];
for (const [name, bytes] of artifacts) writeFileSync(path.join(outputDir, name), bytes, { flag: 'wx' });
const edgeTypeCounts = Object.fromEntries([...new Set(graph.edges.map(edge => edge.edgeType))].sort()
  .map(type => [type, graph.edges.filter(edge => edge.edgeType === type).length]));
const manifest = {
  schema: 'atlas.directory-package-graph-candidate.v1',
  status: 'DERIVED_ADVISORY_MULTI_HOP_CANDIDATE_GRAPH',
  canonicalAuthority: false,
  writesPerformed: false,
  packageReferencesManifest: path.relative(root, packageManifestPath).replaceAll('\\', '/'),
  packageReferencesReceiptSha256: packageManifest.receiptSha256,
  packageReferencesArtifactSha256: packageManifest.referencesArtifactSha256,
  directoryRollupManifest: path.relative(root, rollupManifestPath).replaceAll('\\', '/'),
  directoryRollupReceiptSha256: rollupManifest.receiptSha256,
  directoryArtifactSha256: rollupManifest.directoriesArtifactSha256,
  nodeCount: graph.nodes.length,
  edgeCount: graph.edges.length,
  edgeTypeCounts,
  traversal,
  artifacts: Object.fromEntries(artifacts.map(([name, bytes]) => [name, {
    path: path.relative(root, path.join(outputDir, name)).replaceAll('\\', '/'),
    sha256: sha256(bytes), bytes: bytes.byteLength,
  }])),
  identityLimit: 'run-local deterministic ordinals and path/package labels only; no canonical packet, source, AST, symbol, or package identity',
  evidenceLimit: 'USES_PACKAGE_CANDIDATE edges come from regex spans and exact current file-byte digests; CONTAINS edges are path-derived; no runtime use or Graphify semantic-edge claim',
  databaseWrites: false,
  cacheWrites: false,
  projectionWrites: false,
};
manifest.receiptSha256 = sha256(Buffer.from(canonical(manifest)));
const manifestPath = path.join(outputDir, 'manifest.json');
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
const verify = readJson(manifestPath);
const receiptSha256 = verify.receiptSha256;
delete verify.receiptSha256;
if (sha256(Buffer.from(canonical(verify))) !== receiptSha256) throw new Error('OUTPUT_RECEIPT_READBACK_FAILED');
for (const [name, bytes] of artifacts) if (sha256(readFileSync(path.join(outputDir, name))) !== sha256(bytes)) {
  throw new Error('OUTPUT_ARTIFACT_READBACK_FAILED');
}
console.log(JSON.stringify({ status: manifest.status, manifestPath: path.relative(root, manifestPath).replaceAll('\\', '/'),
  receiptSha256, nodeCount: manifest.nodeCount, edgeCount: manifest.edgeCount, edgeTypeCounts,
  traversalStatus: traversal.status, reached: traversal.reached.length }));
