import { assign, createActor, setup } from 'xstate';

type SceneAssetLifecycleContextV1 = {
	generation: number;
	assetName: string | null;
	error: string | null;
};

type SceneAssetLifecycleEventV1 =
	| { type: 'LOAD'; assetName: string }
	| { type: 'READY'; generation: number }
	| { type: 'FAIL'; generation: number; error: string }
	| { type: 'CANCEL' }
	| { type: 'DISPOSE' };

export const sceneAssetLifecycleMachineV1 = setup({
	types: {
		context: {} as SceneAssetLifecycleContextV1,
		events: {} as SceneAssetLifecycleEventV1
	},
	guards: {
		isCurrentGeneration: ({ context, event }) =>
			(event.type === 'READY' || event.type === 'FAIL') && event.generation === context.generation
	},
	actions: {
		beginLoad: assign(({ context, event }) => ({
			generation: context.generation + 1,
			assetName: event.type === 'LOAD' ? event.assetName : context.assetName,
			error: null
		})),
		completeLoad: assign({ error: null }),
		failLoad: assign(({ event }) => ({ error: event.type === 'FAIL' ? event.error : 'Asset load failed.' })),
		cancelLoad: assign(({ context }) => ({ generation: context.generation + 1, error: null })),
		invalidate: assign(({ context }) => ({ generation: context.generation + 1 }))
	}
}).createMachine({
	id: 'sceneAssetLifecycleV1',
	initial: 'idle',
	context: { generation: 0, assetName: null, error: null },
	on: { DISPOSE: { target: '.disposed', actions: 'invalidate' } },
	states: {
		idle: {
			on: { LOAD: { target: 'loading', actions: 'beginLoad' } }
		},
		loading: {
			on: {
				LOAD: { target: 'loading', reenter: true, actions: 'beginLoad' },
				READY: { target: 'ready', guard: 'isCurrentGeneration', actions: 'completeLoad' },
				FAIL: { target: 'failed', guard: 'isCurrentGeneration', actions: 'failLoad' },
				CANCEL: { target: 'idle', actions: 'cancelLoad' }
			}
		},
		ready: {
			on: { LOAD: { target: 'loading', actions: 'beginLoad' } }
		},
		failed: {
			on: { LOAD: { target: 'loading', actions: 'beginLoad' } }
		},
		disposed: { type: 'final' }
	}
});

export function createSceneAssetLifecycleActorV1() {
	return createActor(sceneAssetLifecycleMachineV1);
}

export type SceneAssetLifecycleActorV1 = ReturnType<typeof createSceneAssetLifecycleActorV1>;

export function isCurrentSceneAssetLoadV1(actor: SceneAssetLifecycleActorV1, generation: number): boolean {
	const snapshot = actor.getSnapshot();
	return snapshot.matches('loading') && snapshot.context.generation === generation;
}
