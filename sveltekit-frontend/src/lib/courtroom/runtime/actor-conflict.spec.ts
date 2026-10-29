// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { EntityLocks, bindActor } from '../courtroom-actor-binding-v1';
import { createSceneAdapter, type SceneLike } from './scene-adapter';
import { ActorRegistry } from './actor-runtime';
import { sampleStory } from '../story/engine';
import type { CueOutcome } from '../cue-tracker-v1';

describe('actor binding', () => {
	it('puts the jester and alice on the same physical entity, with different looks', () => {
		const alice = bindActor({ id: 'alice', role: 'defense' });
		const jester = bindActor({ id: 'jester', role: 'jester' });
		expect(alice.entityId).toBe('defense');
		expect(jester.entityId).toBe(alice.entityId);
		expect(jester).toMatchObject({ storyRole: 'jester', sceneRole: 'defense', appearanceId: 'alice-with-jester-accessories' });
		expect(alice.appearanceId).not.toBe(jester.appearanceId);
	});
});

describe('EntityLocks', () => {
	it('lets the holder repeat itself, refuses others with a receipt, and frees on release by the holder only', () => {
		const l = new EntityLocks();
		expect(l.acquire('defense', 'jester', 'move')).toEqual({ ok: true });
		expect(l.acquire('defense', 'jester', 'move')).toEqual({ ok: true });
		const refused = l.acquire('defense', 'alice', 'move');
		expect(refused).toEqual({ ok: false, receipt: { entityId: 'defense', requester: 'alice', owner: 'jester', action: 'move', reason: 'ENTITY_HELD_BY_OTHER_ACTOR' } });
		expect(l.release('defense', 'alice')).toBe(false);
		expect(l.holder('defense')).toBe('jester');
		expect(l.release('defense', 'jester')).toBe(true);
		expect(l.acquire('defense', 'alice', 'move')).toEqual({ ok: true });
	});
});

describe('shared character in the scene adapter', () => {
	function setup() {
		const calls: string[] = [];
		let finish!: (o: CueOutcome) => void;
		const scene: SceneLike = {
			playAnimation: (role, anim) => void calls.push(`play:${role}:${anim}`),
			showCharacter: () => {},
			setPhase: () => {},
			getPosition: () => ({ x: -4, z: 1.3 }),
			moveTo: (role) => {
				calls.push(`move:${role}`);
				return new Promise<CueOutcome>((resolve) => (finish = resolve));
			},
		};
		const receipts: unknown[] = [];
		const adapter = createSceneAdapter(scene, ActorRegistry.fromStory(sampleStory), { onConflict: (r) => receipts.push(r) });
		return { adapter, calls, receipts, finish: (o: CueOutcome = 'finished') => finish(o) };
	}

	it('refuses alice\'s animation and move while the jester is walking the shared mesh, then allows them after arrival', async () => {
		const { adapter, calls, receipts, finish } = setup();
		adapter.moveActor!('jester', 'witness');
		expect(calls).toEqual(['move:defense']);

		adapter.setAnimation('alice', 'gesture'); // another actor on the same entity
		adapter.moveActor!('alice', 'judge');
		expect(calls).toEqual(['move:defense']); // neither was applied
		expect(receipts).toHaveLength(2);
		expect(receipts[0]).toMatchObject({ entityId: 'defense', requester: 'alice', owner: 'jester', action: 'animation' });
		expect(receipts[1]).toMatchObject({ requester: 'alice', action: 'move' });

		adapter.setAnimation('jester', 'speaking'); // the holder may still act
		expect(calls).toContain('play:defense:speaking');

		finish('finished');
		await new Promise((r) => setTimeout(r, 0));
		adapter.setAnimation('alice', 'idle');
		expect(calls).toContain('play:defense:idle'); // the lock is gone
		expect(receipts).toHaveLength(2);
	});

	it('releases the lock even when the walk is interrupted', async () => {
		const { adapter, calls, receipts, finish } = setup();
		adapter.moveActor!('jester', 'witness');
		finish('interrupted');
		await new Promise((r) => setTimeout(r, 0));
		adapter.moveActor!('alice', 'judge');
		expect(calls.filter((c) => c === 'move:defense')).toHaveLength(2);
		expect(receipts).toHaveLength(0);
	});
});
