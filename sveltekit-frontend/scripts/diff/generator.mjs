#!/usr/bin/env node
/**
 * scripts/diff/generator.mjs
 *
 * PHASE 15: Diff generation core
 *
 * Generates unified diffs (or patch JSON) with:
 * - file path
 * - hunks (before/after blocks)
 * - before/after hashes (SHA-256)
 * - confidence (0-1 score)
 * - reason (human-readable explanation)
 *
 * CONSTRAINT: One patch = one file
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * @typedef {Object} DiffHunk
 * @property {number} oldStart - Start line in original file (1-indexed)
 * @property {number} oldLines - Number of lines in original
 * @property {number} newStart - Start line in new file (1-indexed)
 * @property {number} newLines - Number of lines in new
 * @property {string[]} lines - Diff lines (prefixed with ' ', '+', '-')
 */

/**
 * @typedef {Object} PatchMetadata
 * @property {string} filePath - Absolute path to target file
 * @property {string} beforeHash - SHA-256 of original content
 * @property {string} afterHash - SHA-256 of patched content
 * @property {number} confidence - 0.0-1.0 score (higher = safer)
 * @property {string} reason - Human explanation of the fix
 * @property {DiffHunk[]} hunks - Change blocks
 * @property {number} totalAdditions - Total '+' lines
 * @property {number} totalDeletions - Total '-' lines
 * @property {string} timestamp - ISO8601 creation time
 */

/**
 * Compute SHA-256 hash of a string
 */
export function hash(content) {
  return crypto.createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Generate unified diff hunks from before/after strings
 *
 * @param {string} before - Original file content
 * @param {string} after - New file content
 * @param {number} [contextLines=3] - Lines of context around changes
 * @returns {DiffHunk[]}
 */
export function generateHunks(before, after, contextLines = 3) {
  const beforeLines = before.split('\n');
  const afterLines = after.split('\n');

  // Simple line-by-line diff (naive implementation)
  // For production, use diff library like 'diff' or 'fast-diff'
  const hunks = [];
  let currentHunk = null;

  const maxLen = Math.max(beforeLines.length, afterLines.length);

  for (let i = 0; i < maxLen; i++) {
    const beforeLine = beforeLines[i];
    const afterLine = afterLines[i];

    if (beforeLine === afterLine) {
      // Same line - add as context
      if (currentHunk) {
        currentHunk.lines.push(` ${beforeLine || ''}`);
      }
    } else {
      // Different lines - start or extend hunk
      if (!currentHunk) {
        currentHunk = {
          oldStart: Math.max(1, i + 1 - contextLines),
          oldLines: 0,
          newStart: Math.max(1, i + 1 - contextLines),
          newLines: 0,
          lines: []
        };

        // Add context before change
        for (let j = Math.max(0, i - contextLines); j < i; j++) {
          currentHunk.lines.push(` ${beforeLines[j] || ''}`);
        }
      }

      // Add changes
      if (beforeLine !== undefined) {
        currentHunk.lines.push(`-${beforeLine}`);
        currentHunk.oldLines++;
      }
      if (afterLine !== undefined) {
        currentHunk.lines.push(`+${afterLine}`);
        currentHunk.newLines++;
      }
    }

    // Close hunk if we've moved past changes
    if (currentHunk && (i >= maxLen - 1 || beforeLines[i + 1] === afterLines[i + 1])) {
      // Add context after change
      for (let j = i + 1; j < Math.min(i + 1 + contextLines, beforeLines.length); j++) {
        currentHunk.lines.push(` ${beforeLines[j] || ''}`);
      }
      hunks.push(currentHunk);
      currentHunk = null;
    }
  }

  return hunks;
}

/**
 * Generate a complete patch object
 *
 * @param {string} filePath - Absolute path to file
 * @param {string} originalContent - Original file content
 * @param {string} newContent - New file content
 * @param {Object} options
 * @param {number} [options.confidence=0.8] - Confidence score (0-1)
 * @param {string} [options.reason='Automated fix'] - Reason for change
 * @returns {PatchMetadata}
 */
export function generatePatch(filePath, originalContent, newContent, options = {}) {
  const {
    confidence = 0.8,
    reason = 'Automated fix'
  } = options;

  const beforeHash = hash(originalContent);
  const afterHash = hash(newContent);
  const hunks = generateHunks(originalContent, newContent);

  const totalAdditions = hunks.reduce((sum, h) =>
    sum + h.lines.filter(l => l.startsWith('+')).length, 0
  );
  const totalDeletions = hunks.reduce((sum, h) =>
    sum + h.lines.filter(l => l.startsWith('-')).length, 0
  );

  return {
    filePath,
    beforeHash,
    afterHash,
    confidence,
    reason,
    hunks,
    totalAdditions,
    totalDeletions,
    timestamp: new Date().toISOString()
  };
}

/**
 * Convert patch to unified diff format (git-style)
 *
 * @param {PatchMetadata} patch
 * @returns {string}
 */
export function patchToUnifiedDiff(patch) {
  const lines = [];

  lines.push(`--- a/${path.basename(patch.filePath)}`);
  lines.push(`+++ b/${path.basename(patch.filePath)}`);
  lines.push(`@@ Reason: ${patch.reason} (confidence: ${(patch.confidence * 100).toFixed(1)}%) @@`);
  lines.push(`@@ Hash before: ${patch.beforeHash.substring(0, 12)} @@`);
  lines.push(`@@ Hash after:  ${patch.afterHash.substring(0, 12)} @@`);
  lines.push('');

  for (const hunk of patch.hunks) {
    lines.push(`@@ -${hunk.oldStart},${hunk.oldLines} +${hunk.newStart},${hunk.newLines} @@`);
    lines.push(...hunk.lines);
  }

  return lines.join('\n');
}

/**
 * Example usage / CLI entry point
 */
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [,, beforeFile, afterFile, outputPath] = process.argv;

  if (!beforeFile || !afterFile) {
    console.error('Usage: node generator.mjs <before-file> <after-file> [output.diff]');
    process.exit(1);
  }

  const before = fs.readFileSync(beforeFile, 'utf8');
  const after = fs.readFileSync(afterFile, 'utf8');

  const patch = generatePatch(beforeFile, before, after, {
    confidence: 0.9,
    reason: 'Manual comparison diff'
  });

  const diff = patchToUnifiedDiff(patch);

  if (outputPath) {
    fs.writeFileSync(outputPath, diff, 'utf8');
    console.log(`✅ Diff written to: ${outputPath}`);
  } else {
    console.log(diff);
  }

  console.log(`\n📊 Stats: +${patch.totalAdditions} -${patch.totalDeletions}`);
}
