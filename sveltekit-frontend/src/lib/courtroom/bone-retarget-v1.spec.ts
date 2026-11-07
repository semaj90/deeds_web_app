// @vitest-environment node
import { describe, it, expect } from 'vitest';
import {
	CLIP_TO_ALICE_BONE,
	UNMAPPED_CLIP_NODES,
	aliceBoneForClipNode,
	VRM_HUMANOID_BONES,
	VRM_TO_ALICE_BONE,
	ALICE_TO_VRM_BONE,
	resolveCanonicalBone,
	resolveAliceBone,
	resolveBoneWithFallback
} from './bone-retarget-v1.js';

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

	it('validates canonical VRM 1.0 humanoid semantic bone maps and bijections', () => {
		expect(VRM_HUMANOID_BONES.length).toBe(25);
		expect(Object.keys(VRM_TO_ALICE_BONE).length).toBe(25);
		expect(Object.keys(ALICE_TO_VRM_BONE).length).toBe(25);

		// Bijection verification: VRM -> Alice -> VRM
		for (const bone of VRM_HUMANOID_BONES) {
			const alice = VRM_TO_ALICE_BONE[bone];
			expect(alice).toBeDefined();
			expect(ALICE_TO_VRM_BONE[alice]).toBe(bone);
		}
	});

	it('resolves canonical VRM semantic bones from any source convention', () => {
		// Canonical VRM names
		expect(resolveCanonicalBone('hips')).toBe('hips');
		expect(resolveCanonicalBone('head')).toBe('head');
		expect(resolveCanonicalBone('leftUpperArm')).toBe('leftUpperArm');

		// Alice J_Bip_* names
		expect(resolveCanonicalBone('J_Bip_C_Hips')).toBe('hips');
		expect(resolveCanonicalBone('J_Bip_L_UpperArm')).toBe('leftUpperArm');
		expect(resolveCanonicalBone('J_Bip_R_Hand')).toBe('rightHand');

		// Mixamo names
		expect(resolveCanonicalBone('mixamorig:Hips')).toBe('hips');
		expect(resolveCanonicalBone('mixamorig:LeftArm')).toBe('leftUpperArm');
		expect(resolveCanonicalBone('mixamorig:RightHand')).toBe('rightHand');

		// Mocap clip names
		expect(resolveCanonicalBone('Hips')).toBe('hips');
		expect(resolveCanonicalBone('LeftArm')).toBe('leftUpperArm');
		expect(resolveCanonicalBone('Spine2')).toBe('chest');

		// Non-bones return null
		expect(resolveCanonicalBone('UnknownBone')).toBeNull();
		expect(resolveCanonicalBone('mixamorig:HeadTop_End')).toBeNull();
	});

	it('resolves Alice J_Bip_* bones from any source convention', () => {
		expect(resolveAliceBone('head')).toBe('J_Bip_C_Head');
		expect(resolveAliceBone('mixamorig:Head')).toBe('J_Bip_C_Head');
		expect(resolveAliceBone('Head')).toBe('J_Bip_C_Head');
		expect(resolveAliceBone('J_Bip_C_Head')).toBe('J_Bip_C_Head');
	});

	it('gracefully applies fallbacks for armatures missing optional bones', () => {
		// Armature lacking upperChest, having only chest and spine
		const simpleArmature = ['J_Bip_C_Hips', 'J_Bip_C_Spine', 'J_Bip_C_Chest', 'J_Bip_C_Head'];
		expect(resolveBoneWithFallback('upperChest', simpleArmature)).toBe('J_Bip_C_Chest');

		// Armature lacking chest and upperChest, having only spine
		const basicArmature = ['J_Bip_C_Hips', 'J_Bip_C_Spine', 'J_Bip_C_Head'];
		expect(resolveBoneWithFallback('upperChest', basicArmature)).toBe('J_Bip_C_Spine');
		expect(resolveBoneWithFallback('chest', basicArmature)).toBe('J_Bip_C_Spine');

		// Armature lacking leftShoulder, falling back to leftUpperArm
		const shoulderlessArmature = ['J_Bip_L_UpperArm', 'J_Bip_L_LowerArm'];
		expect(resolveBoneWithFallback('leftShoulder', shoulderlessArmature)).toBe('J_Bip_L_UpperArm');

		// Existing exact bone is always preserved
		expect(resolveBoneWithFallback('J_Bip_C_Spine', simpleArmature)).toBe('J_Bip_C_Spine');
		expect(resolveBoneWithFallback('non_existent', simpleArmature)).toBeNull();
	});
});
