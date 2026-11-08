import { describe, expect, it } from 'vitest';
import { createSceneAssetLifecycleActorV1, isCurrentSceneAssetLoadV1 } from './scene-asset-lifecycle-v1.js';

describe('scene-asset-lifecycle-v1', () => {
	it('ignores a stale parse result after cancel and permits a fresh load', () => {
		const actor = createSceneAssetLifecycleActorV1().start();
		actor.send({ type: 'LOAD', assetName: 'slow.glb' });
		const staleGeneration = actor.getSnapshot().context.generation;
		expect(isCurrentSceneAssetLoadV1(actor, staleGeneration)).toBe(true);

		actor.send({ type: 'CANCEL' });
		expect(actor.getSnapshot().value).toBe('idle');
		expect(isCurrentSceneAssetLoadV1(actor, staleGeneration)).toBe(false);
		actor.send({ type: 'READY', generation: staleGeneration });
		expect(actor.getSnapshot().value).toBe('idle');

		actor.send({ type: 'LOAD', assetName: 'next.glb' });
		const nextGeneration = actor.getSnapshot().context.generation;
		actor.send({ type: 'READY', generation: nextGeneration });
		expect(actor.getSnapshot().value).toBe('ready');
		actor.stop();
	});

	it('retains a failed state until retry, then rejects the previous generation', () => {
		const actor = createSceneAssetLifecycleActorV1().start();
		actor.send({ type: 'LOAD', assetName: 'bad.glb' });
		const failedGeneration = actor.getSnapshot().context.generation;
		actor.send({ type: 'FAIL', generation: failedGeneration, error: 'invalid GLB' });
		expect(actor.getSnapshot().value).toBe('failed');
		expect(actor.getSnapshot().context.error).toBe('invalid GLB');

		actor.send({ type: 'LOAD', assetName: 'fixed.glb' });
		const retryGeneration = actor.getSnapshot().context.generation;
		actor.send({ type: 'FAIL', generation: failedGeneration, error: 'late stale failure' });
		expect(isCurrentSceneAssetLoadV1(actor, retryGeneration)).toBe(true);
		actor.send({ type: 'READY', generation: retryGeneration });
		expect(actor.getSnapshot().value).toBe('ready');
		actor.stop();
	});

	it('invalidates pending work on disposal', () => {
		const actor = createSceneAssetLifecycleActorV1().start();
		actor.send({ type: 'LOAD', assetName: 'pending.glb' });
		const generation = actor.getSnapshot().context.generation;
		actor.send({ type: 'DISPOSE' });
		expect(actor.getSnapshot().value).toBe('disposed');
		expect(isCurrentSceneAssetLoadV1(actor, generation)).toBe(false);
		actor.stop();
	});
});
