#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tableFromIPC } from 'apache-arrow';
import { blockHash, taskBlock } from './lib/wfu-metadata.mjs';

const [manifestArg, summaryArtifactArg] = process.argv.slice(2);
if (!manifestArg || !summaryArtifactArg) throw new Error('USAGE: node scripts/atlas/audit-openspec-source-path-edges-v1.mjs <manifest.json> <directory-summaries.arrow>');
const root = process.cwd();
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const manifestPath = path.resolve(root, manifestArg);
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
if (manifest.schema !== 'atlas.openspec-source-path-edge-manifest.v1') throw new Error('PATH_EDGE_MANIFEST_SCHEMA_INVALID');
const body = { ...manifest };
delete body.manifestBodySha256;
if (sha256(Buffer.from(JSON.stringify(body))) !== manifest.manifestBodySha256) throw new Error('PATH_EDGE_MANIFEST_BODY_CHECKSUM_MISMATCH');
const summaryBytes = readFileSync(path.resolve(root, summaryArtifactArg));
if (sha256(summaryBytes) !== manifest.inputs.directorySummaryArtifactSha256) throw new Error('DIRECTORY_SUMMARY_CHECKSUM_MISMATCH');
const summary = tableFromIPC(summaryBytes);
const summaryByPath = new Map(summary.toArray().map(row => [row.relativePath, row]));
const rowsPath = path.resolve(root, manifest.rowsPath);
const rowsBytes = readFileSync(rowsPath);
if (sha256(rowsBytes) !== manifest.rowsSha256 || sha256(rowsBytes) !== manifest.rowsReadbackSha256) throw new Error('PATH_EDGE_ROWS_CHECKSUM_MISMATCH');
const rows = rowsBytes.toString('utf8').split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
if (rows.length !== manifest.rowCount || rows.length !== manifest.rowsReadbackCount) throw new Error('PATH_EDGE_ROW_COUNT_MISMATCH');

const workboardScript = path.join(root, 'scripts', 'atlas', 'build-openspec-workboard-v1.mjs');
const snapshotBytes = execFileSync(process.execPath, [workboardScript, '--task-snapshot-stdout'], {
  cwd: root,
  maxBuffer: 256 * 1024 * 1024,
});
const snapshot = JSON.parse(snapshotBytes.toString('utf8'));
const sourceHashes = snapshot.sourceFileHashes ?? {};
const sourceFileHashesSha256 = sha256(Buffer.from(JSON.stringify(Object.entries(sourceHashes).sort(([a], [b]) => a.localeCompare(b)))));
if (snapshot.schema !== manifest.inputs.taskSnapshotSchema || snapshot.tasks.length !== manifest.inputs.taskCount
  || Object.keys(sourceHashes).length !== manifest.inputs.taskSourceFileCount
  || sourceFileHashesSha256 !== manifest.inputs.sourceFileHashesSha256) throw new Error('CURRENT_TASK_SNAPSHOT_BINDING_MISMATCH');
const taskByRef = new Map(snapshot.tasks.map(task => [`${task.source}#L${task.line}`, task]));
const sourceTextByPath = new Map();
for (const sourcePath of Object.keys(sourceHashes)) {
  const sourceText = readFileSync(path.resolve(root, sourcePath), 'utf8');
  if (`sha256:${sha256(Buffer.from(sourceText, 'utf8'))}` !== sourceHashes[sourcePath]) throw new Error(`TASK_SOURCE_FILE_DRIFT:${sourcePath}`);
  sourceTextByPath.set(sourcePath, sourceText);
}

let verifiedTaskRefs = 0;
let verifiedEvidenceSpans = 0;
let verifiedTargetBytes = 0;
let exactPathRows = 0;
for (const row of rows) {
  const task = taskByRef.get(row.taskRef);
  if (!task || task.blockHash !== row.taskBlockSha256 || task.taskKey !== row.taskKey) throw new Error(`TASK_REFERENCE_MISMATCH:${row.taskRef}`);
  const sourceText = sourceTextByPath.get(task.source);
  if (!sourceText || `sha256:${sha256(Buffer.from(sourceText, 'utf8'))}` !== row.taskFileSha256) throw new Error(`TASK_FILE_CHECKSUM_MISMATCH:${row.taskRef}`);
  const lines = sourceText.split(/\r?\n/);
  if (blockHash(taskBlock(lines, task.line - 1)) !== task.blockHash) throw new Error(`TASK_BLOCK_HASH_MISMATCH:${row.taskRef}`);
  const sourceBytes = Buffer.from(sourceText, 'utf8');
  const excerpt = sourceBytes.subarray(row.evidenceStartByte, row.evidenceEndByte);
  if (excerpt.toString('utf8') !== row.evidenceText || sha256(excerpt) !== row.evidenceSha256) throw new Error(`TASK_PATH_SPAN_CHECKSUM_MISMATCH:${row.taskRef}`);
  const lineAtOffset = sourceBytes.subarray(0, row.evidenceStartByte).toString('utf8').split(/\r?\n/).length;
  if (lineAtOffset !== row.evidenceLine || !lines[row.evidenceLine - 1]?.includes(`\`${row.evidenceText}\``)) {
    const lineText = lines[row.evidenceLine - 1] ?? '';
    const inlineCodeContents = [...lineText.matchAll(/`([^`\n]+)`/g)].map(match => match[1]);
    if (lineAtOffset !== row.evidenceLine || !inlineCodeContents.some(text => text.includes(row.evidenceText))) {
      throw new Error(`TASK_PATH_NOT_IN_INLINE_CODE_SPAN:${row.taskRef}`);
    }
  }
  verifiedEvidenceSpans++;
  if (row.resolutionStatus === 'EXACT_REPO_ROOT_FILE') {
    exactPathRows++;
    const targetPath = path.resolve(root, row.targetPath);
    const targetStat = lstatSync(targetPath);
    if (targetStat.isSymbolicLink() || !targetStat.isFile() || targetStat.size !== row.targetFileBytes) throw new Error(`TARGET_FILE_STAT_MISMATCH:${row.targetPath}`);
    if (row.targetDirectoryPath !== path.posix.dirname(row.targetPath)) throw new Error(`TARGET_DIRECTORY_MISMATCH:${row.targetPath}`);
    const directorySummary = summaryByPath.get(row.targetDirectoryPath);
    if (!directorySummary || directorySummary.summarySha256 !== row.targetDirectorySummarySha256
      || directorySummary.inputDigest !== row.targetDirectoryInputDigest) throw new Error(`TARGET_DIRECTORY_SUMMARY_MISMATCH:${row.targetPath}`);
    if (row.targetFileSha256) {
      const targetBytes = readFileSync(targetPath);
      if (sha256(targetBytes) !== row.targetFileSha256) throw new Error(`TARGET_FILE_CHECKSUM_MISMATCH:${row.targetPath}`);
      verifiedTargetBytes++;
    }
  }
  verifiedTaskRefs++;
}
if (exactPathRows !== manifest.resolvedExactRepoRootFiles) throw new Error('EXACT_PATH_COUNT_MISMATCH');
const payload = {
  schema: 'atlas.openspec-source-path-edge-independent-readback.v1',
  runId: manifest.runId,
  status: 'VERIFIED_ADVISORY_REFERENCE_EDGES',
  manifestBodySha256: manifest.manifestBodySha256,
  rowsSha256: manifest.rowsSha256,
  currentTaskSnapshotSha256: sha256(snapshotBytes),
  sourceFileHashesSha256,
  inputDirectoryCount: summaryByPath.size,
  candidateRows: rows.length,
  taskRefsVerified: verifiedTaskRefs,
  exactEvidenceSpansVerified: verifiedEvidenceSpans,
  exactTargetFilesVerified: exactPathRows,
  targetFileContentHashesVerified: verifiedTargetBytes,
  allTargetDirectorySummaryBindingsVerified: true,
  workspaceRevision: null,
  canonicalAuthority: false,
  productionWrites: false,
};
const receiptPath = path.join(path.dirname(manifestPath), 'independent-readback.json');
const receiptBytes = Buffer.from(`${JSON.stringify(payload, null, 2)}\n`, 'utf8');
writeFileSync(receiptPath, receiptBytes, { flag: 'wx' });
process.stdout.write(`${JSON.stringify({ ...payload, receiptPath: path.relative(root, receiptPath).replaceAll(path.sep, '/'), receiptSha256: sha256(receiptBytes) })}\n`);
