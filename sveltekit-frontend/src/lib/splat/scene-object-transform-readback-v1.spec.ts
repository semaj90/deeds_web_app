import { describe, expect, it } from 'vitest';
import { applySceneObjectTransformsV1, type SceneTransformTargetV1 } from './scene-object-transform-readback-v1.js';
import type { SceneDocumentV1 } from './scene-document-v1.js';

const objectId = '11111111-1111-4111-8111-111111111111';
const secondObjectId = '22222222-2222-4222-8222-222222222222';
const objects: SceneDocumentV1['objects'] = [
	{ objectId, parentObjectId: null, name: 'Mesh A', kind: 'MESH', assetSha256: 'a'.repeat(64), transform: { translation: [1, 2, 3], rotationXyzw: [0, 0, 0, 1], scale: [1, 1, 1] }, geometry: null },
	{ objectId: secondObjectId, parentObjectId: objectId, name: 'Mesh B', kind: 'MESH', assetSha256: 'a'.repeat(64), transform: { translation: [-1, 0.5, 4], rotationXyzw: [0, 0.7071068, 0, 0.7071068], scale: [2, 1, 0.5] }, geometry: null }
];

function target(): SceneTransformTargetV1 & { readback: { position: number[]; quaternion: number[]; scale: number[] } } {
	const readback = { position: [] as number[], quaternion: [] as number[], scale: [] as number[] };
	return {
		readback,
		position: { set: (...value) => { readback.position = value; } },
		quaternion: { set: (...value) => { readback.quaternion = value; } },
		scale: { set: (...value) => { readback.scale = value; } }
	};
}

describe('scene object transform readback', () => {
	it('restores each local transform by stable object ID', () => {
		const first = target();
		const second = target();
		applySceneObjectTransformsV1(objects, new Map([[objectId, first], [secondObjectId, second]]));
		expect(first.readback).toEqual({ position: [1, 2, 3], quaternion: [0, 0, 0, 1], scale: [1, 1, 1] });
		expect(second.readback).toEqual({ position: [-1, 0.5, 4], quaternion: [0, 0.7071068, 0, 0.7071068], scale: [2, 1, 0.5] });
	});

	it('rejects a missing runtime object before mutating any matched object', () => {
		const first = target();
		expect(() => applySceneObjectTransformsV1(objects, new Map([[objectId, first]]))).toThrow(`SCENE_OBJECT_READBACK_MISSING:${secondObjectId}`);
		expect(first.readback).toEqual({ position: [], quaternion: [], scale: [] });
	});
});
