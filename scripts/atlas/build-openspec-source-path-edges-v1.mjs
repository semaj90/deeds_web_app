#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { lstatSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { tableFromIPC } from 'apache-arrow';
import { extractOpenSpecSourcePathRefsV1, resolveRepositoryPathV1 } from './lib/openspec-source-path-edges-v1.mjs';

const [summaryArtifactArg, summaryManifestArg, runId] = process.argv.slice(2);
if (!summaryArtifactArg || !summaryManifestArg || !/^[a-zA-Z0-9][a-zA-Z0-9-]{2,63}$/.test(runId ?? '')) {
  throw new Error('USAGE: node scripts/atlas/build-openspec-source-path-edges-v1.mjs <directory-summaries.arrow> <summary-manifest.json> <run-id>');
}

const root = process.cwd();
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const canonical = value => JSON.stringify(value);
const writeExclusive = (filePath, bytes) => writeFileSync(filePath, bytes, { flag: 'wx' });
const summaryPath = path.resolve(root, summaryArtifactArg);
const summaryManifestPath = path.resolve(root, summaryManifestArg);
const summaryBytes = readFileSync(summaryPath);
const summaryManifestBytes = readFileSync(summaryManifestPath);
const summaryManifest = JSON.parse(summaryManifestBytes.toString('utf8'));
if (summaryManifest.schema !== 'atlas.directory-metadata-summaries.v1'
  || summaryManifest.artifactSha256 !== sha256(summaryBytes)) throw new Error('DIRECTORY_SUMMARY_INPUT_BINDING_INVALID');
const summaryTable = tableFromIPC(summaryBytes);
if (summaryTable.numRows !== summaryManifest.summaryCount) throw new Error('DIRECTORY_SUMMARY_ROW_COUNT_MISMATCH');
const summaryByPath = new Map(summaryTable.toArray().map(row => [row.relativePath, row]));
if (summaryByPath.size !== summaryTable.numRows) throw new Error('DIRECTORY_SUMMARY_DUPLICATE_PATH');
const directorySummaryPaths = [...summaryByPath.keys()];
const directorySummaryPathSet = new Set(directorySummaryPaths);
const directoryEntriesCache = new Map();

const workboardScript = path.join(root, 'scripts', 'atlas', 'build-openspec-workboard-v1.mjs');
const snapshotBuffer = execFileSync(process.execPath, [workboardScript, '--task-snapshot-stdout'], {
  cwd: root,
  maxBuffer: 256 * 1024 * 1024,
});
const snapshot = JSON.parse(snapshotBuffer.toString('utf8'));
if (snapshot.schema !== 'atlas.openspec.workboard-task-snapshot.v1' || !Array.isArray(snapshot.tasks)) {
  throw new Error('OPENSPEC_WORKBOARD_TASK_SNAPSHOT_INVALID');
}
const taskFiles = new Map();
const verifyTaskFiles = () => {
  for (const [sourcePath, expectedRevision] of Object.entries(snapshot.sourceFileHashes ?? {})) {
    const normalized = sourcePath.replaceAll('\\', '/');
    if (normalized.startsWith('/') || normalized.split('/').some(segment => segment === '..')) throw new Error('TASK_SOURCE_PATH_UNSAFE');
    const absolutePath = path.resolve(root, normalized);
    const relativePath = path.relative(root, absolutePath);
    if (relativePath.startsWith('..') || path.isAbsolute(relativePath)) throw new Error('TASK_SOURCE_PATH_OUTSIDE_REPOSITORY');
    const stat = lstatSync(absolutePath);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`TASK_SOURCE_NOT_REGULAR_FILE:${normalized}`);
    const sourceText = readFileSync(absolutePath, 'utf8');
    const actualRevision = `sha256:${sha256(Buffer.from(sourceText, 'utf8'))}`;
    if (actualRevision !== expectedRevision) throw new Error(`TASK_SOURCE_REVISION_MISMATCH:${normalized}`);
    taskFiles.set(normalized, sourceText);
  }
};
verifyTaskFiles();

const rows = [];
for (const task of snapshot.tasks) {
  const taskSource = task.source.replaceAll('\\', '/');
  const sourceText = taskFiles.get(taskSource);
  if (sourceText === undefined) throw new Error(`TASK_SOURCE_HASH_NOT_IN_SNAPSHOT:${taskSource}`);
  const refs = extractOpenSpecSourcePathRefsV1({
    task,
    sourceText,
    expectedTaskFileSha256: snapshot.sourceFileHashes[task.source],
  });
  for (const ref of refs) {
    const resolution = resolveRepositoryPathV1({ repositoryRoot: root, referencedPath: ref.referencedPath,
      directorySummaryPaths: directorySummaryPathSet, directoryEntriesCache });
    const summary = resolution.directoryPath ? summaryByPath.get(resolution.directoryPath) : null;
    let targetFileBytes = null;
    let targetFileSha256 = null;
    let targetContentStatus = 'NOT_READ_PATH_REFERENCE_ONLY';
    if (resolution.status === 'EXACT_REPO_ROOT_FILE') {
      const targetPath = path.resolve(root, resolution.resolvedPath);
      const stat = lstatSync(targetPath);
      targetFileBytes = stat.size;
      if (stat.size <= 2_000_000) {
        const targetBytes = readFileSync(targetPath);
        targetFileSha256 = sha256(targetBytes);
        targetContentStatus = 'SHA256_CAPTURED_CURRENT_WORKTREE';
      } else {
        targetContentStatus = 'NOT_HASHED_ABOVE_2MB_LIMIT';
      }
    }
    rows.push({
      ...ref,
      resolutionStatus: resolution.status,
      targetPath: resolution.resolvedPath,
      targetDirectoryPath: resolution.directoryPath,
      targetDirectorySummarySha256: summary?.summarySha256 ?? null,
      targetDirectoryInputDigest: summary?.inputDigest ?? null,
      targetFileBytes,
      targetFileSha256,
      targetContentStatus,
    });
  }
}
verifyTaskFiles();
rows.sort((a, b) => a.taskRef.localeCompare(b.taskRef)
  || a.evidenceStartByte - b.evidenceStartByte || a.referencedPath.localeCompare(b.referencedPath));

const rowsBytes = Buffer.from(`${rows.map(canonical).join('\n')}${rows.length ? '\n' : ''}`, 'utf8');
const countsByResolution = Object.fromEntries([...new Set(rows.map(row => row.resolutionStatus))].sort().map(status => [
  status, rows.filter(row => row.resolutionStatus === status).length,
]));
const outputDir = path.join(root, '.tmp', 'atlas', 'directory-intelligence', 'openspec-source-path-edges', runId);
mkdirSync(path.dirname(outputDir), { recursive: true });
mkdirSync(outputDir, { recursive: false });
const rowsPath = path.join(outputDir, 'path-references.jsonl');
writeExclusive(rowsPath, rowsBytes);
const readbackRows = readFileSync(rowsPath, 'utf8').split(/\r?\n/).filter(Boolean).map(line => JSON.parse(line));
if (readbackRows.length !== rows.length || sha256(readFileSync(rowsPath)) !== sha256(rowsBytes)) {
  throw new Error('OPENSPEC_PATH_EDGE_READBACK_FAILED');
}
const body = {
  schema: 'atlas.openspec-source-path-edge-manifest.v1',
  runId,
  status: 'ADVISORY_EXPLICIT_PATH_REFERENCES_ONLY',
  canonicalAuthority: false,
  workspaceRevision: null,
  authorityStatus: 'CURRENT_WORKTREE_UNBOUND_TO_WORKSPACE_SNAPSHOT',
  inputs: {
    taskSnapshotSchema: snapshot.schema,
    taskSnapshotSha256: sha256(snapshotBuffer),
    taskSourceFileCount: Object.keys(snapshot.sourceFileHashes ?? {}).length,
    taskCount: snapshot.tasks.length,
    sourceFileHashesSha256: sha256(Buffer.from(canonical(Object.entries(snapshot.sourceFileHashes ?? {}).sort(([a], [b]) => a.localeCompare(b))))),
    directorySummaryArtifactSha256: sha256(summaryBytes),
    directorySummaryManifestSha256: sha256(summaryManifestBytes),
    directoryCount: summaryByPath.size,
  },
  rowCount: rows.length,
  resolvedExactRepoRootFiles: countsByResolution.EXACT_REPO_ROOT_FILE ?? 0,
  countsByResolution,
  distinctTaskRefs: new Set(rows.map(row => row.taskRef)).size,
  distinctTargetPaths: new Set(rows.filter(row => row.targetPath).map(row => row.targetPath)).size,
  rowsSha256: sha256(rowsBytes),
  rowsPath: path.relative(root, rowsPath).replaceAll(path.sep, '/'),
  rowsBytes: rowsBytes.byteLength,
  rowsReadbackCount: readbackRows.length,
  rowsReadbackSha256: sha256(readFileSync(rowsPath)),
  writesPerformed: true,
  productionStoreWrites: false,
  limitations: [
    'A literal task-line path is a reference candidate, not proof that the task requires or governs the target source.',
    'Only exact repository-root paths are resolved; aliases and project-relative paths remain unresolved rather than guessed.',
    'Current worktree hashes do not establish an admitted workspace revision or canonical OpenSpec requirement identity.',
  ],
};
const manifest = { ...body, manifestBodySha256: sha256(Buffer.from(canonical(body))) };
const manifestPath = path.join(outputDir, 'manifest.json');
writeExclusive(manifestPath, Buffer.from(`${canonical(manifest)}\n`, 'utf8'));
process.stdout.write(`${JSON.stringify({ ...manifest, manifestPath: path.relative(root, manifestPath).replaceAll(path.sep, '/') })}\n`);
