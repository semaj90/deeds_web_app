/**
 * Phase 78: Route Health Machine
 *
 * XState v5 machine that tracks a route's health:
 * healthy → flaky → broken (and back down on recovery)
 *
 * This is the HMM-like state machine, driven by error observations.
 * One machine instance per route, stored in Actor-based context.
 */

import { assign, createMachine } from 'xstate';

// ============================================================================
// TYPES
// ============================================================================

export type RouteHealthStateType = 'healthy' | 'flaky' | 'broken';

export interface RouteHealthContext {
 routePath: string;
 file?: string;
	recentErrorCount: number;
 totalErrorCount: number;
 lastErrorAt?: number;
 lastErrorClusterId?: string;
 lastErrorMessageShort?: string;
}
| {
 type: 'ERROR_OBSERVED';
	clusterId: string;
 severity: 'warn' | 'error' | 'fatal';
 message: string;
 }
 | { type: 'RECOVERED' }
 | { type: 'RESET' }
 | { type: 'TICK';
	now: number };

// ============================================================================
// MACHINE DEFINITION
// ============================================================================
createMachine(
 {
 id: `routeHealth:${ routePath }`,
 types: {
	context: {} as RouteHealthContext,
 events: {} as RouteHealthEvent,
 },
	initial: 'healthy',
 context: {
	routePath: file, recentErrorCount,
 totalErrorCount: 0,
 },
	states: {
	healthy: {
 on: {
	ERROR_OBSERVED: {
 target: 'flaky',
 actions: 'recordError',
 },
	TICK: {
 // Decay recent errors over time (age-based recovery)
 actions: 'decayErrors',
 },
	},
	},
	flaky: {
	on: {
 ERROR_OBSERVED: [
 {
 // If 3+ recent errors or fatal, transition to broken
 guard: 'shouldBecomeBroken',
 target: 'broken',
 actions: 'recordError',
 },
	{
 // Otherwise stay flaky
 actions: 'recordError',
 }],
 RECOVERED: {
 // Manual recovery (e.g., developer fixed it)
 target: 'healthy',
 actions: 'resetErrors',
 },
	TICK: {
 // Auto-recovery if errors are old enough
 guard: 'enoughTimeHasPassed',
 target: 'healthy',
 actions: 'resetErrors',
 },
	},
	},
	broken: {
	on: {
 RECOVERED: {
 // Move back to flaky as a sign of progress
 target: 'flaky',
 actions: 'partialReset',
 },
	RESET: {
 // Explicit reset (e.g., on full deploy)
 target: 'healthy',
 actions: 'resetErrors',
 },
	TICK: {
 // No auto-recovery from broken; needs explicit action
 },
	},
	},
	},
	},
	{
 actions: {
	recordError: assign({
 recentErrorCount: ({ context }) => context.recentErrorCount + 1,
 totalErrorCount: ({ context }) => context.totalErrorCount + 1,
 lastErrorAt: () => Date.now(),
     lastErrorClusterId: (_, event) =>
 event.type === 'ERROR_OBSERVED' ? event.clusterId : undefined,
 lastErrorMessageShort: (_, event) =>
 event.type === 'ERROR_OBSERVED' ? event.message.substring(0, 100) : undefined,
 },
	resetErrors: assign({
	recentErrorCount: () => 0,
 lastErrorAt: () => undefined,
 lastErrorClusterId: () => undefined,
 lastErrorMessageShort: () => undefined,
 },
	partialReset: assign({
	recentErrorCount: ({ context }) => Math.max(0, context.recentErrorCount - 2),
 },
	decayErrors: assign({
	recentErrorCount: ({ context }) => {
 // Decay: every 5 minutes with no error, decrement count
 const now = Date.now();
 const ageMs = now - (context.lastErrorAt ?? now);
 const decaySteps = Math.floor(ageMs / (5 * 60 * 1000));
 return Math.max(0, context.recentErrorCount - decaySteps);
 },
	}),
 },
	guards: {
	shouldBecomeBroken: ({ context },
	event) => {
 if (event.type !== 'ERROR_OBSERVED') return false;
 // Become broken if: 3+ recent errors OR fatal severity
 return (
 context.recentErrorCount >= 2 || // 2 + incoming = 3
 event.severity === 'fatal'
 );
 },
	enoughTimeHasPassed: ({ context }) => {
 // Auto-recover from flaky if 1+ hour with no errors
 const now = Date.now();
 const ageMs = now - (context.lastErrorAt ?? now);
 return ageMs > 60 * 60 * 1000; // 1 hour
 },
	},
	}
 );

// ============================================================================
// HELPER: State getter
// ============================================================================

/**
 * Extract current state name from actor snapshot
 */
export function getHealthState(
 snapshot: ReturnType<ReturnType<typeof createRouteHealthMachine>['getSnapshot']>
): RouteHealthStateType {
 if (snapshot.matches('broken')) return 'broken';
 if (snapshot.matches('flaky')) return 'flaky';
 return 'healthy';
}




