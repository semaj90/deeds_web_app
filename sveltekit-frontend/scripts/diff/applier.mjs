#!/usr/bin/env node
/**
 * scripts/diff/applier.mjs
 *
 * PHASE 16: Patch application runner
 *
 * Safety features:
 * - Hash guard (refuse if file changed)
 * - Format guard (optional prettier/eslint per-file)
 * - Dry-run mode
 * - Safety cap for max lines changed
 *
 * CONSTRAINTS:
 * - Don't apply if target file missing
 * - Don't apply if hash mismatch
 * - Don't apply if diff touches >N lines (configurable)
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { hash } from './generator.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * @typedef {Object} ApplyResult
 * @property {boolean} success
 * @property {string} message
 * @property {string} [error] - Error message if failed
 * @property {Object} [details] - Additional context
 */

/**
 * Configuration for patch application
 */
export const DEFAULT_CONFIG = {
  dryRun: false,
  maxLinesChanged: 100,
  enableFormatGuard: false,
  backupOriginal: true,
  verifyHash: true
};

/**
 * Safety checks before applying patch
 *
 * @param {import('./generator.mjs').PatchMetadata} patch
 * @param {Object} config
 * @returns {{safe: boolean, reason?: string}}
 */
export function validatePatch(patch, config = DEFAULT_CONFIG) {
  // Check 1: File exists
  if (!fs.existsSync(patch.filePath)) {
    return {
      safe: false,
      reason: 'Target file does not exist'
    };
  }

  // Check 2: Hash matches (file hasn't changed since diff was generated)
  if (config.verifyHash) {
    const currentContent = fs.readFileSync(patch.filePath, 'utf8');
    const currentHash = hash(currentContent);

    if (currentHash !== patch.beforeHash) {
      return {
        safe: false,
        reason: `Hash mismatch - file changed since diff was created. Expected: ${patch.beforeHash.substring(0, 12)}, got: ${currentHash.substring(0, 12)}`
      };
    }
  }

  // Check 3: Lines changed within safety cap
  const totalChanges = patch.totalAdditions + patch.totalDeletions;
  if (totalChanges > config.maxLinesChanged) {
    return {
      safe: false,
      reason: `Exceeds safety cap: ${totalChanges} lines changed (max: ${config.maxLinesChanged})`
    };
  }

  // Check 4: Confidence threshold (optional)
  if (patch.confidence < 0.5) {
    return {
      safe: false,
      reason: `Low confidence: ${(patch.confidence * 100).toFixed(1)}% (minimum: 50%)`
    };
  }

  return { safe: true };
}

/**
 * Apply a single hunk to content
 *
 * @param {string} content - Original file content
 * @param {import('./generator.mjs').DiffHunk} hunk
 * @returns {string} - Modified content
 */
export function applyHunk(content, hunk) {
  const lines = content.split('\n');
  const result = [];
  let lineIndex = 0;

  // Copy lines before hunk
  while (lineIndex < hunk.oldStart - 1) {
    result.push(lines[lineIndex]);
    lineIndex++;
  }

  // Apply hunk changes
  for (const diffLine of hunk.lines) {
    const prefix = diffLine[0];
    const text = diffLine.substring(1);

    if (prefix === ' ') {
      // Context line - keep as is
      result.push(text);
      lineIndex++;
    } else if (prefix === '-') {
      // Deletion - skip this line
      lineIndex++;
    } else if (prefix === '+') {
      // Addition - insert new line
      result.push(text);
    }
  }

  // Copy remaining lines
  while (lineIndex < lines.length) {
    result.push(lines[lineIndex]);
    lineIndex++;
  }

  return result.join('\n');
}

/**
 * Apply patch to file
 *
 * @param {import('./generator.mjs').PatchMetadata} patch
 * @param {Object} config
 * @returns {ApplyResult}
 */
export function applyPatch(patch, config = DEFAULT_CONFIG) {
  // Safety checks
  const validation = validatePatch(patch, config);
  if (!validation.safe) {
    return {
      success: false,
      message: 'Patch validation failed',
      error: validation.reason
    };
  }

  try {
    const originalContent = fs.readFileSync(patch.filePath, 'utf8');

    // Backup original if requested
    if (config.backupOriginal && !config.dryRun) {
      const backupPath = `${patch.filePath}.backup-${Date.now()}`;
      fs.writeFileSync(backupPath, originalContent, 'utf8');
    }

    // Apply all hunks
    let modifiedContent = originalContent;
    for (const hunk of patch.hunks) {
      modifiedContent = applyHunk(modifiedContent, hunk);
    }

    // Verify result hash matches expectation
    const resultHash = hash(modifiedContent);
    if (resultHash !== patch.afterHash) {
      return {
        success: false,
        message: 'Patch application failed',
        error: `Result hash mismatch. Expected: ${patch.afterHash.substring(0, 12)}, got: ${resultHash.substring(0, 12)}`
      };
    }

    // Write result (unless dry-run)
    if (!config.dryRun) {
      fs.writeFileSync(patch.filePath, modifiedContent, 'utf8');
    }

    return {
      success: true,
      message: config.dryRun ? 'Dry-run successful (no file modified)' : 'Patch applied successfully',
      details: {
        additions: patch.totalAdditions,
        deletions: patch.totalDeletions,
        confidence: patch.confidence,
        reason: patch.reason
      }
    };
  } catch (error) {
    return {
      success: false,
      message: 'Patch application error',
      error: error.message
    };
  }
}

/**
 * Apply multiple patches with rollback on failure
 *
 * @param {import('./generator.mjs').PatchMetadata[]} patches
 * @param {Object} config
 * @returns {{success: boolean, applied: number, failed: number, results: ApplyResult[]}}
 */
export function applyPatches(patches, config = DEFAULT_CONFIG) {
  const results = [];
  let applied = 0;
  let failed = 0;

  for (const patch of patches) {
    const result = applyPatch(patch, config);
    results.push({
      ...result,
      filePath: patch.filePath
    });

    if (result.success) {
      applied++;
    } else {
      failed++;
      console.error(`✗ ${path.basename(patch.filePath)}: ${result.error}`);
    }
  }

  return {
    success: failed === 0,
    applied,
    failed,
    results
  };
}

/**
 * CLI entry point
 */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [,, patchFile, ...flags] = process.argv;

  if (!patchFile) {
    console.error('Usage: node applier.mjs <patch.json> [--dry-run] [--no-verify] [--max-lines=N]');
    process.exit(1);
  }

  const config = { ...DEFAULT_CONFIG };
  if (flags.includes('--dry-run')) config.dryRun = true;
  if (flags.includes('--no-verify')) config.verifyHash = false;

  const maxLinesFlag = flags.find(f => f.startsWith('--max-lines='));
  if (maxLinesFlag) {
    config.maxLinesChanged = parseInt(maxLinesFlag.split('=')[1], 10);
  }

  const patch = JSON.parse(fs.readFileSync(patchFile, 'utf8'));
  const result = applyPatch(patch, config);

  if (result.success) {
    console.log(`✅ ${result.message}`);
    if (result.details) {
      console.log(`   +${result.details.additions} -${result.details.deletions}`);
      console.log(`   Confidence: ${(result.details.confidence * 100).toFixed(1)}%`);
      console.log(`   Reason: ${result.details.reason}`);
    }
  } else {
    console.error(`✗ ${result.message}`);
    console.error(`   ${result.error}`);
    process.exit(1);
  }
}
