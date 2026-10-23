#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { blockHash } from './lib/wfu-metadata.mjs';
import { extractNextStepObservationV1 } from './lib/openspec-next-step-observations-v1.mjs';

const [runId, pathEdgeManifestArg] = process.argv.slice(2);
if (!/^[a-zA-Z0-9][a-zA-Z0-9-]{2,63}$/.test(runId ?? '') || !pathEdgeManifestArg) {
  throw new Error('USAGE: node scripts/atlas/build-openspec-next-step-observations-v1.mjs <run-id> <path-edge-manifest.json>');
}
const root = process.cwd();
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const canonical = value => JSON.stringify(value);
const writeExclusive = (filePath, bytes) => writeFileSync(filePath, bytes, { flag: 'wx' });
const pathEdgeManifestPath = path.resolve(root, pathEdgeManifestArg);
const pathEdgeManifestBytes = readFileSync(pathEdgeManifestPath);
const pathEdgeManifest = JSON.parse(pathEdgeManifestBytes.toString('utf8'));
const pathEdgeBody = { ...pathEdgeManifest };
delete pathEdgeBody.manifestBodySha256;
if (pathEdgeManifest.schema !== 'atlas.openspec-source-path-edge-manifest.v1'
  || sha256(Buffer.from(canonical(pathEdgeBody))) !== pathEdgeManifest.manifestBodySha256) throw new Error('PATH_EDGE_MANIFEST_INVALID');
const pathEdgeRowsPath = path.resolve(root, pathEdgeManifest.rowsPath);
const pathEdgeRowsBytes = readFileSync(pathEdgeRowsPath);
if (sha256(pathEdgeRowsBytes) !== pathEdgeManifest.rowsSha256) throw new Error('PATH_EDGE_ROWS_CHECKSUM_MISMATCH');
const pathEdges = pathEdgeRowsBytes.toString('utf8').split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
if (pathEdges.length !== pathEdgeManifest.rowCount) throw new Error('PATH_EDGE_ROWS_COUNT_MISMATCH');
const pathRefsByTask = new Map();
for (const edge of pathEdges) {
  if (!pathRefsByTask.has(edge.taskRef)) pathRefsByTask.set(edge.taskRef, []);
  pathRefsByTask.get(edge.taskRef).push({
    referencedPath: edge.referencedPath,
    resolutionStatus: edge.resolutionStatus,
    relation: edge.relation,
    evidenceLine: edge.evidenceLine,
    evidenceStartByte: edge.evidenceStartByte,
    evidenceEndByte: edge.evidenceEndByte,
    evidenceSha256: edge.evidenceSha256,
    targetPath: edge.targetPath,
    targetFileSha256: edge.targetFileSha256,
    referenceKind: /^(?:\.tmp|docs\/reports)\//.test(edge.referencedPath) ? 'REPORT_REFERENCE_CANDIDATE' : 'PATH_REFERENCE_CANDIDATE',
  });
}

const workboardScript = path.join(root, 'scripts', 'atlas', 'build-openspec-workboard-v1.mjs');
const snapshotBytes = execFileSync(process.execPath, [workboardScript, '--task-snapshot-stdout'], {
  cwd: root,
  maxBuffer: 256 * 1024 * 1024,
});
const snapshot = JSON.parse(snapshotBytes.toString('utf8'));
if (snapshot.schema !== pathEdgeManifest.inputs.taskSnapshotSchema || !Array.isArray(snapshot.tasks)
  || snapshot.tasks.length !== pathEdgeManifest.inputs.taskCount) throw new Error('TASK_SNAPSHOT_SHAPE_MISMATCH');
const sourceHashes = snapshot.sourceFileHashes ?? {};
const sourceHashMapSha256 = sha256(Buffer.from(canonical(Object.entries(sourceHashes).sort(([a], [b]) => a.localeCompare(b)))));
if (Object.keys(sourceHashes).length !== pathEdgeManifest.inputs.taskSourceFileCount
  || sourceHashMapSha256 !== pathEdgeManifest.inputs.sourceFileHashesSha256) throw new Error('TASK_SOURCE_HASH_MAP_MISMATCH');
const taskFileText = new Map();
for (const [sourceRef, expectedHash] of Object.entries(sourceHashes)) {
  const normalized = sourceRef.replaceAll('\\', '/');
  const absolute = path.resolve(root, normalized);
  const relative = path.relative(root, absolute);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new Error('TASK_SOURCE_OUTSIDE_REPOSITORY');
  const stat = lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`TASK_SOURCE_NOT_REGULAR_FILE:${normalized}`);
  const bytes = readFileSync(absolute);
  const actualHash = `sha256:${sha256(bytes)}`;
  if (actualHash !== expectedHash) throw new Error(`TASK_SOURCE_HASH_MISMATCH:${normalized}`);
  taskFileText.set(normalized, bytes.toString('utf8'));
}

const rows = [];
for (const task of snapshot.tasks) {
  const sourceRef = task.source.replaceAll('\\', '/');
  const sourceText = taskFileText.get(sourceRef);
  if (sourceText === undefined) throw new Error(`TASK_SOURCE_MISSING:${sourceRef}`);
  const observed = extractNextStepObservationV1({
    task,
    sourceText,
    expectedTaskFileSha256: sourceHashes[task.source],
  });
  rows.push({
    ...observed,
    change: task.change,
    pathReferences: (pathRefsByTask.get(observed.taskRef) ?? []).sort((a, b) => a.evidenceStartByte - b.evidenceStartByte),
  });
}
for (const [sourceRef, expectedHash] of Object.entries(sourceHashes)) {
  const actual = `sha256:${sha256(readFileSync(path.resolve(root, sourceRef)))}`;
  if (actual !== expectedHash) throw new Error(`TASK_SOURCE_CHANGED_DURING_BUILD:${sourceRef}`);
}
rows.sort((a, b) => a.taskRef.localeCompare(b.taskRef) || a.taskBlockSha256.localeCompare(b.taskBlockSha256));
const rowsBytes = Buffer.from(`${rows.map(canonical).join('\n')}\n`, 'utf8');
const outputDir = path.join(root, '.tmp', 'atlas', 'directory-intelligence', 'openspec-next-step-observations', runId);
mkdirSync(path.dirname(outputDir), { recursive: true });
mkdirSync(outputDir, { recursive: false });
const rowsPath = path.join(outputDir, 'observations.jsonl');
writeExclusive(rowsPath, rowsBytes);
const readbackBytes = readFileSync(rowsPath);
if (sha256(readbackBytes) !== sha256(rowsBytes)) throw new Error('OBSERVATION_ARTIFACT_READBACK_MISMATCH');
const fieldCounts = {};
const taskSnapshotStates = {};
const pathReferenceKindCounts = {};
for (const row of rows) {
  for (const observation of row.observations) fieldCounts[observation.field] = (fieldCounts[observation.field] ?? 0) + 1;
  const state = row.taskSnapshotState ?? 'UNKNOWN';
  taskSnapshotStates[state] = (taskSnapshotStates[state] ?? 0) + 1;
  for (const ref of row.pathReferences) pathReferenceKindCounts[ref.referenceKind] = (pathReferenceKindCounts[ref.referenceKind] ?? 0) + 1;
}
const body = {
  schema: 'atlas.openspec-next-step-observations-manifest.v1',
  runId,
  status: 'ADVISORY_SOURCE_SPAN_BOUND_OBSERVATIONS',
  canonicalAuthority: false,
  workspaceRevision: null,
  inputs: {
    taskSnapshotSha256: sha256(snapshotBytes),
    sourceHashMapSha256,
    taskSourceFileCount: Object.keys(sourceHashes).length,
    taskCount: snapshot.tasks.length,
    pathEdgeManifestSha256: sha256(pathEdgeManifestBytes),
    pathEdgeManifestBodySha256: pathEdgeManifest.manifestBodySha256,
    pathEdgeRowsSha256: pathEdgeManifest.rowsSha256,
  },
  rowCount: rows.length,
  fieldCounts,
  taskSnapshotStates,
  pathReferenceKindCounts,
  rowsPath: path.relative(root, rowsPath).replaceAll(path.sep, '/'),
  rowsBytes: rowsBytes.byteLength,
  rowsSha256: sha256(rowsBytes),
  writesPerformed: true,
  productionStoreWrites: false,
  limitations: [
    'Checkbox state and labeled values are source observations, not canonical task status or authorization.',
    'Path references are inherited from the advisory path-edge artifact and are not semantic dependency edges.',
    'Current task bytes are not bound to an admitted workspace revision.',
    'The snapshot raw checksum includes generatedAt and is not expected to remain stable across runs.',
  ],
};
const manifestPath = path.join(outputDir, 'manifest.json');
const manifestBytes = Buffer.from(`${JSON.stringify({ ...body, manifestBodySha256: sha256(Buffer.from(canonical(body))) }, null, 2)}\n`, 'utf8');
writeExclusive(manifestPath, manifestBytes);
process.stdout.write(`${JSON.stringify({ runId, rowCount: rows.length, fieldCounts, rowsSha256: sha256(rowsBytes), manifestPath: path.relative(root, manifestPath).replaceAll(path.sep, '/'), manifestSha256: sha256(manifestBytes) })}\n`);
