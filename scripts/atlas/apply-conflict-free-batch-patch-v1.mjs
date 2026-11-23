#!/usr/bin/env node
/**
 * Conflict-Free Batch tasks.md / JSON Patch Applier (v1)
 *
 * - Locks every patch by (sourceRef, expectedFileSha256, taskRevision).
 * - Dry-run by default (apply: false); validates all files in memory first.
 * - Atomically rolls back every touched file if any conflict, write error,
 *   or post-batch validator fails.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export function sha256Text(text) {
  return `sha256:${crypto.createHash('sha256').update(text, 'utf8').digest('hex')}`;
}

function resolveSafeRepoFile(repoRoot, sourceRef) {
  const cleaned = String(sourceRef ?? '').trim().replaceAll('\\', '/');
  if (!cleaned || path.isAbsolute(cleaned) || cleaned.split('/').includes('..')) {
    return null;
  }
  const rootAbs = path.resolve(repoRoot);
  const abs = path.resolve(rootAbs, cleaned);
  if (abs !== rootAbs && !abs.startsWith(rootAbs + path.sep)) {
    return null;
  }
  return { sourceRef: cleaned, absPath: abs };
}

export function applyConflictFreeBatchPatchV1({
  repoRoot,
  patches,
  apply = false,
  validator = null,
}) {
  if (!Array.isArray(patches) || patches.length === 0) {
    return {
      schema: 'atlas.conflict-free-batch-patch.v1',
      status: 'CONFLICT_REJECTED',
      failure: 'EMPTY_PATCH_BATCH',
      applied: false,
      rolledBack: false,
      fileReceipts: [],
      canonicalAuthority: false,
    };
  }

  const seenRefs = new Set();
  const staged = [];

  for (const patch of patches) {
    const resolved = resolveSafeRepoFile(repoRoot, patch?.sourceRef);
    if (!resolved) {
      return {
        schema: 'atlas.conflict-free-batch-patch.v1',
        status: 'CONFLICT_REJECTED',
        failure: `UNSAFE_SOURCE_REF:${String(patch?.sourceRef ?? '')}`,
        applied: false,
        rolledBack: false,
        fileReceipts: [],
        canonicalAuthority: false,
      };
    }
    if (seenRefs.has(resolved.sourceRef)) {
      return {
        schema: 'atlas.conflict-free-batch-patch.v1',
        status: 'CONFLICT_REJECTED',
        failure: `DUPLICATE_SOURCE_REF_IN_BATCH:${resolved.sourceRef}`,
        applied: false,
        rolledBack: false,
        fileReceipts: [],
        canonicalAuthority: false,
      };
    }
    seenRefs.add(resolved.sourceRef);

    if (!patch?.taskRevision || typeof patch.taskRevision !== 'string') {
      return {
        schema: 'atlas.conflict-free-batch-patch.v1',
        status: 'CONFLICT_REJECTED',
        failure: `MISSING_TASK_REVISION:${resolved.sourceRef}`,
        applied: false,
        rolledBack: false,
        fileReceipts: [],
        canonicalAuthority: false,
      };
    }
    if (!fs.existsSync(resolved.absPath)) {
      return {
        schema: 'atlas.conflict-free-batch-patch.v1',
        status: 'CONFLICT_REJECTED',
        failure: `FILE_NOT_FOUND:${resolved.sourceRef}`,
        applied: false,
        rolledBack: false,
        fileReceipts: [],
        canonicalAuthority: false,
      };
    }

    const originalText = fs.readFileSync(resolved.absPath, 'utf8');
    const actualSha = sha256Text(originalText);
    if (actualSha !== patch.expectedFileSha256) {
      return {
        schema: 'atlas.conflict-free-batch-patch.v1',
        status: 'CONFLICT_REJECTED',
        failure: `FILE_SHA256_MISMATCH:${resolved.sourceRef}`,
        applied: false,
        rolledBack: false,
        fileReceipts: [],
        canonicalAuthority: false,
      };
    }

    const targetText = String(patch.targetText ?? '');
    const replacementText = String(patch.replacementText ?? '');
    if (!targetText) {
      return {
        schema: 'atlas.conflict-free-batch-patch.v1',
        status: 'CONFLICT_REJECTED',
        failure: `EMPTY_TARGET_TEXT:${resolved.sourceRef}`,
        applied: false,
        rolledBack: false,
        fileReceipts: [],
        canonicalAuthority: false,
      };
    }

    const firstIdx = originalText.indexOf(targetText);
    if (firstIdx === -1) {
      return {
        schema: 'atlas.conflict-free-batch-patch.v1',
        status: 'CONFLICT_REJECTED',
        failure: `TARGET_TEXT_NOT_FOUND:${resolved.sourceRef}`,
        applied: false,
        rolledBack: false,
        fileReceipts: [],
        canonicalAuthority: false,
      };
    }
    if (originalText.indexOf(targetText, firstIdx + 1) !== -1) {
      return {
        schema: 'atlas.conflict-free-batch-patch.v1',
        status: 'CONFLICT_REJECTED',
        failure: `AMBIGUOUS_TARGET_TEXT:${resolved.sourceRef}`,
        applied: false,
        rolledBack: false,
        fileReceipts: [],
        canonicalAuthority: false,
      };
    }

    const nextText =
      originalText.slice(0, firstIdx) +
      replacementText +
      originalText.slice(firstIdx + targetText.length);

    staged.push({
      sourceRef: resolved.sourceRef,
      absPath: resolved.absPath,
      taskRevision: patch.taskRevision,
      beforeSha256: actualSha,
      afterSha256: sha256Text(nextText),
      originalText,
      nextText,
    });
  }

  const fileReceipts = staged.map(({ sourceRef, taskRevision, beforeSha256, afterSha256 }) => ({
    sourceRef,
    taskRevision,
    beforeSha256,
    afterSha256,
  }));

  if (!apply) {
    return {
      schema: 'atlas.conflict-free-batch-patch.v1',
      status: 'DRY_RUN_VALIDATED',
      failure: null,
      applied: false,
      rolledBack: false,
      fileReceipts,
      canonicalAuthority: false,
    };
  }

  const written = [];
  try {
    for (const item of staged) {
      fs.writeFileSync(item.absPath, item.nextText, 'utf8');
      written.push(item);
    }
    if (typeof validator === 'function') {
      const validation = validator(fileReceipts);
      if (!validation?.ok) {
        throw new Error(validation?.failure || 'POST_BATCH_VALIDATION_FAILED');
      }
    }
    return {
      schema: 'atlas.conflict-free-batch-patch.v1',
      status: 'APPLIED_AND_VERIFIED',
      failure: null,
      applied: true,
      rolledBack: false,
      fileReceipts,
      canonicalAuthority: false,
    };
  } catch (err) {
    for (const item of written.reverse()) {
      fs.writeFileSync(item.absPath, item.originalText, 'utf8');
    }
    return {
      schema: 'atlas.conflict-free-batch-patch.v1',
      status: 'ROLLED_BACK',
      failure: err instanceof Error ? err.message : 'BATCH_APPLY_FAILED',
      applied: false,
      rolledBack: true,
      fileReceipts,
      canonicalAuthority: false,
    };
  }
}
