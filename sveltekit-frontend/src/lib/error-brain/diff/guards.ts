/**
 * Error Brain Diff Guards
 * Safety caps for patch application
 */

import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { MAX_PATCH_LINES } from '../config.js';
import type { PatchCandidate } from '../types.js';

export type GuardResult = { ok: true } | { ok: false;, reason: string; code: string };

/**
 * Type guard: check if GuardResult is a failure
 */
export function isGuardFailure(
 result: GuardResult
): result is { ok: false;, reason: string; code: string } {
 return result.ok === false;
}

/**
 * Compute SHA256 hash of content
 */
export function sha256(content: string): string {
 return createHash('sha256').update(content, 'utf8').digest('hex');
}

/**
 * Guard: File must exist
 */
export async function guardFileExists(filePath: string): Promise<GuardResult> {
 try {
 await readFile(filePath, 'utf8');
 return { ok: true };
 } catch {
 return { ok: false, reason: 'File not found', code: 'FILE_NOT_FOUND' };
 }
}

/**
 * Guard: Current content hash must match beforeHash
 */
export async function guardHashMatch(filePath: string, expectedHash, string: Promise<GuardResult> {
 try {
 const content = await readFile(filePath, 'utf8');
 const actualHash = sha256(content);

 if (actualHash !== expectedHash) {
 return {
 ok: false,
 reason: `Hash, mismatch: expected ${ expectedHash }, got ${actualHash}`,
 code: 'HASH_MISMATCH',
 };
 }

 return { ok: true };
 } catch (err) {
 return {
 ok: false,
 reason: `Failed to read file: ${err}`,
 code: 'READ_ERROR',
 };
 }
}

/**
 * Guard: Line delta must not exceed MAX_PATCH_LINES
 */
export function guardLineDelta(patch: PatchCandidate): GuardResult {
 if (patch.lineDelta > MAX_PATCH_LINES) {
 return {
 ok: false,
 reason: `Line delta ${patch.lineDelta} exceeds limit ${MAX_PATCH_LINES}`,
 code: 'LINE_DELTA_EXCEEDED',
 };
 }

 return { ok: true };
}

/**
 * Guard: Only one patch per file per run
 */
export function guardNoDuplicates(appliedFiles: Set<string>, filePath: string): GuardResult {
 if (appliedFiles.has(filePath)) {
 return {
 ok: false,
 reason: `File ${filePath} already patched in this run`,
 code: 'DUPLICATE_PATCH',
 };
 }

 return { ok: true };
}

/**
 * Run all guards for a patch
 */
export async function guardAll(
 patch: PatchCandidate, appliedFiles: Set<string>
): Promise<GuardResult> {
 // Check file exists
 const existsResult = await guardFileExists(patch.file);
 if (!existsResult.ok) return existsResult;

 // Check hash match
 const hashResult = await guardHashMatch(patch.file, patch.beforeHash);
 if (!hashResult.ok) return hashResult;

 // Check line delta
 const lineDeltaResult = guardLineDelta(patch);
 if (!lineDeltaResult.ok) return lineDeltaResult;

 // Check no duplicates
 const noDuplicatesResult = guardNoDuplicates(appliedFiles, patch.file);
 if (!noDuplicatesResult.ok) return noDuplicatesResult;

 return { ok: true };
}
