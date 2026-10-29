import { describe, expect, it } from 'vitest';
import { deriveLevel1, moveVerified, type Level1Facts } from './demo-level1-v1';

const base: Level1Facts = { sceneReady: false, storyTick: null, cameraPreset: 'wide', camerasSeen: [], activeActor: null, move: null };

describe('level 1 progression', () => {
	it('starts with no receipts', () => {
		expect(deriveLevel1(base)).toMatchObject({ levelId: 'L1-orientation', receipts: [], complete: false });
	});

	it('earns a camera receipt only for presets the camera actually reported', () => {
		const v = deriveLevel1({ ...base, sceneReady: true, camerasSeen: ['wide', 'judge'] });
		expect(v.receipts).toEqual(['SCENE_READY', 'CAMERA_WIDE', 'CAMERA_JUDGE']);
	});

	it('verifies a move only when finished AND at the station', () => {
		const at = { actorId: 'jester', station: 'witness', outcome: 'finished' as const, position: { x: 2, z: -3 } };
		expect(moveVerified(at)).toBe(true);
		expect(moveVerified({ ...at, position: { x: -4, z: 1.3 } })).toBe(false);
		expect(moveVerified({ ...at, outcome: 'timeout' })).toBe(false);
		expect(moveVerified({ ...at, outcome: 'unavailable' })).toBe(false);
		expect(moveVerified({ ...at, position: null })).toBe(false);
		expect(moveVerified({ ...at, station: 'nowhere' })).toBe(false);
		expect(moveVerified(null)).toBe(false);
	});

	it('accepts a slot-offset arrival near the stand', () => {
		const slot = { actorId: 'jester', station: 'witness', outcome: 'finished' as const, position: { x: 1.2, z: -3 } };
		expect(moveVerified(slot)).toBe(true);
	});

	it('completes only with the scene, all three cameras and a verified move', () => {
		const facts: Level1Facts = {
			...base,
			sceneReady: true,
			camerasSeen: ['wide', 'witness', 'judge'],
			move: { actorId: 'jester', station: 'witness', outcome: 'finished', position: { x: 2, z: -3 } }
		};
		const done = deriveLevel1(facts);
		expect(done.complete).toBe(true);
		expect(done.receipts).toHaveLength(5);
		expect(deriveLevel1({ ...facts, move: { ...facts.move!, outcome: 'timeout' } }).complete).toBe(false);
	});
});
