#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, statfsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Int32, Table, Utf8, tableFromIPC, tableToIPC, vectorFromArray } from 'apache-arrow';
import { REPO_ROOT } from './connection-config.mjs';
import { addAstObservationOverlayV1, verifyAstSourceBindingReceiptV1 } from './lib/ast-observation-graph-overlay-v1.mjs';
import { extractSourceImportCandidatesV1 } from './lib/source-import-candidates-v1.mts';
import { traverseDirectoryPackageGraphV1 } from './lib/directory-package-graph-v1.mjs';

const arg = name => process.argv.find(value => value.startsWith(`${name}=`))?.slice(name.length + 1);
const root = path.resolve(REPO_ROOT);
const runId = arg('--run-id') ?? '';
if (!/^ast-overlay-[a-z0-9-]{1,48}$/.test(runId)) throw new Error('RUN_ID_INVALID');
const astReceiptPath = path.resolve(root, arg('--ast-receipt') ?? '');
const sourceBindingReceiptPath = path.resolve(root, arg('--source-binding-receipt') ?? '');
const graphManifestPath = path.resolve(root, arg('--graph-manifest') ?? '');
const rollupManifestPath = path.resolve(root, arg('--rollup-manifest') ?? '');
for (const filePath of [astReceiptPath, sourceBindingReceiptPath, graphManifestPath, rollupManifestPath]) {
  if (!filePath.startsWith(`${root}${path.sep}`)) throw new Error('INPUT_OUTSIDE_REPOSITORY');
}
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
  : value && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`
    : JSON.stringify(value);
const readJson = filePath => JSON.parse(readFileSync(filePath, 'utf8'));
function arrowRows(filePath, expectedSha256) {
  const bytes = readFileSync(filePath);
  if (sha256(bytes) !== expectedSha256) throw new Error('INPUT_ARTIFACT_CHECKSUM_INVALID');
  const table = tableFromIPC(bytes);
  return Array.from({ length: table.numRows }, (_, index) => Object.fromEntries(
    table.schema.fields.map(field => [field.name, table.getChild(field.name).get(index)])));
}
function verifyReceipt(value, schema) {
  if (value.schema !== schema) throw new Error('INPUT_SCHEMA_INVALID');
  if (value.receiptSha256) {
    const body = { ...value };
    delete body.receiptSha256;
    if (sha256(Buffer.from(canonical(body))) !== value.receiptSha256) throw new Error('INPUT_RECEIPT_CHECKSUM_INVALID');
  }
}

const astReceipt = readJson(astReceiptPath);
verifyReceipt(astReceipt, 'atlas.ast-entity-prefill-graphify-receipt.v2');
if (astReceipt.canonicalAuthority !== false || astReceipt.datastoreWrites !== false || astReceipt.projectionWrites !== false
  || astReceipt.canonical_writes !== false || astReceipt.sourceBindingMode !== true
  || astReceipt.sourceReadMode !== 'MATERIALIZED_ADMITTED_SNAPSHOT' || astReceipt.files_revision_mismatch !== 0
  || astReceipt.files_unresolved !== 0) throw new Error('AST_RECEIPT_NOT_READ_ONLY_AND_REVISION_QUALIFIED');
const astBytes = readFileSync(astReceipt.output);
if (sha256(astBytes) !== astReceipt.outputChecksum.replace(/^sha256:/, '')) throw new Error('AST_OUTPUT_CHECKSUM_INVALID');
const observations = astBytes.toString('utf8').trim().split(/\r?\n/).map(line => JSON.parse(line));
if (observations.length !== astReceipt.outputRowCount || observations.length === 0) throw new Error('AST_ROW_COUNT_MISMATCH');
const snapshotRevision = astReceipt.sourceReadSnapshotRevision.replace(/^sha256:/, '');
const snapshotRoot = path.resolve(root, '.tmp', 'workspace-source-snapshots', snapshotRevision);
const sourceEvidence = new Map();
const occurrenceIds = new Set();
const utf8 = new TextDecoder('utf-8', { fatal: true });
for (const row of observations) {
  const sourcePath = row.source_ref;
  if (typeof sourcePath !== 'string' || path.isAbsolute(sourcePath) || sourcePath.split(/[\\/]/).includes('..')) {
    throw new Error('AST_SOURCE_PATH_INVALID');
  }
  const currentPath = path.resolve(root, sourcePath);
  const snapshotPath = path.resolve(root, row.resolved_path ?? '');
  if (!currentPath.startsWith(`${root}${path.sep}`) || !snapshotPath.startsWith(`${snapshotRoot}${path.sep}`)) {
    throw new Error('AST_SOURCE_PATH_OUTSIDE_BOUND_ROOT');
  }
  const currentBytes = readFileSync(currentPath);
  const snapshotBytes = readFileSync(snapshotPath);
  const digest = sha256(currentBytes);
  const sourceRevision = String(row.source_revision ?? '').replace(/^sha256:/, '');
  if (!/^[a-f0-9]{64}$/.test(sourceRevision) || digest !== sourceRevision || sha256(snapshotBytes) !== sourceRevision
    || row.workspace_revision !== astReceipt.workspaceRevision) throw new Error('AST_SOURCE_BYTES_OR_WORKSPACE_REVISION_MISMATCH');
  if (!Number.isInteger(row.start_byte) || !Number.isInteger(row.end_byte) || row.start_byte < 0
    || row.end_byte <= row.start_byte || row.end_byte > currentBytes.length) throw new Error('AST_SPAN_OUT_OF_BOUNDS');
  try { utf8.decode(currentBytes.subarray(row.start_byte, row.end_byte)); } catch { throw new Error('AST_SPAN_UTF8_INVALID'); }
  if (!row.tree_node_occurrence_id || occurrenceIds.has(row.tree_node_occurrence_id)) throw new Error('AST_OCCURRENCE_ID_INVALID');
  occurrenceIds.add(row.tree_node_occurrence_id);
  const previous = sourceEvidence.get(sourcePath);
  if (previous && previous.sourceSha256 !== digest) throw new Error('AST_FILE_REVISION_CONFLICT');
  sourceEvidence.set(sourcePath, { sourceSha256: digest, workspaceRevision: row.workspace_revision, sourceBytes: currentBytes });
}
if (sourceEvidence.size !== astReceipt.files_revision_qualified
  || sourceEvidence.size !== astReceipt.sourceBindingCount) throw new Error('AST_SOURCE_BINDING_COUNT_MISMATCH');
const sourceBindingReceipt = readJson(sourceBindingReceiptPath);
const sourceBindingVerification = verifyAstSourceBindingReceiptV1({ receipt: sourceBindingReceipt, sourceEvidence,
  workspaceRevision: astReceipt.workspaceRevision, snapshotRevision: astReceipt.sourceReadSnapshotRevision });

const graphManifest = readJson(graphManifestPath);
const rollupManifest = readJson(rollupManifestPath);
verifyReceipt(graphManifest, 'atlas.directory-package-graph-candidate.v1');
verifyReceipt(rollupManifest, 'atlas.directory-intelligence-rollup.v1');
if (graphManifest.directoryRollupReceiptSha256 !== rollupManifest.receiptSha256) throw new Error('GRAPH_ROLLUP_BINDING_MISMATCH');
const graphDir = path.dirname(graphManifestPath);
const graphNodes = arrowRows(path.resolve(root, graphManifest.artifacts['nodes.arrow'].path), graphManifest.artifacts['nodes.arrow'].sha256);
const graphEdges = arrowRows(path.resolve(root, graphManifest.artifacts['typed-edges.arrow'].path), graphManifest.artifacts['typed-edges.arrow'].sha256);
const directoryPaths = arrowRows(path.resolve(root, rollupManifest.directoriesArtifactPath), rollupManifest.directoriesArtifactSha256)
  .map(row => row.directoryPath);
const importScan = extractSourceImportCandidatesV1({
  sources: [...sourceEvidence].map(([sourceRef, evidence]) => ({
    sourceRef, sourceBytes: evidence.sourceBytes, sourceRevision: evidence.sourceSha256,
    workspaceRevision: evidence.workspaceRevision,
  })),
  workspaceRevision: astReceipt.workspaceRevision,
});
const countImportField = field => Object.fromEntries([...new Set(importScan.edges.map(row => row[field]))]
  .sort().map(value => [value, importScan.edges.filter(row => row[field] === value).length]));
const expanded = addAstObservationOverlayV1({ graphNodes, graphEdges, directoryPaths, observations, sourceEvidence,
  importCandidates: importScan.edges });
const startDirectory = arg('--start-directory') ?? 'ace-vector-selection-slice/src/lib/server/ace/vector';
const traversal = traverseDirectoryPackageGraphV1({ nodes: expanded.nodes, edges: expanded.edges,
  startNodeKey: `dir:${startDirectory}`, maxHops: Number(arg('--max-hops') ?? 2),
  maxFanout: Number(arg('--max-fanout') ?? 40) });
const nodeFields = [
  ['ordinal', 'int32'], ['nodeKey', 'utf8'], ['nodeType', 'utf8'], ['relativePath', 'utf8'], ['sourceSha256', 'utf8'],
  ['ecosystem', 'utf8'], ['packageName', 'utf8'], ['identityStatus', 'utf8'], ['sourceRevision', 'utf8'],
  ['workspaceRevision', 'utf8'], ['occurrenceId', 'utf8'], ['name', 'utf8'], ['kind', 'utf8'], ['signature', 'utf8'],
  ['astKind', 'utf8'], ['startByte', 'int32'], ['endByte', 'int32'], ['startLine', 'int32'], ['endLine', 'int32'],
  ['extractor', 'utf8'], ['extractorRevision', 'utf8'],
];
const edgeFields = [
  ['sourceOrdinal', 'int32'], ['targetOrdinal', 'int32'], ['edgeType', 'utf8'], ['evidenceStatus', 'utf8'],
  ['sourcePath', 'utf8'], ['sourceSha256', 'utf8'], ['sourceRevision', 'utf8'], ['workspaceRevision', 'utf8'],
  ['targetSourcePath', 'utf8'], ['targetSourceSha256', 'utf8'], ['targetWorkspaceRevision', 'utf8'],
  ['importSpecifier', 'utf8'], ['importSpanText', 'utf8'], ['relationKind', 'utf8'], ['typeOnlyStatus', 'utf8'],
  ['startByte', 'int32'], ['endByte', 'int32'], ['line1', 'int32'], ['installedVersion', 'utf8'], ['installedVersionStatus', 'utf8'],
];
const toArrow = (fields, values) => tableToIPC(new Table(Object.fromEntries(fields.map(([name, type]) => [name,
  vectorFromArray(values.map(row => row[name] ?? (type === 'int32' ? 0 : '')),
    type === 'int32' ? new Int32() : new Utf8())]))), 'file');
const nodesBytes = toArrow(nodeFields, expanded.nodes);
const edgesBytes = toArrow(edgeFields, expanded.edges);
const traversalBytes = Buffer.from(`${JSON.stringify(traversal, null, 2)}\n`);
const outputDir = path.join(root, '.tmp', 'atlas', 'directory-intelligence', runId);
const needed = (nodesBytes.byteLength + edgesBytes.byteLength + traversalBytes.byteLength + 1_000_000) * 2;
if (statfsSync(root).bavail * statfsSync(root).bsize < needed) throw new Error('INSUFFICIENT_OUTPUT_DISK_HEADROOM');
mkdirSync(outputDir, { recursive: false });
const artifacts = [['nodes.arrow', nodesBytes], ['typed-edges.arrow', edgesBytes], ['traversal.json', traversalBytes]];
for (const [name, bytes] of artifacts) writeFileSync(path.join(outputDir, name), bytes, { flag: 'wx' });
const manifest = {
  schema: 'atlas.ast-observation-graph-overlay.v1',
  status: 'DERIVED_ADVISORY_AST_OBSERVATION_OVERLAY',
  canonicalAuthority: false,
  writesPerformed: false,
  baseGraphManifest: path.relative(root, graphManifestPath).replaceAll('\\', '/'),
  baseGraphReceiptSha256: graphManifest.receiptSha256,
  astPrefillReceiptPath: path.relative(root, astReceiptPath).replaceAll('\\', '/'),
  astPrefillOutputChecksum: astReceipt.outputChecksum,
  astPrefillRowCount: observations.length,
  astSourceFileCount: sourceEvidence.size,
  sourceBindingChecksum: astReceipt.sourceBindingChecksum,
  sourceBindingReadbackReceiptPath: path.relative(root, sourceBindingReceiptPath).replaceAll('\\', '/'),
  sourceBindingReadbackReceiptSha256: sourceBindingVerification.receiptSha256,
  sourceBindingVerificationStatus: sourceBindingVerification.status,
  sourceBindingExactCount: sourceBindingVerification.exactBindingCount,
  sourceReadSnapshotRevision: astReceipt.sourceReadSnapshotRevision,
  workspaceRevision: astReceipt.workspaceRevision,
  parserRevision: astReceipt.parserRevision,
  canonicalSymbolIdsResolved: 0,
  addedObservationEdges: observations.length,
  addedDirectoryFileEdges: sourceEvidence.size,
  importParser: importScan.parser,
  addedSourceImportCandidateEdges: importScan.edges.length,
  sourceImportCandidateKinds: countImportField('relationKind'),
  sourceImportTypeOnlyStatuses: countImportField('typeOnlyStatus'),
  unresolvedSourceImports: importScan.unresolved.length,
  unresolvedSourceImportStatuses: Object.fromEntries([...new Set(importScan.unresolved.map(row => row.status))]
    .sort().map(status => [status, importScan.unresolved.filter(row => row.status === status).length])),
  outputNodeCount: expanded.nodes.length,
  outputEdgeCount: expanded.edges.length,
  traversal,
  artifacts: Object.fromEntries(artifacts.map(([name, bytes]) => [name, {
    path: path.relative(root, path.join(outputDir, name)).replaceAll('\\', '/'), sha256: sha256(bytes), bytes: bytes.byteLength,
  }])),
  authorityLimit: 'source bindings are revision-qualified for this frozen cohort, but AST occurrences and import/re-export candidates remain noncanonical. Static module-reference edges are not canonical Graphify relations or runtime call proof.',
  datastoreWrites: false,
  cacheWrites: false,
  projectionWrites: false,
};
manifest.receiptSha256 = sha256(Buffer.from(canonical(manifest)));
const manifestPath = path.join(outputDir, 'manifest.json');
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
const verification = readJson(manifestPath);
const receiptSha256 = verification.receiptSha256;
delete verification.receiptSha256;
if (sha256(Buffer.from(canonical(verification))) !== receiptSha256) throw new Error('OUTPUT_RECEIPT_READBACK_FAILED');
for (const [name, bytes] of artifacts) if (sha256(readFileSync(path.join(outputDir, name))) !== sha256(bytes)) {
  throw new Error('OUTPUT_ARTIFACT_READBACK_FAILED');
}
console.log(JSON.stringify({ status: manifest.status, manifestPath: path.relative(root, manifestPath).replaceAll('\\', '/'),
  receiptSha256, astPrefillRowCount: observations.length, astSourceFileCount: sourceEvidence.size,
  canonicalSymbolIdsResolved: 0, outputNodes: manifest.outputNodeCount, outputEdges: manifest.outputEdgeCount,
  traversalStatus: traversal.status, reached: traversal.reached.length }));
