// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createSceneAdapter, type SceneLike } from './scene-adapter';
import type { CueOutcome } from '../cue-tracker-v1';

const registry = { find: (id: string) => (id === 'p1' ? { id: 'p1', role: 'prosecutor' } : undefined) } as any;

function fakeScene(outcome: CueOutcome) {
	const calls: string[] = [];
	let release!: () => void;
	const gate = new Promise<void>((r) => (release = r));
	const scene: SceneLike = {
		playAnimation: (role, a) => void calls.push(`play:${role}:${a}`),
		showCharacter: () => {},
		setPhase: () => {},
		playAnimationAsync: async (role, a) => { calls.push(`async:${role}:${a}`); await gate; return outcome; },
	};
	return { scene, calls, release };
}

describe('scene adapter awaited clips', () => {
	it('reports completion and returns a finished one-shot clip to idle', async () => {
		const { scene, calls, release } = fakeScene('finished');
		const settled: unknown[] = [];
		createSceneAdapter(scene, registry, { onCueSettled: (w) => settled.push(w) }).setAnimation('p1', 'point');
		expect(calls).toEqual(['async:prosecutor:point']);
		release();
		await new Promise((r) => setTimeout(r, 0));
		expect(settled).toEqual([{ actorId: 'p1', clip: 'point', outcome: 'finished' }]);
		expect(calls).toEqual(['async:prosecutor:point', 'play:prosecutor:idle']);
	});

	it('does not force idle after an interrupted or unavailable clip', async () => {
		for (const outcome of ['interrupted', 'unavailable', 'timeout'] as const) {
			const { scene, calls, release } = fakeScene(outcome);
			createSceneAdapter(scene, registry).setAnimation('p1', 'gesture');
			release();
			await new Promise((r) => setTimeout(r, 0));
			expect(calls).toEqual(['async:prosecutor:gesture']);
		}
	});

	it('does not await looping clips', () => {
		const { scene, calls } = fakeScene('finished');
		createSceneAdapter(scene, registry).setAnimation('p1', 'idle');
		expect(calls).toEqual(['play:prosecutor:idle']);
	});
});
