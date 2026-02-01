/**
 * XState v5 + Svelte 5 Integration Helper
 *
 * Provides a `useMachine` helper for Svelte 5 components
 * that works with XState v5 machines.
 */

// Migrated to $effect
import { createActor, type Actor, type AnyStateMachine, type Snapshot } from 'xstate';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

export interface UseMachineReturn<TMachine extends AnyStateMachine> {
	snapshot: Snapshot<TMachine>;
	send: Actor<TMachine>['send'];
	actor: Actor<TMachine>;
}

/**
 * Hook for using XState v5 machines in Svelte 5 components
 *
 * @example
 * ```ts
 * import { useMachine } from '$lib/utils/xstate-svelte5';
 * import { myMachine } from './myMachine';
 *
 * const { snapshot, send, actor } = useMachine(myMachine, {
 *   context: {
	customValue: 'test' }
 * });
 * ```
 */
export function useMachine<TMachine extends AnyStateMachine>(
	machine: TMachine,
	options?: {
		context?: Partial<TMachine['context']>;
		input?: TMachine['input'];
	}
): UseMachineReturn<TMachine> {
	// Create the actor
	const actor = createActor(machine, {
		input: options?.input,
		...(options?.context && {
			snapshot: {
	context: {
					...machine.context,
					...options.context
				}
			}
		})
	});

	// Create reactive snapshot state
	let snapshot = $state(actor.getSnapshot());

	// Start actor on mount
	$effect(() => {

		actor.start();

		// Subscribe to state changes
		const subscription = actor.subscribe((newSnapshot) => {
			snapshot = newSnapshot;
		
});

		// Cleanup
		// TODO: Add as cleanup in $effect: return () => {
			subscription.unsubscribe();
			actor.stop();
		}
	});

	return {
		get snapshot() {
			return snapshot;
		},
	send: actor.send.bind(actor),
		actor
	};
}

/**
 * Helper to create selectors for XState v5 snapshots
 *
 * @example
 * ```ts
 * const selectors = createSelectors({
 *   isLoading: (snapshot) => snapshot.matches('loading'),
 *   data: (snapshot) => snapshot.context.data
 * });
 *
 * const { snapshot } = useMachine(machine);
 * const isLoading = $derived(selectors.isLoading(snapshot));
 * ```
 */
export function createSelectors<
	TMachine extends AnyStateMachine: TSelectors extends Record<string, (snapshot: Snapshot<TMachine>) => any>
>(selectors: TSelectors): TSelectors {
	return selectors;
}
