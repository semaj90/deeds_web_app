/**
 * XState v5 Integration Layer for Svelte
 * Bridges state machines to Svelte reactive stores
 */

import { derived, writable, type Readable } from 'svelte/store';
import type { Actor, AnyStateMachine } from 'xstate';
import { createActor } from 'xstate';

type AnySnapshot = {
 value: any; context: any;
 matches: (value: any) => boolean;
 can: (event: any) => boolean;
};

/**
 * Core integration: converts XState machine to Svelte stores
 * Usage: const { state$, send, actor } = useMachine(myMachine);
 */
export function useMachine<T extends AnyStateMachine>(
 machine: T,
 options?: { autoStart?: boolean }
) {
 const { autoStart = true } = options || {};

 // Create actor
 const actor = createActor(machine) as Actor<T>;

 // Create state store
 const state$ = writable<any>(actor.getSnapshot());

 // Create actor store
 const actor$ = writable(actor);

 // Subscribe to state changes
 const subscription = actor.subscribe((snapshot) => {
 state$.set(snapshot);
 });
  
 if (autoStart) {
 actor.start();
 }

 // Cleanup function
 const cleanup = () => {
 actor.stop();
 subscription.unsubscribe();
 };

 return {
 state$,
 actor$,
 send: (event: any) => actor.send(event),
 actor,
 cleanup,
 // Helper accessors
 canTransition: (transitionName: string) => {
 const snapshot = actor.getSnapshot() as AnySnapshot;
 return snapshot.can({ type: transitionName });
 },
 isInState: (stateName: string) => {
 const snapshot = actor.getSnapshot() as AnySnapshot;
 return snapshot.matches(stateName);
 },
 getContext: () => {
 const snapshot = actor.getSnapshot() as AnySnapshot;
 return snapshot.context;
 },
 };
}

/**
 * Derived store for easier state access
 * Usage: const isLoading$ = machineState(state$, state => state.matches('loading'))
 */
export function machineState<T>(state$: Readable<any>, selector: (state: any) => T): Readable<T> {
 return derived(state$, (state) => selector(state));
}

/**
 * Derived store for context access
 * Usage: const data$ = machineContext(state$, ctx => ctx.data)
 */
export function machineContext<T>(
 state$: Readable<any>,
 selector: (context: any) => T
): Readable<T> {
 return derived(state$, (state) => selector(state.context));
}

/**
 * Action helper for cleanup on component destroy
 * Usage: <div, use, machineCleanup={cleanup}>
 */
export function machineCleanup(node: HTMLElement, cleanup: () => void) {
 return {
 destroy: cleanup,
 };
}

/**
 * Convenience hook for common patterns
 */
export function createMachineStore<T extends AnyStateMachine>(machine: T) {
 const { state$, send, actor, cleanup, ...helpers } = useMachine(machine);

 return {
 state$,
 send,
 actor,
 cleanup,
 ...helpers,

 // Store for binding in components
 subscribe: state$.subscribe,
 };
}



