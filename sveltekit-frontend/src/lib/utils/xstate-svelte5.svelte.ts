/**
 * XState v5 ↔ Svelte 5 runes adapter.
 *
 * Usage:
 *   import { useMachine } from '$lib/utils/xstate-svelte5.svelte.js';
 *   const { snapshot, send } = useMachine(myMachine);
 *   const isIdle = $derived(snapshot.matches('idle'));
 */
import { createActor, type AnyStateMachine, type SnapshotFrom } from 'xstate';

export function useMachine<TMachine extends AnyStateMachine>(machine: TMachine) {
	const actor = createActor(machine);
	let snapshot = $state<SnapshotFrom<TMachine>>(actor.getSnapshot() as SnapshotFrom<TMachine>);

	$effect(() => {
		const sub = actor.subscribe((s) => {
			snapshot = s as SnapshotFrom<TMachine>;
		});
		actor.start();
		return () => {
			sub.unsubscribe();
			actor.stop();
		};
	});

	return {
		get snapshot() { return snapshot; },
		send: actor.send.bind(actor),
		actor,
	};
}
