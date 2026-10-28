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

	it('maps Mixamo-named bones to the same alice bones, with unique targets and no tip bones', async () => {
		const { MIXAMO_TO_ALICE_BONE, aliceBoneForAnyClipNode } = await import('./bone-retarget-v1.js');
		const targets = Object.values(MIXAMO_TO_ALICE_BONE);
		expect(targets).toHaveLength(6 + 2 * (8 + 15));
		expect(new Set(targets).size).toBe(targets.length);
		expect(aliceBoneForAnyClipNode('mixamorig:Hips')).toBe('J_Bip_C_Hips');
		expect(aliceBoneForAnyClipNode('mixamorig:LeftArm')).toBe('J_Bip_L_UpperArm');
		expect(aliceBoneForAnyClipNode('mixamorig:RightHandPinky2')).toBe('J_Bip_R_Little2');
		expect(aliceBoneForAnyClipNode('mixamorig:LeftHandIndex4')).toBeNull();
		expect(aliceBoneForAnyClipNode('mixamorig:HeadTop_End')).toBeNull();
		expect(aliceBoneForAnyClipNode('LeftArm')).toBe('J_Bip_L_UpperArm'); // plain names still work
	});
});
