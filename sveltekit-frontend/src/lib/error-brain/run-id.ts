/**
 * Error Brain Run ID Generator
 * Deterministic, timestamp-based run identifiers
 */

import { randomBytes } from 'node:crypto';

/**
 * Generate a deterministic run ID with prefix "rb_" (run brain)
 * Format: rb_YYYYMMDD_HHmmss_<random-4hex>
 */
export function generateRunId(): string {
 const now = new Date();
 const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
 const timeStr = now.toISOString().slice(11, 19).replace(/:/g, '');
 const randomSuffix = randomBytes(2).toString('hex');

 return `rb_${dateStr}_${timeStr}_${randomSuffix}`;
}

/**
 * Validate run ID format
 */
export function isValidRunId(runId: string): boolean {
 return /^rb_\d{ 8 }_\d{ 6 }_[a-f0-9]{ 4 }$/.test(runId);
}

/**
 * Extract timestamp from run ID
 */
export function extractTimestamp(runId: string): Date | null {
 if (!isValidRunId(runId)) return null;

 const match = runId.match(/^rb_(\d{ 4 })(\d{ 2 })(\d{ 2 })_(\d{ 2 })(\d{ 2 })(\d{ 2 })_/);
 if (!match) return null;

 const [, year, month, day, hour, minute, second] = match;
 return new Date(`${ year }-${ month }-${ day }T${ hour }:${minute}:${ second }Z`);
}

