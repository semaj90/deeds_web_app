import { describe, it, expect } from 'vitest';
import { JESTER_PART_BONE_GROUPS, JESTER_PART_COUNT, buildJesterPartBoneMap } from './jester-part-bone-table-v1.js';
import { CLIP_TO_ALICE_BONE, MIXAMO_TO_ALICE_BONE } from './bone-retarget-v1.js';

describe('jester part-to-bone table', () => {
	it('covers all 81 parts exactly once', () => {
		const map = buildJesterPartBoneMap();
		expect(map.size).toBe(JESTER_PART_COUNT);
		expect([...map.keys()].sort((a, b) => a - b)).toEqual(Array.from({ length: JESTER_PART_COUNT }, (_, i) => i));
	});

	it('only names J_Bip bones that the retarget tables know about', () => {
		const known = new Set<string>([...Object.values(CLIP_TO_ALICE_BONE), ...Object.values(MIXAMO_TO_ALICE_BONE)]);
		for (const g of JESTER_PART_BONE_GROUPS) expect(known.has(g.bone), g.bone).toBe(true);
	});
});
