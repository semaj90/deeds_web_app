/**
 * Metrics Store
 * Svelte store for managing metrics state with XState integration
 */

import { writable, derived } from 'svelte/store';
import { createActor } from 'xstate';
import { createMetricsMachine } from '$lib/machines/metrics';

/**
 * Create metrics actor
 */
const metricsMachine = createMetricsMachine();
const metricsActor = createActor(metricsMachine);
metricsActor.start();

/**
 * Create writable store from actor state
 */
export const metricsState = writable(metricsActor.getSnapshot());

// Subscribe to actor changes
metricsActor.subscribe((state) => {
 metricsState.set(state);
});

/**
 * Derived stores for easier access
 */
export const metrics = derived(metricsState, ($state) => $state.context.metrics);
export const metricsError = derived(metricsState, ($state) => $state.context.error);
export const isUpdating = derived(metricsState, ($state) => $state.value === 'updating');
export const isFailed = derived(metricsState, ($state) => $state.value === 'failed');

/**
 * Send events to the actor
 */
export function fetchMetrics() {
 metricsActor.send({ type: 'FETCH' });
}

export function retryMetrics() {
 metricsActor.send({ type: 'RETRY' });
}

export function resetMetrics() {
 metricsActor.send({ type: 'RESET' });
}

export function setMetricsSuccess(data: any) {
 metricsActor.send({ type: 'FETCH_SUCCESS', data });
}

export function setMetricsError(error: string) {
 metricsActor.send({ type: 'FETCH_ERROR', error });
}

/**
 * Export actor for advanced usage
 */
export { metricsActor };
