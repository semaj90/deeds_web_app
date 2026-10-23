#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { blockHash, taskBlock } from './lib/wfu-metadata.mjs';

const [manifestArg] = process.argv.slice(2);
if (!manifestArg) throw new Error('USAGE: node scripts/atlas/audit-openspec-next-step-observations-v1.mjs <manifest.json>');
const root = process.cwd();
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const manifestPath = path.resolve(root, manifestArg);
const manifestBytes = readFileSync(manifestPath);
const manifest = JSON.parse(manifestBytes.toString('utf8'));
if (manifest.schema !== 'atlas.openspec-next-step-observations-manifest.v1') throw new Error('OBSERVATION_MANIFEST_SCHEMA_INVALID');
const body = { ...manifest };
delete body.manifestBodySha256;
if (sha256(Buffer.from(JSON.stringify(body))) !== manifest.manifestBodySha256) throw new Error('OBSERVATION_MANIFEST_CHECKSUM_MISMATCH');
const rowsPath = path.resolve(root, manifest.rowsPath);
const rowsBytes = readFileSync(rowsPath);
if (sha256(rowsBytes) !== manifest.rowsSha256) throw new Error('OBSERVATION_ROWS_CHECKSUM_MISMATCH');
const rows = rowsBytes.toString('utf8').split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
if (rows.length !== manifest.rowCount) throw new Error('OBSERVATION_ROW_COUNT_MISMATCH');

const workboardPath = path.join(root, 'scripts', 'atlas', 'build-openspec-workboard-v1.mjs');
const snapshotBytes = execFileSync(process.execPath, [workboardPath, '--task-snapshot-stdout'], { cwd: root, maxBuffer: 256 * 1024 * 1024 });
const snapshot = JSON.parse(snapshotBytes.toString('utf8'));
const sourceHashes = snapshot.sourceFileHashes ?? {};
const hashMapDigest = sha256(Buffer.from(JSON.stringify(Object.entries(sourceHashes).sort(([a], [b]) => a.localeCompare(b)))));
if (snapshot.tasks.length !== manifest.inputs.taskCount || hashMapDigest !== manifest.inputs.sourceHashMapSha256
  || Object.keys(sourceHashes).length !== manifest.inputs.taskSourceFileCount) throw new Error('CURRENT_TASK_SNAPSHOT_SOURCE_BINDING_MISMATCH');
const textBySource = new Map();
for (const [source, expected] of Object.entries(sourceHashes)) {
  const normalized = source.replaceAll('\\', '/');
  const absolute = path.resolve(root, normalized);
  const stat = lstatSync(absolute);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`TASK_SOURCE_NOT_REGULAR_FILE:${normalized}`);
  const bytes = readFileSync(absolute);
  if (`sha256:${sha256(bytes)}` !== expected) throw new Error(`TASK_SOURCE_HASH_MISMATCH:${normalized}`);
  textBySource.set(normalized, bytes.toString('utf8'));
}
const tasks = new Map(snapshot.tasks.map(task => [`${task.source.replaceAll('\\', '/')}#L${task.line}`, task]));
let observationsVerified = 0;
let pathRefsVerified = 0;
for (const row of rows) {
  const task = tasks.get(row.taskRef);
  if (!task || task.taskKey !== row.taskKey || task.blockHash !== row.taskBlockSha256) throw new Error(`TASK_BINDING_MISMATCH:${row.taskRef}`);
  const text = textBySource.get(task.source.replaceAll('\\', '/'));
  if (!text || blockHash(taskBlock(text.split(/\r?\n/), task.line - 1)) !== row.taskBlockSha256) throw new Error(`TASK_BLOCK_HASH_MISMATCH:${row.taskRef}`);
  const bytes = Buffer.from(text, 'utf8');
  for (const item of row.observations) {
    const span = bytes.subarray(item.startByte, item.endByte);
    if (span.toString('utf8') !== item.evidenceText || `sha256:${sha256(span)}` !== item.evidenceSha256) throw new Error(`OBSERVATION_SPAN_MISMATCH:${row.taskRef}:${item.field}`);
    observationsVerified += 1;
  }
  for (const ref of row.pathReferences) {
    const span = bytes.subarray(ref.evidenceStartByte, ref.evidenceEndByte);
    if (sha256(span) !== ref.evidenceSha256 || span.toString('utf8').replaceAll('\\', '/') !== ref.referencedPath) throw new Error(`PATH_REFERENCE_SPAN_MISMATCH:${row.taskRef}`);
    pathRefsVerified += 1;
  }
}
const readback = {
  schema: 'atlas.openspec-next-step-observations-readback.v1',
  runId: manifest.runId,
  status: 'READBACK_VERIFIED_ADVISORY',
  manifestBodySha256: manifest.manifestBodySha256,
  rowsSha256: manifest.rowsSha256,
  sourceHashMapSha256: hashMapDigest,
  taskRowsVerified: rows.length,
  exactObservationSpansVerified: observationsVerified,
  pathReferenceSpansVerified: pathRefsVerified,
  currentTaskSnapshotSha256: sha256(snapshotBytes),
  workspaceRevision: null,
  canonicalAuthority: false,
  productionWrites: false,
};
const outputPath = path.join(path.dirname(manifestPath), 'independent-readback.json');
writeFileSync(outputPath, `${JSON.stringify(readback, null, 2)}\n`, { flag: 'wx' });
process.stdout.write(`${JSON.stringify({ ...readback, outputPath: path.relative(root, outputPath).replaceAll(path.sep, '/'), readbackSha256: sha256(readFileSync(outputPath)) })}\n`);
