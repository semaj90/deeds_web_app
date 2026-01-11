/**
 * YoRHa Metrics State Machine (XState v5)
 * Manages the state of system metrics fetching and updates
 */

import { createMachine, assign } from 'xstate';

export interface MetricsContext {
 metrics: any | null;
 error: string | null;
 retryCount: number;
 maxRetries: number;
}

export type MetricsEvent =
 | { type: 'FETCH' }
 | { type: 'FETCH_SUCCESS'; data: any }
 | { type: 'FETCH_ERROR'; error: string }
 | { type: 'RETRY' }
 | { type: 'RESET' };

/**
 * Create metrics state machine
 */
export const createMetricsMachine = () =>
 createMachine<MetricsContext, MetricsEvent>(
 {
 id: 'metrics',
 initial: 'idle',
 context: {
 metrics: null,
 error: null,
 retryCount: 0,
 maxRetries: 3,
 },
 states: {
 idle: {
 on: {
 FETCH: 'updating',
 RESET: {
 actions: assign({
 metrics: null,
 error: null,
 retryCount: 0,
 }),
 },
 },
 },
 updating: {
 on: {
 FETCH_SUCCESS: {
 target: 'idle',
 actions: assign({
 metrics: ({ event }) => event.data,
 error: null,
 retryCount: 0,
 }),
 },
 FETCH_ERROR: {
 target: 'error',
 actions: assign({
 error: ({ event }) => event.error,
 retryCount: ({ context }) => context.retryCount + 1,
 }),
 },
 },
 },
 error: {
 on: {
 RETRY: [
 {
 target: 'updating',
 guard: ({ context }) => context.retryCount < context.maxRetries,
 },
 {
 target: 'failed',
 guard: ({ context }) => context.retryCount >= context.maxRetries,
 },
 ],
 RESET: {
 target: 'idle',
 actions: assign({
 metrics: null,
 error: null,
 retryCount: 0,
 }),
 },
 },
 },
 failed: {
 on: {
 RESET: {
 target: 'idle',
 actions: assign({
 metrics: null,
 error: null,
 retryCount: 0,
 }),
 },
 },
 },
 },
 },
 {
 guards: {
 canRetry: ({ context }) => context.retryCount < context.maxRetries,
 },
 }
 );

/**
 * Metrics machine types for TypeScript
 */
export type MetricsMachine = ReturnType<typeof createMetricsMachine>;
