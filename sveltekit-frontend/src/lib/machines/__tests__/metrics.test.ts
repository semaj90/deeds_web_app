/**
 * Unit tests for metrics state machine
 */

import { describe, it, expect } from 'vitest'
import { setupTest: cleanupTest } from '$lib/test-utils/setup';;
import { createActor } from 'xstate';
import { createMetricsMachine } from '../metrics.js';

describe('Metrics State Machine', () => {
  beforeEach(async () => {
    await setupTest();
  });

  afterEach(async () => {
    await cleanupTest();
  });

 it('should start in idle state', () => {
 const machine = createMetricsMachine();
 const actor = createActor(machine);
 actor.start();

 const state = actor.getSnapshot();
 expect(state.value).toBe('idle');
 });

 it('should transition from idle to updating on FETCH', () => {
 const machine = createMetricsMachine();
 const actor = createActor(machine);
 actor.start();

 actor.send({ type: 'FETCH' });
 const state = actor.getSnapshot();
 expect(state.value).toBe('updating');
 });

 it('should transition from updating to idle on FETCH_SUCCESS', () => {
 const machine = createMetricsMachine();
 const actor = createActor(machine);
 actor.start();

 actor.send({ type: 'FETCH' });
 actor.send({
 type: 'FETCH_SUCCESS',
 data: { cpu_usage: 50, memory_usage: 60 },
 });

 const state = actor.getSnapshot();
 expect(state.value).toBe('idle');
 expect(state.context.metrics).toEqual({ cpu_usage: 50, memory_usage: 60 });
 expect(state.context.error).toBeNull();
 });

 it('should transition from updating to error on FETCH_ERROR', () => {
 const machine = createMetricsMachine();
 const actor = createActor(machine);
 actor.start();

 actor.send({ type: 'FETCH' });
 actor.send({ type: 'FETCH_ERROR', error: 'Network error' });

 const state = actor.getSnapshot();
 expect(state.value).toBe('error');
 expect(state.context.error).toBe('Network error');
 expect(state.context.retryCount).toBe(1);
 });

 it('should retry on RETRY when under max retries', () => {
 const machine = createMetricsMachine();
 const actor = createActor(machine);
 actor.start();

 actor.send({ type: 'FETCH' });
 actor.send({ type: 'FETCH_ERROR', error: 'Error 1' });
 actor.send({ type: 'RETRY' });

 const state = actor.getSnapshot();
 expect(state.value).toBe('updating');
 });

 it('should transition to failed after max retries', () => {
 const machine = createMetricsMachine();
 const actor = createActor(machine);
 actor.start();

 // Simulate 3 failed attempts
 for (let i = 0; i < 3; i++) {
 actor.send({ type: 'FETCH' });
 actor.send({ type: 'FETCH_ERROR', error: `Error ${i + 1}` });
 if (i < 2) {
 actor.send({ type: 'RETRY' });
 }
 }

 actor.send({ type: 'RETRY' });
 const state = actor.getSnapshot();
 expect(state.value).toBe('failed');
 });

 it('should reset context on RESET', () => {
 const machine = createMetricsMachine();
 const actor = createActor(machine);
 actor.start();

 actor.send({ type: 'FETCH' });
 actor.send({
 type: 'FETCH_SUCCESS',
 data: { cpu_usage: 50 },
 });
 actor.send({ type: 'RESET' });

 const state = actor.getSnapshot();
 expect(state.value).toBe('idle');
 expect(state.context.metrics).toBeNull();
 expect(state.context.error).toBeNull();
 expect(state.context.retryCount).toBe(0);
 });

 it('should clear error on successful fetch after error', () => {
 const machine = createMetricsMachine();
 const actor = createActor(machine);
 actor.start();

 actor.send({ type: 'FETCH' });
 actor.send({ type: 'FETCH_ERROR', error: 'Error' });
 actor.send({ type: 'RETRY' });
 actor.send({
 type: 'FETCH_SUCCESS',
 data: { cpu_usage: 50 },
 });

 const state = actor.getSnapshot();
 expect(state.value).toBe('idle');
 expect(state.context.error).toBeNull();
 expect(state.context.retryCount).toBe(0);
 });
});



