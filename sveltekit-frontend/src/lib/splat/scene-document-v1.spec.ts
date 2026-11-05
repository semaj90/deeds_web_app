import { describe, expect, it } from 'vitest';
import { createSceneDocumentV1 } from './scene-document-v1.js';

const sceneId = 'f3c63bb4-50c9-4b13-8d52-5b144de1ae15';
const objectId = 'ddc8f82f-8d53-4ee9-a25f-2448a9c74637';
const parentId = '29394dc3-ea18-4a61-a0e6-7197ecfe1917';
const hash = 'a'.repeat(64);

function fixture(overrides: Record<string, unknown> = {}) {
	return {
		schema: 'parent-atlas.scene-document.v1', sceneId, caseId: null, status: 'FIXTURE', revision: 1,
		parentManifestSha256: null, createdAt: '2026-11-05T00:00:00.000Z', coordinateFrame: 'GLTF_Y_UP_METERS',
		objects: [{ objectId, parentObjectId: null, name: 'Evidence box', kind: 'MESH', assetSha256: null,
			transform: { translation: [0, 0, 0], rotationXyzw: [0, 0, 0, 1], scale: [1, 1, 1] },
			geometry: { meshCount: 1, vertexCount: 24, triangleCount: 12, textureCount: 0, boneCount: 0 } }],
		animations: [], assets: [{ assetId: parentId, format: 'GLB', sha256: hash, bytes: 256, role: 'DERIVED' }],
		quality: { triangleBudget: 100_000, triangleCount: 12, textureBytes: 0, status: 'NOT_ASSESSED' },
		...overrides
	};
}

describe('scene document v1', () => {
	it('accepts a fixture manifest and freezes it as a revision snapshot', () => {
		const manifest = createSceneDocumentV1(fixture());
		expect(manifest.schema).toBe('parent-atlas.scene-document.v1');
		expect(manifest.objects[0].transform.translation).toEqual([0, 0, 0]);
		expect(Object.isFrozen(manifest)).toBe(true);
		expect(Object.isFrozen(manifest.objects[0].transform)).toBe(true);
	});

	it('rejects non-normalized rotations, unsafe scales and duplicate object identities', () => {
		const badRotation = fixture({ objects: [{ ...(fixture().objects as any[])[0], transform: { translation: [0, 0, 0], rotationXyzw: [0, 0, 0, 2], scale: [1, 1, 1] } }] });
		expect(() => createSceneDocumentV1(badRotation)).toThrow(/Quaternion must be normalized/);
		const badScale = fixture({ objects: [{ ...(fixture().objects as any[])[0], transform: { translation: [0, 0, 0], rotationXyzw: [0, 0, 0, 1], scale: [1, 0, 1] } }] });
		expect(() => createSceneDocumentV1(badScale)).toThrow();
		const duplicate = fixture({ objects: [...(fixture().objects as any[]), ...(fixture().objects as any[])] });
		expect(() => createSceneDocumentV1(duplicate)).toThrow(/Duplicate objectId/);
	});

	it('requires parent references and object asset receipts to remain explicit', () => {
		const orphan = fixture({ objects: [{ ...(fixture().objects as any[])[0], parentObjectId: parentId }] });
		expect(() => createSceneDocumentV1(orphan)).toThrow(/Parent object is not in this manifest/);
		const invalidDigest = fixture({ assets: [{ assetId: parentId, format: 'GLB', sha256: 'not-a-hash', bytes: 256, role: 'DERIVED' }] });
		expect(() => createSceneDocumentV1(invalidDigest)).toThrow();
	});
});
