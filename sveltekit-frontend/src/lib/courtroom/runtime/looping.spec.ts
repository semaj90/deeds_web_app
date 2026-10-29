// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { COURTROOM_MOVE_SET, isLoopingAnim } from '../courtroom-move-set-v1';
import { createSceneAdapter, type SceneLike } from './scene-adapter';

describe('which animations repeat', () => {
	it('loops idle, walk and speaking; every other move-set state plays once', () => {
		for (const e of COURTROOM_MOVE_SET) expect(isLoopingAnim(e.animType), e.animType).toBe(['idle', 'walk', 'speaking'].includes(e.animType));
		expect(isLoopingAnim('walk')).toBe(true); // regression: a character walking across the room froze after one clip length
	});

	it('does not wait on a walk or speaking cue, because it never ends', () => {
		const calls: string[] = [];
		const scene: SceneLike = {
			playAnimation: (r, a) => void calls.push(`play:${r}:${a}`),
			showCharacter: () => {},
			setPhase: () => {},
			playAnimationAsync: async (r, a) => { calls.push(`async:${r}:${a}`); return 'finished'; },
		};
		const reg = { find: () => ({ id: 'p', role: 'prosecutor' }) } as never;
		const adapter = createSceneAdapter(scene, reg);
		adapter.setAnimation('p', 'walk');
		adapter.setAnimation('p', 'talk');
		adapter.setAnimation('p', 'gesture');
		expect(calls).toEqual(['play:prosecutor:walk', 'play:prosecutor:speaking', 'async:prosecutor:gesture']);
	});
});
