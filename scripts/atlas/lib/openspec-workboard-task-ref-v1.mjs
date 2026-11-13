import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, realpathSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const sha256 = (bytes) => `sha256:${createHash('sha256').update(bytes).digest('hex')}`;

/** Resolve only an exact, caller-selected OpenSpec identity from the existing workboard snapshot. */
export function resolveOpenSpecWorkboardTaskRefV1(taskKey, {
  workboardPath = path.join(repoRoot, 'docs', 'reports', 'openspec-workboard-v1.json'),
  root = repoRoot,
  currentHead = null,
  sourceBytesReader = (sourcePath) => readFileSync(sourcePath),
} = {}) {
  if (typeof taskKey !== 'string' || taskKey.trim() !== taskKey || taskKey.length === 0 || taskKey.length > 512) {
    throw new Error('WORKBOARD_TASK_KEY_INVALID');
  }
  const bytes = readFileSync(workboardPath);
  const workboard = JSON.parse(bytes.toString('utf8'));
  if (workboard?.schema !== 'atlas.openspec.workboard.v1' || !Array.isArray(workboard.taskInventory)) {
    throw new Error('WORKBOARD_SNAPSHOT_SCHEMA_INVALID');
  }
  const matches = workboard.taskInventory.filter((task) =>
    task.taskKey === taskKey || task.stableKey === taskKey || task.logicalTaskKey === taskKey);
  if (matches.length !== 1) throw new Error(matches.length ? 'WORKBOARD_TASK_KEY_AMBIGUOUS' : 'WORKBOARD_TASK_KEY_NOT_FOUND');
  const task = matches[0];
  if (task.state !== 'OPEN') throw new Error('WORKBOARD_TASK_NOT_OPEN');
  if (typeof task.taskKey !== 'string' || typeof task.stableKey !== 'string' || task.stableKey.length === 0
    || typeof task.blockHash !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(task.blockHash)) {
    throw new Error('WORKBOARD_TASK_REVISION_INVALID');
  }
  if (typeof workboard.generatedAt !== 'string' || !Number.isFinite(Date.parse(workboard.generatedAt))) {
    throw new Error('WORKBOARD_SNAPSHOT_TIMESTAMP_INVALID');
  }
  const sourceRef = task.source;
  if (typeof sourceRef !== 'string' || sourceRef.includes('\0') || path.isAbsolute(sourceRef)
    || sourceRef.replace(/\\/g, '/').split('/').some((part) => !part || part === '.' || part === '..')) {
    throw new Error('WORKBOARD_SOURCE_REF_INVALID');
  }
  const sourceFileSha256 = workboard.sourceFileHashes?.[sourceRef];
  if (typeof sourceFileSha256 !== 'string' || !/^sha256:[a-f0-9]{64}$/.test(sourceFileSha256)) {
    throw new Error('WORKBOARD_SOURCE_FILE_HASH_MISSING');
  }
  const absoluteSource = path.resolve(root, sourceRef);
  const relativeSource = path.relative(root, absoluteSource);
  if (!relativeSource || relativeSource.startsWith('..') || path.isAbsolute(relativeSource)) {
    throw new Error('WORKBOARD_SOURCE_REF_OUTSIDE_REPOSITORY');
  }
  if (lstatSync(absoluteSource).isSymbolicLink() || !statSync(absoluteSource).isFile()) {
    throw new Error('WORKBOARD_SOURCE_NOT_REGULAR_FILE');
  }
  const realRoot = realpathSync(root);
  const realSource = realpathSync(absoluteSource);
  const realRelativeSource = path.relative(realRoot, realSource);
  if (!realRelativeSource || realRelativeSource.startsWith('..') || path.isAbsolute(realRelativeSource)) {
    throw new Error('WORKBOARD_SOURCE_REF_OUTSIDE_REPOSITORY');
  }
  if (sha256(sourceBytesReader(realSource)) !== sourceFileSha256) {
    throw new Error('WORKBOARD_SOURCE_FILE_REVISION_MISMATCH');
  }

  return {
    schema: 'atlas.openspec-workboard-task-ref.v1',
    workboardTaskId: task.taskKey,
    stableKey: task.stableKey,
    logicalTaskKey: task.logicalTaskKey ?? null,
    taskRevision: task.blockHash,
    sourceRef: sourceRef.replace(/\\/g, '/'),
    sourceFileSha256,
    workboardSnapshotSha256: sha256(bytes),
    workboardGeneratedAt: workboard.generatedAt,
    currentHead,
    status: 'CAPTURE_ASSERTED_SOURCE_CURRENT_LINK',
    dispatchRevalidation: 'REQUIRED',
    authority: 'PROPOSAL_REFERENCE_ONLY',
    canonicalAuthority: false,
  };
}

/**
 * Resolve only reviewer-supplied diagnostic-fingerprint -> exact task-key bindings.
 * Unmapped diagnostics stay unbound; unknown or duplicate fingerprints fail closed.
 */
export function resolveOpenSpecDiagnosticTaskBindingsV1(bindings, diagnosticFingerprints, options = {}) {
  if (!Array.isArray(bindings) || !Array.isArray(diagnosticFingerprints)) {
    throw new Error('DIAGNOSTIC_TASK_BINDINGS_INVALID');
  }
  const known = new Set(diagnosticFingerprints);
  const resolved = new Map();
  for (const binding of bindings) {
    if (!binding || typeof binding.diagnosticFingerprint !== 'string'
      || !/^sha256:[a-f0-9]{64}$/.test(binding.diagnosticFingerprint)
      || typeof binding.taskKey !== 'string' || !binding.taskKey.trim()) {
      throw new Error('DIAGNOSTIC_TASK_BINDING_INVALID');
    }
    if (!known.has(binding.diagnosticFingerprint)) throw new Error('DIAGNOSTIC_TASK_BINDING_FINGERPRINT_NOT_IN_RUN');
    if (resolved.has(binding.diagnosticFingerprint)) throw new Error('DIAGNOSTIC_TASK_BINDING_DUPLICATE_FINGERPRINT');
    resolved.set(
      binding.diagnosticFingerprint,
      resolveOpenSpecWorkboardTaskRefV1(binding.taskKey, options),
    );
  }
  return resolved;
}
