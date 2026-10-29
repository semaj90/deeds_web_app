// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { composeYaw } from '../walk-path-v1';
import { rotateVec } from '../idle-pose-v1';
import { initialState, sampleStory, step, validateStory } from '../story/engine';

const forward = (q: [number, number, number, number]) => rotateVec(q, [0, 0, 1]);
const close = (a: readonly number[], b: readonly number[]) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i], 6));

describe('composeYaw keeps the imported root rotation', () => {
	it('is the base rotation at heading 0 and a plain yaw for an identity base', () => {
		close(composeYaw(0, [0, 1, 0, 0]), [0, 1, 0, 0]);
		close(forward(composeYaw(Math.PI / 2)), [1, 0, 0]); // heading +90 degrees turns +Z toward +X
		close(forward(composeYaw(Math.PI)), [0, 0, -1]);
	});

	it('turns an already-turned root by the heading on top of it, not instead of it', () => {
		const handednessTurn: [number, number, number, number] = [0, 1, 0, 0]; // the 180 degrees about Y the glTF loader adds
		// The base alone points +Z to -Z; a heading of 180 degrees then brings it back, which replacing the base would not.
		close(forward(handednessTurn), [0, 0, -1]);
		close(forward(composeYaw(Math.PI, handednessTurn)), [0, 0, 1]);
		close(forward(composeYaw(Math.PI / 2, handednessTurn)), [-1, 0, 0]);
	});

	it('stays unit length and ignores non-finite headings', () => {
		const q = composeYaw(1.234, [0.1, 0.9, 0.2, 0.3].map((v, _, a) => v / Math.hypot(...a)) as [number, number, number, number]);
		expect(Math.hypot(...q)).toBeCloseTo(1, 6);
		close(composeYaw(NaN, [0, 1, 0, 0]), [0, 1, 0, 0]);
	});
});

describe('sample story move beat', () => {
	it('is valid and sends the jester to the witness stand at tick 200, after the opening beats', () => {
		expect(validateStory(sampleStory)).toBe(true);
		expect(step(sampleStory, initialState(sampleStory), { type: 'TICK', steps: 199 }).positions).toEqual({});
		expect(step(sampleStory, initialState(sampleStory), { type: 'TICK', steps: 200 }).positions).toEqual({ jester: 'witness' });
	});
});
