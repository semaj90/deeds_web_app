import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function sha256(bytes) {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}

export function runIndexedSourceAstGrepV1({ repoRoot, sourceRef, expectedRevision, sidecarUrl, sourceRoot = repoRoot }) {
  const sourcePath = path.resolve(sourceRoot, ...sourceRef.split('/'));
  const repoReal = fs.realpathSync(repoRoot);
  const sourceRootReal = fs.realpathSync(sourceRoot);
  const relativeRoot = path.relative(repoReal, sourceRootReal);
  const snapshotBase = path.join(repoReal, '.tmp', 'workspace-source-snapshots');
  const relativeToSnapshots = path.relative(snapshotBase, sourceRootReal);
  const isRepoRoot = sourceRootReal === repoReal;
  const isAdmittedSnapshotPath = /^[0-9a-f]{64}$/.test(relativeToSnapshots);
  if (!isRepoRoot && (!isAdmittedSnapshotPath || relativeRoot.startsWith('..') || path.isAbsolute(relativeRoot))) {
    return { status: 'SKIPPED_SOURCE_ROOT_UNTRUSTED' };
  }
  const relativePath = path.relative(sourceRootReal, sourcePath);
  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath) || !fs.existsSync(sourcePath)) {
    return { status: 'SKIPPED_BOUND_SOURCE_UNAVAILABLE' };
  }
  const realSourcePath = fs.realpathSync(sourcePath);
  const realRelativePath = path.relative(sourceRootReal, realSourcePath);
  if (!realRelativePath || realRelativePath.startsWith('..') || path.isAbsolute(realRelativePath)) {
    return { status: 'SKIPPED_BOUND_SOURCE_ESCAPES_ROOT' };
  }
  if (sha256(fs.readFileSync(realSourcePath)) !== expectedRevision) {
    return { status: 'SKIPPED_BOUND_SOURCE_REVISION_MISMATCH' };
  }
  const script = path.join(repoRoot, 'scripts', 'atlas', 'ast-chunk-keyed-map-v1.mjs');
  const result = spawnSync(process.execPath, [script, sourceRef, `--sidecar=${sidecarUrl}`,
    `--source-root=${sourceRootReal}`, `--source-revision=${expectedRevision}`], {
    cwd: repoRoot, encoding: 'utf8', timeout: 90000, maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  let summary;
  try { summary = JSON.parse(result.stdout); }
  catch { throw new Error(`AST_GREP_DIAGNOSTIC_INVALID_OUTPUT:${String(result.stderr).slice(0, 300)}`); }
  if (result.status !== 0 || summary.filesFailed !== 0) throw new Error(`AST_GREP_DIAGNOSTIC_FAILED:${JSON.stringify(summary.files?.[0]?.stageStatus ?? [])}`);
  if (summary.files?.[0]?.source?.disk_sha256 !== expectedRevision) throw new Error('AST_GREP_SOURCE_REVISION_READBACK_MISMATCH');
  return summary.files?.[0] ?? null;
}
