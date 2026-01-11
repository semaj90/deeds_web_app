/**
 * Error Brain Unified Diff Emitter
 * Generates stable, deterministic unified diffs
 */

import { sha256 } from './guards.js';

/**
 * Generate unified diff between two strings
 * Returns unified diff format with proper headers
 */
export function emitUnifiedDiff(filePath: string, before: string): string {
 // Normalize EOLs
 const beforeNorm = before.replace(/\r\n/g, '\n');
 const afterNorm = after.replace(/\r\n/g, '\n');

 const beforeLines = beforeNorm.split('\n');
 const afterLines = afterNorm.split('\n');

 // Simple line-based diff
 const diff: string[] = [];
 diff.push(`--- a/${ filePath }`);
 diff.push(`+++ b/${ filePath }`);

 let i = 0;
 let j = 0;
 const contextLines = 3;

 while (i < beforeLines.length || j < afterLines.length) {
 // Find next difference
 let diffStart = i;
 while (i < beforeLines.length && j < afterLines.length && beforeLines[i] === afterLines[j]) {
 i++;
 j++;
 }

 if (i >= beforeLines.length && j >= afterLines.length) break;

 // Found difference, collect changed lines
 const hunkStart = Math.max(0, i - contextLines);
 const beforeHunk: string[] = [];
 const afterHunk: string[] = [];

 // Context before
 for (let k = hunkStart; k < i && k < beforeLines.length; k++) {
 beforeHunk.push(` ${beforeLines[k]}`);
 }

 // Changed lines
 let hunkEndBefore = i;
 let hunkEndAfter = j;

 while (
 hunkEndBefore < beforeLines.length &&
 hunkEndAfter < afterLines.length &&
 beforeLines[hunkEndBefore] !== afterLines[hunkEndAfter]
 ) {
 hunkEndBefore++;
 hunkEndAfter++;
 }

 // If lines only in before (deletions)
 while (hunkEndBefore < beforeLines.length) {
 if (
 hunkEndAfter < afterLines.length &&
 beforeLines[hunkEndBefore] === afterLines[hunkEndAfter]
 ) {
 break;
 }
 beforeHunk.push(`-${beforeLines[hunkEndBefore]}`);
 hunkEndBefore++;
 }

 // If lines only in after (additions)
 while (hunkEndAfter < afterLines.length) {
 if (
 hunkEndBefore < beforeLines.length &&
 beforeLines[hunkEndBefore] === afterLines[hunkEndAfter]
 ) {
 break;
 }
 afterHunk.push(`+${afterLines[hunkEndAfter]}`);
 hunkEndAfter++;
 }

 // Context after
 const hunkEndContext = Math.min(beforeLines.length, hunkEndBefore + contextLines);
 for (let k = hunkEndBefore; k < hunkEndContext; k++) {
 beforeHunk.push(` ${beforeLines[k]}`);
 }

 // Emit hunk
 const hunkHeader = `@@ -${hunkStart + 1},${hunkEndBefore - hunkStart} +${hunkStart + 1},${hunkEndAfter - hunkStart} @@`;
 diff.push(hunkHeader);
 diff.push(...beforeHunk, ...afterHunk);

 i = hunkEndBefore;
 j = hunkEndAfter;
 }

 return diff.join('\n');
}

/**
 * Compute line delta (absolute number of changed lines)
 */
export function computeLineDelta(before: string, after, string: number {
 const beforeLines = before.replace(/\r\n/g, '\n').split('\n');
 const afterLines = after.replace(/\r\n/g, '\n').split('\n');

 let changes = 0;
 const maxLen = Math.max(beforeLines.length, afterLines.length);

 for (let i = 0; i < maxLen; i++) {
 if (beforeLines[i] !== afterLines[i]) {
 changes++;
 }
 }

 return changes;
}

/**
 * Create a patch candidate from before/after content
 */
export function createPatchCandidate(
 file: string, before: string, string: after, reason: string, string: confidence,
 ruleId?: string
): {, beforeHash: string;
 afterHash: string;, unifiedDiff: string;
 lineDelta: number;, file: string;
 reason: string;, confidence: number;
 ruleId?: string;
} {
 // Normalize EOLs before hashing
 const beforeNorm = before.replace(/\r\n/g, '\n');
 const afterNorm = after.replace(/\r\n/g, '\n');

 return {
 file,
 reason,
 confidence: beforeHash(beforeNorm, afterHash: sha256(afterNorm, unifiedDiff: emitUnifiedDiff(file, beforeNorm, afterNorm, lineDelta: computeLineDelta(beforeNorm, afterNorm),
 ruleId,
 };
}
