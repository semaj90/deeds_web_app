import { describe, expect, it } from 'vitest';
import { createSceneDocumentV1, createSceneQualityReceiptV1, DERIVED_SCENE_ASSET_BYTE_BUDGET } from './scene-document-v1.js';

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
		animations: [], evidenceBindings: [], assets: [{ assetId: parentId, format: 'GLB', sha256: hash, bytes: 256, role: 'DERIVED' }],
		quality: createSceneQualityReceiptV1({ derivedAssetBytes: 256, triangleCount: 12, textureBytes: 0 }),
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

	it('rejects self-parenting and cyclic object hierarchies', () => {
		const childId = 'eaef13bb-3054-4f9a-9d85-2882bfa81217';
		const root = (fixture().objects as any[])[0];
		const selfParent = fixture({ objects: [{ ...root, parentObjectId: objectId }] });
		expect(() => createSceneDocumentV1(selfParent)).toThrow(/parent hierarchy contains a cycle/);
		const twoNodeCycle = fixture({ objects: [
			{ ...root, parentObjectId: childId },
			{ ...root, objectId: childId, parentObjectId: objectId }
		] });
		expect(() => createSceneDocumentV1(twoNodeCycle)).toThrow(/parent hierarchy contains a cycle/);
	});

	it('keeps selected exhibit identities revision-qualified and unique', () => {
		const binding = { evidenceId: objectId, sourceRevision: `sha256:${hash}` };
		const manifest = createSceneDocumentV1(fixture({ caseId: sceneId, status: 'HYPOTHESIS', evidenceBindings: [binding] }));
		expect(manifest.evidenceBindings).toEqual([binding]);
		expect(() => createSceneDocumentV1(fixture({ caseId: sceneId, status: 'HYPOTHESIS', evidenceBindings: [binding, binding] }))).toThrow(/Duplicate evidence binding/);
	});

	it('keeps the new optional binding field absent when reading earlier v1 manifests', () => {
		const earlierManifest = fixture();
		delete (earlierManifest as Record<string, unknown>).evidenceBindings;
		expect(createSceneDocumentV1(earlierManifest)).not.toHaveProperty('evidenceBindings');
	});

	it('requires streamed LOD chunks to retain parent hash and producer lineage', () => {
		const sourceHash = 'b'.repeat(64);
		const source = { evidenceId: objectId, sourceRevision: `sha256:${sourceHash}`, format: 'SPZ', coordinateSystem: 'RUB', decoderRevision: 'spz-v4-decoder-core-v1', representationRevision: 'three-gaussian-splat-v1' };
		const lod = { assetId: parentId, format: 'SOG', sha256: 'c'.repeat(64), bytes: 128, role: 'LOD', derivation: { parentAssetSha256: sourceHash, producer: '@playcanvas/splat-transform', producerVersion: '3.10.3', lodLevel: 2, chunkId: 'chunk-002' } };
		const valid = fixture({
			assets: [lod], evidenceSources: [source],
			quality: createSceneQualityReceiptV1({ derivedAssetBytes: 128, triangleCount: 12 })
		});
		expect(createSceneDocumentV1(valid).assets[0].derivation?.parentAssetSha256).toBe(sourceHash);
		expect(() => createSceneDocumentV1(fixture({
			assets: [{ ...lod, derivation: undefined }], evidenceSources: [source],
			quality: createSceneQualityReceiptV1({ derivedAssetBytes: 128, triangleCount: 12 })
		}))).toThrow(/LOD asset requires source hash and producer lineage/);
		expect(() => createSceneDocumentV1(fixture({
			assets: [{ ...lod, derivation: { ...lod.derivation, parentAssetSha256: 'd'.repeat(64) } }], evidenceSources: [source],
			quality: createSceneQualityReceiptV1({ derivedAssetBytes: 128, triangleCount: 12 })
		}))).toThrow(/LOD parent hash must match/);
	});

	it('validates a mesh-surface marker against a revision-qualified exhibit and static triangle', () => {
		const binding = { evidenceId: objectId, sourceRevision: `sha256:${hash}` };
		const marker = {
			markerId: parentId, evidenceId: objectId, sourceRevision: binding.sourceRevision,
			meshObjectId: objectId, meshAssetSha256: hash, triangleIndex: 11, barycentric: [0.2, 0.3, 0.5], label: 'Trace mark'
		};
		const objects = (fixture().objects as any[]).map((object) => ({ ...object, assetSha256: hash }));
		const document = createSceneDocumentV1(fixture({ caseId: sceneId, status: 'HYPOTHESIS', objects, evidenceBindings: [binding], surfaceMarkers: [marker] }));
		expect(document.surfaceMarkers?.[0]).toEqual(marker);
	});

	it('rejects surface markers with invalid barycentric weights, stale source, or out-of-range triangle', () => {
		const binding = { evidenceId: objectId, sourceRevision: `sha256:${hash}` };
		const base = { markerId: parentId, evidenceId: objectId, sourceRevision: binding.sourceRevision, meshObjectId: objectId, meshAssetSha256: hash, triangleIndex: 0, barycentric: [0.2, 0.3, 0.5], label: 'Trace mark' };
		const manifest = (surfaceMarker: unknown) => fixture({ caseId: sceneId, status: 'HYPOTHESIS', evidenceBindings: [binding], surfaceMarkers: [surfaceMarker] });
		expect(() => createSceneDocumentV1(manifest({ ...base, barycentric: [0.2, 0.3, 0.6] }))).toThrow(/Barycentric weights/);
		expect(() => createSceneDocumentV1(manifest({ ...base, sourceRevision: `sha256:${'b'.repeat(64)}` }))).toThrow(/evidence source revision/);
		expect(() => createSceneDocumentV1(manifest({ ...base, triangleIndex: 12 }))).toThrow(/triangle in a manifest mesh/);
	});

	it('rejects a marker whose mesh asset hash differs from the target object revision', () => {
		const binding = { evidenceId: objectId, sourceRevision: `sha256:${hash}` };
		const marker = { markerId: parentId, evidenceId: objectId, sourceRevision: binding.sourceRevision, meshObjectId: objectId, meshAssetSha256: 'b'.repeat(64), triangleIndex: 0, barycentric: [0.2, 0.3, 0.5], label: 'Trace mark' };
		expect(() => createSceneDocumentV1(fixture({ caseId: sceneId, status: 'HYPOTHESIS', evidenceBindings: [binding], surfaceMarkers: [marker] }))).toThrow(/match its target mesh object/);
	});

	it('does not treat a skinned triangle as a stable mesh-surface anchor', () => {
		const binding = { evidenceId: objectId, sourceRevision: `sha256:${hash}` };
		const mesh = { ...(fixture().objects as any[])[0], geometry: { meshCount: 1, vertexCount: 24, triangleCount: 12, textureCount: 0, boneCount: 1 } };
		const marker = { markerId: parentId, evidenceId: objectId, sourceRevision: binding.sourceRevision, meshObjectId: objectId, meshAssetSha256: hash, triangleIndex: 0, barycentric: [0.2, 0.3, 0.5], label: 'Trace mark' };
		expect(() => createSceneDocumentV1(fixture({ caseId: sceneId, status: 'HYPOTHESIS', objects: [mesh], evidenceBindings: [binding], surfaceMarkers: [marker] }))).toThrow(/Skinned geometry/);
	});

	it('records the measured derived-asset byte budget without claiming visual quality', () => {
		const withinBudget = createSceneDocumentV1(fixture({
			assets: [{ assetId: parentId, format: 'GLB', sha256: hash, bytes: DERIVED_SCENE_ASSET_BYTE_BUDGET, role: 'DERIVED' }],
			quality: createSceneQualityReceiptV1({ derivedAssetBytes: DERIVED_SCENE_ASSET_BYTE_BUDGET, triangleCount: 12 })
		}));
		expect(withinBudget.quality.derivedAssetByteStatus).toBe('WITHIN_BUDGET');
		expect(withinBudget.quality.status).toBe('NOT_ASSESSED');

		const overBudget = DERIVED_SCENE_ASSET_BYTE_BUDGET + 1;
		const receipt = createSceneDocumentV1(fixture({
			assets: [{ assetId: parentId, format: 'GLB', sha256: hash, bytes: overBudget, role: 'DERIVED' }],
			quality: createSceneQualityReceiptV1({ derivedAssetBytes: overBudget, triangleCount: 12 })
		}));
		expect(receipt.quality.derivedAssetByteStatus).toBe('BUDGET_NOT_MET');
		expect(() => createSceneDocumentV1(fixture({ quality: createSceneQualityReceiptV1({ derivedAssetBytes: 255, triangleCount: 12 }) }))).toThrow(/byte receipt must equal/);
	});
});
