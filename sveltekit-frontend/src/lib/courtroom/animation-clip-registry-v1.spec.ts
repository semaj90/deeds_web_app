import { describe, expect, it } from 'vitest';
import { createAnimationClipRegistryV1 } from './animation-clip-registry-v1.js';

const assetSha256 = `sha256:${'a'.repeat(64)}`;
const clip = (name: string, duration = 1, trackCount = 1) => ({
	name,
	duration,
	tracks: Array.from({ length: trackCount }, () => ({})),
});

describe('animation clip registry v1', () => {
	it('indexes loader clips by known action aliases and records the exact source asset', () => {
		const registry = createAnimationClipRegistryV1(assetSha256, [
			clip('Idle'), clip('Walk Cycle', 1.25), clip('Inspection'), clip('Interaction'), clip('unused pose'),
		]);

		expect(registry.assetSha256).toBe(assetSha256);
		expect(registry.actions).toEqual([
			{ action: 'idle', clipIndex: 0 }, { action: 'walk', clipIndex: 1 },
			{ action: 'inspect', clipIndex: 2 }, { action: 'interact', clipIndex: 3 },
		]);
		expect(registry.clips[4]).toMatchObject({ action: null, status: 'UNMAPPED' });
	});

	it('does not select an action when multiple valid clips match it', () => {
		const registry = createAnimationClipRegistryV1(assetSha256, [clip('Walk'), clip('Walking')]);
		expect(registry.actions).toEqual([]);
		expect(registry.clips.map(({ status }) => status)).toEqual(['AMBIGUOUS', 'AMBIGUOUS']);
	});

	it('rejects invalid assets and excludes empty or zero-duration clips', () => {
		expect(() => createAnimationClipRegistryV1('sha256:bad', [])).toThrow();
		const registry = createAnimationClipRegistryV1(assetSha256, [clip('Walk', 0), clip('Idle', 1, 0)]);
		expect(registry.actions).toEqual([]);
		expect(registry.clips.map(({ status }) => status)).toEqual(['INVALID', 'INVALID']);
	});
});
