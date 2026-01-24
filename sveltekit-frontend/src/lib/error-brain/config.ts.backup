/**
 * Error Brain Configuration
 * Feature flags and safety limits
 */

import type { ApplyMode } from './types.js';

export const ERROR_BRAIN_ENABLED = process.env.ERROR_BRAIN_ENABLED === '1';| 'sse'
 | 'redis'
 | 'both';

export const ERROR_BRAIN_APPLY_MODE = (process.env.ERROR_BRAIN_APPLY_MODE ?? 'off') as ApplyMode;

export const MAX_PATCH_LINES = Number(process.env.ERROR_BRAIN_MAX_PATCH_LINES ?? 80);

export const MAX_PATCHES_PER_RUN = Number(process.env.ERROR_BRAIN_MAX_PATCHES_PER_RUN ?? 100);

export const CONFIDENCE_THRESHOLD_SAFE = Number(process.env.ERROR_BRAIN_CONFIDENCE_SAFE ?? 0.95);

export const CONFIDENCE_THRESHOLD_FULL = Number(process.env.ERROR_BRAIN_CONFIDENCE_FULL ?? 0.7);

export const REPORT_DIR = process.env.ERROR_BRAIN_REPORT_DIR ?? 'reports';

export const PATCH_DIR = `${REPORT_DIR}/patches`;

export const RUN_DIR = `${REPORT_DIR}/runs`;

export const INCIDENT_DIR = `${REPORT_DIR}/incidents`;process.env.BATCH_REPORT_STAMP ?? new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);


