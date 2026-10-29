// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { initialState, step, validateStory, type Story } from '../story/engine';
import { reconcileScene } from './actor-runtime';
import { createSceneAdapter, type SceneLike } from './scene-adapter';
import type { CueOutcome } from '../cue-tracker-v1';

const story: Story = {
	version: 1,
	id: 'move-demo',
	title: 'Move demo',
	actors: [{ id: 'w1', role: 'witness', name: 'W', asset: '/models/a.glb', clips: {}, personality: { patience: 50, honesty: 50 } }],
	cues: [
		{ id: 'm1', tick: 3, actorId: 'w1', kind: 'move', value: 'judge' },
		{ id: 'm2', tick: 9, actorId: 'w1', kind: 'move', value: 'witness' },
	],
};

describe('move cues in the story engine', () => {
	it('records where the actor is meant to be, deterministically', () => {
		expect(validateStory(story)).toBe(true);
		let s = initialState(story);
		expect(s.positions).toEqual({});
		s = step(story, s, { type: 'TICK', steps: 3 });
		expect(s.positions).toEqual({ w1: 'judge' });
		s = step(story, s, { type: 'TICK', steps: 10 });
		expect(s.positions).toEqual({ w1: 'witness' });
		expect(step(story, initialState(story), { type: 'TICK', steps: 13 })).toEqual(s);
		expect(step(story, s, { type: 'RESET' }).positions).toEqual({});
	});

	it('rejects a move cue that names no station, validates arrival gates, and tolerates old saved states', () => {
		expect(validateStory({ ...story, cues: [{ id: 'bad', tick: 1, actorId: 'w1', kind: 'move', value: 'the moon' }] })).toBe(false);
		expect(validateStory({ ...story, cues: [{ id: 'bad-gate', tick: 1, actorId: 'w1', kind: 'phase', value: 'cross', waitForArrival: { actorId: 'ghost', station: 'witness' } }] })).toBe(false);
		const old = initialState(story) as unknown as Record<string, unknown>;
		delete old.positions;
		expect(step(story, old as never, { type: 'TICK', steps: 3 }).positions).toEqual({ w1: 'judge' });
	});

	it('asks the adapter to move only when the destination changes', () => {
		const moves: string[] = [];
		const adapter = { setAnimation() {}, setEmotion() {}, setDialogue() {}, setPhase() {}, moveActor: (id: string, st: string) => void moves.push(`${id}->${st}`) };
		let prev = initialState(story);
		for (const steps of [3, 1, 5, 1]) {
			const next = step(story, prev, { type: 'TICK', steps });
			reconcileScene(prev, next, adapter);
			prev = next;
		}
		expect(moves).toEqual(['w1->judge', 'w1->witness']);
	});
});

describe('scene adapter moveActor', () => {
	const reg = { find: (id: string) => (id === 'w1' ? { id: 'w1', role: 'witness' } : id === 'j1' ? { id: 'j1', role: 'jester' } : undefined) } as never;
	function moveScene(outcome: CueOutcome = 'finished', at: { x: number; z: number } | null = { x: 2, z: -3 }) {
		const calls: Array<{ role: string; points: Array<{ x: number; y: number; z: number }> }> = [];
		const scene: SceneLike = {
			playAnimation: () => {},
			showCharacter: () => {},
			setPhase: () => {},
			getPosition: (role) => role === 'witness' ? at : null,
			moveTo: async (role, points) => {
				calls.push({ role, points });
				return outcome;
			},
		};
		return { scene, calls };
	}

	it("walks from the actor's real position to the station along a floor-plan path, carrying platform heights", async () => {
		const { scene, calls } = moveScene();
		const settled: unknown[] = [];
		createSceneAdapter(scene, reg, { onCueSettled: (w) => settled.push(w) }).moveActor!('w1', 'judge');
		expect(calls).toHaveLength(1);
		const pts = calls[0].points;
		expect(pts[0]).toMatchObject({ x: 2, z: -3, y: 1 }); // starts on the witness stand, 1.0 m up
		expect(pts[pts.length - 1]).toMatchObject({ x: 0, z: -6.5, y: 1.8 }); // ends on the bench platform, 1.8 m up
		await new Promise((r) => setTimeout(r, 0));
		expect(settled).toEqual([{ actorId: 'w1', clip: 'move:judge', outcome: 'finished' }]);
	});

	it('settles immediately when already at the station and reports unmapped movement as unavailable', () => {
		const here = moveScene('finished', { x: 2, z: -3 });
		const settled: unknown[] = [];
		createSceneAdapter(here.scene, reg, { onCueSettled: (cue) => settled.push(cue) }).moveActor!('w1', 'witness');
		expect(here.calls).toHaveLength(0);
		expect(settled).toEqual([{ actorId: 'w1', clip: 'move:witness', outcome: 'finished' }]);

		const unmapped: string[] = [];
		const unavailable: unknown[] = [];
		const hooks = { onUnmapped: (w: { reason: string }) => void unmapped.push(w.reason), onCueSettled: (cue: unknown) => unavailable.push(cue) };
		const a = moveScene();
		createSceneAdapter(a.scene, reg, hooks).moveActor!('w1', 'moon'); // not a station
		createSceneAdapter(a.scene, reg, hooks).moveActor!('ghost', 'judge'); // an actor the registry does not know
		createSceneAdapter(moveScene('finished', { x: 4, z: 0 }).scene, reg, hooks).moveActor!('w1', 'judge'); // standing inside a table
		createSceneAdapter({ playAnimation() {}, showCharacter() {}, setPhase() {} }, reg, hooks).moveActor!('w1', 'judge'); // scene cannot move
		expect(unmapped).toEqual(['unknown_station', 'unknown_actor', 'no_path', 'no_movement']);
		expect(unavailable).toHaveLength(4);
		expect(a.calls).toHaveLength(0);
	});

	it('routes a second actor to the nearest free witness-stand slot', async () => {
		const { scene, calls } = moveScene('finished', { x: 2, z: -3 });
		const unmapped: Array<{ actorId: string; reason: string; detail?: string }> = [];
		const settled: unknown[] = [];
		createSceneAdapter(scene, reg, {
			onUnmapped: (event) => unmapped.push(event),
			onCueSettled: (event) => settled.push(event),
		}).moveActor!('j1', 'witness');
		expect(calls).toHaveLength(1);
		expect(calls[0].points.at(-1)).toMatchObject({ x: 1.2, y: 1, z: -3 });
		expect(unmapped).toEqual([]);
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(settled).toEqual([{ actorId: 'j1', clip: 'move:witness', outcome: 'finished' }]);
	});

	it('refuses the move with a receipt when all witness-stand slots are occupied', () => {
		const calls: unknown[] = [];
		const positions: Record<string, { x: number; z: number }> = {
			witness: { x: 2, z: -3 },
			judge: { x: 1.2, z: -3 },
			prosecutor: { x: 2.8, z: -3 },
		};
		const scene: SceneLike = {
			playAnimation: () => {},
			showCharacter: () => {},
			setPhase: () => {},
			getPosition: (role) => positions[role] ?? null,
			moveTo: async () => { calls.push('move'); return 'finished'; },
		};
		const unmapped: Array<{ actorId: string; reason: string; detail?: string }> = [];
		const settled: unknown[] = [];
		createSceneAdapter(scene, reg, {
			onUnmapped: (event) => unmapped.push(event),
			onCueSettled: (event) => settled.push(event),
		}).moveActor!('j1', 'witness');
		expect(calls).toHaveLength(0);
		expect(unmapped).toEqual([{ actorId: 'j1', reason: 'occupied_station', detail: 'witness' }]);
		expect(settled).toEqual([{ actorId: 'j1', clip: 'move:witness', outcome: 'unavailable' }]);
	});
});
