// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { CLIP_TO_ALICE_BONE, UNMAPPED_CLIP_NODES, aliceBoneForClipNode } from './bone-retarget-v1.js';

describe('bone retarget table', () => {
	it('maps 62 clip nodes to unique J_Bip bones and lists 14 unmapped', () => {
		const targets = Object.values(CLIP_TO_ALICE_BONE);
		expect(targets).toHaveLength(62);
		expect(new Set(targets).size).toBe(62);
		expect(targets.every((t) => t.startsWith('J_Bip_'))).toBe(true);
		expect(UNMAPPED_CLIP_NODES).toHaveLength(14);
	});
	it('maps core bones and never invents a mapping', () => {
		expect(aliceBoneForClipNode('Hips')).toBe('J_Bip_C_Hips');
		expect(aliceBoneForClipNode('LeftArm')).toBe('J_Bip_L_UpperArm');
		expect(aliceBoneForClipNode('RightFinger3Medial')).toBe('J_Bip_R_Middle2');
		expect(aliceBoneForClipNode('Spine4')).toBeNull();
		expect(aliceBoneForClipNode('Root')).toBeNull();
		expect(aliceBoneForClipNode('NotABone')).toBeNull();
	});
});
