import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
	inspectSkinnedArmatureV2,
	mountPartToSkinnedArmatureV2
} from './character-runtime-v2.js';
import { generateHaircardStripGeometryV1 } from './character-behavior-haircard-v1.js';

function createSevenBoneSkinnedActor(): THREE.Group {
	const root = new THREE.Group();
	root.name = 'parent-atlas-rigged';

	const pelvis = new THREE.Bone();
	pelvis.name = 'pelvis';
	const torso = new THREE.Bone();
	torso.name = 'torso';
	const head = new THREE.Bone();
	head.name = 'head';
	head.position.set(0, 0.55, 0);
	const armL = new THREE.Bone();
	armL.name = 'arm_L';
	const armR = new THREE.Bone();
	armR.name = 'arm_R';
	const legL = new THREE.Bone();
	legL.name = 'leg_L';
	const legR = new THREE.Bone();
	legR.name = 'leg_R';

	pelvis.add(torso, legL, legR);
	torso.add(head, armL, armR);
	root.add(pelvis);

	const geo = new THREE.BoxGeometry(0.4, 1.6, 0.2);
	const skinned = new THREE.SkinnedMesh(geo, new THREE.MeshStandardMaterial());
	const skeleton = new THREE.Skeleton([pelvis, torso, head, armL, armR, legL, legR]);
	skinned.bind(skeleton);
	root.add(skinned);
	return root;
}

describe('ThreeCharacterRuntime GPU Skinned Armature & Socket Mounting (MEM-06)', () => {
	it('inspects 7-bone GPU SkinnedMesh + Skeleton and mounts eye/hair sockets onto head bone', () => {
		const actor = createSevenBoneSkinnedActor();
		const inv = inspectSkinnedArmatureV2(actor);

		expect(inv.skinnedMeshCount).toBe(1);
		expect(inv.boneCount).toBe(7);
		expect(inv.hasSevenBoneRig).toBe(true);
		expect(inv.boneNames).toContain('head');

		const leftEye = new THREE.Mesh(new THREE.SphereGeometry(0.025));
		const rightEye = new THREE.Mesh(new THREE.SphereGeometry(0.025));
		const hairData = generateHaircardStripGeometryV1(8, 0.11);
		const hairGeo = new THREE.BufferGeometry();
		hairGeo.setAttribute('position', new THREE.BufferAttribute(hairData.positions, 3));
		hairGeo.setIndex(new THREE.BufferAttribute(hairData.indices, 1));
		const hairMesh = new THREE.Mesh(hairGeo, new THREE.MeshStandardMaterial());

		const eyeLRes = mountPartToSkinnedArmatureV2(actor, 'face.eye.left', leftEye);
		const eyeRRes = mountPartToSkinnedArmatureV2(actor, 'face.eye.right', rightEye);
		const hairRes = mountPartToSkinnedArmatureV2(actor, 'head.hair.cards_v1', hairMesh);

		const headBone = actor.getObjectByName('head')!;
		expect(eyeLRes.attachedParentName).toBe('head');
		expect(eyeRRes.attachedParentName).toBe('head');
		expect(hairRes.attachedParentName).toBe('head');
		expect(headBone.children).toContain(leftEye);
		expect(headBone.children).toContain(rightEye);
		expect(headBone.children).toContain(hairMesh);
	});
});
