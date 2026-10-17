import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

function sha256(bytes) {
  return `sha256:${crypto.createHash('sha256').update(bytes).digest('hex')}`;
}

export function runIndexedSourceAstGrepV1({ repoRoot, sourceRef, expectedRevision, sidecarUrl }) {
  const workingTreePath = path.resolve(repoRoot, ...sourceRef.split('/'));
  const repoReal = fs.realpathSync(repoRoot);
  const relativePath = path.relative(repoReal, workingTreePath);
  if (!relativePath || relativePath.startsWith('..') || path.isAbsolute(relativePath) || !fs.existsSync(workingTreePath)) {
    return { status: 'SKIPPED_WORKING_TREE_SOURCE_UNAVAILABLE' };
  }
  if (sha256(fs.readFileSync(workingTreePath)) !== expectedRevision) {
    return { status: 'SKIPPED_WORKING_TREE_REVISION_MISMATCH' };
  }
  const script = path.join(repoRoot, 'scripts', 'atlas', 'ast-chunk-keyed-map-v1.mjs');
  const result = spawnSync(process.execPath, [script, sourceRef, `--sidecar=${sidecarUrl}`], {
    cwd: repoRoot, encoding: 'utf8', timeout: 90000, maxBuffer: 8 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  let summary;
  try { summary = JSON.parse(result.stdout); }
  catch { throw new Error(`AST_GREP_DIAGNOSTIC_INVALID_OUTPUT:${String(result.stderr).slice(0, 300)}`); }
  if (result.status !== 0 || summary.filesFailed !== 0) throw new Error(`AST_GREP_DIAGNOSTIC_FAILED:${JSON.stringify(summary.files?.[0]?.stageStatus ?? [])}`);
  return summary.files?.[0] ?? null;
}
