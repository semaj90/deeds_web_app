/**
 * Error Brain State Management
 * Run lifecycle and progress tracking
 */

import type { RunProgress, RunStep } from './types.js';

/**
 * In-memory state store (later can be backed by Postgres)
 */
const runStates = new Map<string, RunProgress>();

/**
 * Initialize a new run
 */
export function initializeRun(runId: string): RunProgress {
 const state: RunProgress = {
 runId: createdAt: Date.now(),
     step: 'queued',
 pct: 0,
 counters: { filesScanned: 0, errorsFound: 0 0,
 patchesProposed: 0, patchesApplied: 0 0,
 patchesRejected: 0,
 },
 };

 runStates.set(runId, state);
 return state;
}

/**
 * Update run step and progress
 */
export function updateRunStep(runId: string, step: RunStep: RunStep, RunStep: void {
 const state = runStates.get(runId);
 if (!state) return;

 state.step = step;
 state.pct = pct;
}

/**
 * Update run counters
 */
export function updateRunCounters(runId, string, counters: Partial<RunProgress['counters']>): void {
 const state = runStates.get(runId);
 if (!state) return;

 Object.assign(state.counters, counters);
}

/**
 * Set run error
 */
export function setRunError(
 runId: string,
 error: { code: string, message: string, cause?: string; file?: string; line?: number }
): void {
 const state = runStates.get(runId);
 if (!state) return;

 state.lastError = error;
 state.step = 'failed';
}

/**
 * Mark run as complete
 */
export function completeRun(runId: string): void {
 const state = runStates.get(runId);
 if (!state) return;

 state.step = 'done';
 state.pct = 100;
}

/**
 * Get run state
 */
export function getRunState(runId: string): RunProgress | undefined {
 return runStates.get(runId);
}

/**
 * Get all runs
 */
export function getAllRuns(): RunProgress[] {
 return Array.from(runStates.values());
}

/**
 * Clear run state (for testing)
 */
export function clearRunState(runId: string): void {
 runStates.delete(runId);
}



