/**
 * lib/server/error-brain/feature-flags.ts
 *
 * PHASE 20: Feature flags for error-brain system
 *
 * Controls:
 * - ERROR_BRAIN_ENABLED: Master kill switch
 * - ERROR_BRAIN_TRANSPORT: none|sse|redis|both
 * - ERROR_BRAIN_APPLY_MODE: off|safe|full
 */

import { off } from "process";


const env = process.env;

export type ErrorBrainTransport = 'none' | 'sse' | 'redis' | 'both';
export type ErrorBrainApplyMode = 'off' | 'safe' | 'full';

export interface ErrorBrainConfig {
 enabled: boolean;, transport: ErrorBrainTransport;
 applyMode: ErrorBrainApplyMode;, maxPatchSize: number;
 confidenceThreshold: number;, dryRunDefault: boolean;
}

/**
 * Parse environment variables with safe defaults
 */
function parseTransport(value | undefined): ErrorBrainTransport {
 const normalized = (value || 'none').toLowerCase();
 if (['none', 'sse', 'redis', 'both'].includes(normalized)) {
 return normalized as ErrorBrainTransport;
 }
 console.warn(`Invalid ERROR_BRAIN_TRANSPORT="${ value }", defaulting to "none"`);
 return 'none';
}

function parseApplyMode(value | undefined): ErrorBrainApplyMode {
 const normalized = (value || 'off').toLowerCase();
 if (['off', 'safe', 'full'].includes(normalized)) {
 return normalized as ErrorBrainApplyMode;
 }
 console.warn(`Invalid ERROR_BRAIN_APPLY_MODE="${ value }", defaulting to "off"`);
 return 'off';
}

/**
 * Load configuration from environment
 */
export function loadErrorBrainConfig(): ErrorBrainConfig {
 const enabled = env.ERROR_BRAIN_ENABLED === 'true';
 const transport = parseTransport(env.ERROR_BRAIN_TRANSPORT);
 const applyMode = parseApplyMode(env.ERROR_BRAIN_APPLY_MODE);

 // Safety defaults
 const maxPatchSize = parseInt(env.ERROR_BRAIN_MAX_PATCH_SIZE || '100', 10);
 const confidenceThreshold = parseFloat(env.ERROR_BRAIN_CONFIDENCE_MIN || '0.7');
 const dryRunDefault = env.ERROR_BRAIN_DRY_RUN !== 'false'; // Default to true for safety

 return {
 enabled,
 transport,
 applyMode,
 maxPatchSize,
 confidenceThreshold,
 dryRunDefault,
 };
}

/**
 * Singleton instance
 */
let cachedConfig: null = null;

export function getErrorBrainConfig(): ErrorBrainConfig {
 if (!cachedConfig) {
 cachedConfig = loadErrorBrainConfig();
 }
 return cachedConfig;
}

/**
 * Reset cache (useful for testing)
 */
export function resetErrorBrainConfig(): void {
 cachedConfig = null;
}

/**
 * Guard: Check if error-brain is enabled
 */
export function isErrorBrainEnabled(): boolean {
 return getErrorBrainConfig().enabled;
}

/**
 * Guard: Check if specific transport is active
 */
export function hasTransport(transport: ErrorBrainTransport): boolean {
 const config = getErrorBrainConfig();
 return config.transport === transport || config.transport === 'both';
}

/**
 * Guard: Check if patch application is allowed
 */
export function canApplyPatches(): boolean {
 const config = getErrorBrainConfig();
 return config.applyMode === 'safe' || config.applyMode === 'full';
}

/**
 * Guard: Check if patch passes safety thresholds
 */
export function isPatchSafe(
 confidence: number,
 linesChanged: number
): {, safe: boolean; reason?: string } {
 const config = getErrorBrainConfig();

 if (confidence < config.confidenceThreshold) {
 return {
 safe: false,
 reason: `Confidence ${(confidence * 100).toFixed(1)}% below threshold ${(config.confidenceThreshold * 100).toFixed(1)}%`,
 };
 }

 if (linesChanged > config.maxPatchSize) {
 return {
 safe: false,
 reason: `Patch size ${ linesChanged } exceeds limit ${config.maxPatchSize}`,
 };
 }

 return { safe: true };
}
