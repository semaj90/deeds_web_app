import { describe, expect, it } from 'vitest';
import { calibrationForEvidenceV1, createSceneCalibrationV1, createSceneDocumentV1, createSceneQualityReceiptV1, DERIVED_SCENE_ASSET_BYTE_BUDGET } from './scene-document-v1.js';
import type { CalibrationAnchor } from './calibration.js';

const sceneId = 'f3c63bb4-50c9-4b13-8d52-5b144de1ae15';
const objectId = 'ddc8f82f-8d53-4ee9-a25f-2448a9c74637';
const parentId = '29394dc3-ea18-4a61-a0e6-7197ecfe1917';
const localSourceId = '3217dcf2-5900-46a3-9ac3-2e3bcf263a2f';
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

	it('keeps scene classification distinct from lifecycle status and blocks unsupported measured claims', () => {
		expect(createSceneDocumentV1(fixture({ sceneClassification: 'SYNTHETIC_FIXTURE' })).sceneClassification).toBe('SYNTHETIC_FIXTURE');
		expect(() => createSceneDocumentV1(fixture({ sceneClassification: 'SINGLE_IMAGE_HYPOTHESIS' }))).toThrow(/requires HYPOTHESIS lifecycle status/);
		expect(() => createSceneDocumentV1(fixture({ status: 'MEASURED', sceneClassification: 'MEASURED_MULTI_IMAGE' }))).toThrow(/at least two distinct evidence sources/);
		const measured = createSceneDocumentV1(fixture({
			caseId: sceneId,
			status: 'MEASURED',
			sceneClassification: 'MEASURED_MULTI_IMAGE',
			evidenceBindings: [
				{ evidenceId: objectId, sourceRevision: `sha256:${'b'.repeat(64)}` },
				{ evidenceId: localSourceId, sourceRevision: `sha256:${'c'.repeat(64)}` }
			]
		}));
		expect(measured.sceneClassification).toBe('MEASURED_MULTI_IMAGE');
	});

	it('preserves OBJ and FBX as local fixture source formats with GLB derived output', () => {
		for (const format of ['OBJ', 'FBX'] as const) {
			const manifest = createSceneDocumentV1(fixture({ assets: [
				{ assetId: localSourceId, format, sha256: hash, bytes: 128, role: 'SOURCE' },
				{ assetId: parentId, format: 'GLB', sha256: 'b'.repeat(64), bytes: 256, role: 'DERIVED' }
			] }));
			expect(manifest.assets.map((asset) => asset.format)).toEqual([format, 'GLB']);
		}
	});

	it('preserves original image format beside a single-image hypothesis GLB', () => {
		for (const format of ['IMAGE_JPEG', 'IMAGE_PNG', 'IMAGE_GIF', 'IMAGE_WEBP'] as const) {
			const manifest = createSceneDocumentV1(fixture({
				status: 'HYPOTHESIS',
				sceneClassification: 'SINGLE_IMAGE_HYPOTHESIS',
				assets: [
					{ assetId: localSourceId, format, sha256: hash, bytes: 128, role: 'SOURCE' },
					{ assetId: parentId, format: 'GLB', sha256: 'b'.repeat(64), bytes: 256, role: 'DERIVED' }
				]
			}));
			expect(manifest.assets.map((asset) => asset.format)).toEqual([format, 'GLB']);
			expect(manifest.sceneClassification).toBe('SINGLE_IMAGE_HYPOTHESIS');
		}
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

	it('stores recomputable SPZ-to-local-meter calibration bound to an admitted source hash', () => {
		const points: Array<[number, number, number]> = [[0.1, 0, 0.2], [1.3, 0.4, -0.5], [-0.7, 0.9, 1.1]];
		const anchors: CalibrationAnchor[] = points.map((splat, index) => {
			const c = Math.cos(0.7);
			const s = Math.sin(0.7);
			return { id: `survey-${index}`, splat, worldM: [2.5 * (c * splat[0] + s * splat[2]) + 4, 2.5 * splat[1] + 1, 2.5 * (-s * splat[0] + c * splat[2]) - 3] };
		});
		const calibration = createSceneCalibrationV1({ sourceSha256: hash, anchors, toleranceM: 0.02 });
		const source = { evidenceId: objectId, sourceRevision: `sha256:${hash}`, format: 'SPZ', coordinateSystem: 'RUB', decoderRevision: 'spz-v4-decoder-core-v1', representationRevision: 'three-gaussian-splat-v1' };
		const document = createSceneDocumentV1(fixture({ coordinateFrame: 'GLTF_Y_UP_METERS', evidenceSources: [source], calibration }));
		expect(document.calibration?.targetCoordinateSystem).toBe('GLTF_Y_UP_METERS');
		expect(document.calibration?.transform.scale).toBeCloseTo(2.5, 8);
		expect(calibrationForEvidenceV1(document, objectId, source.sourceRevision)).toEqual(calibration);
		expect(calibrationForEvidenceV1(document, objectId, `sha256:${'b'.repeat(64)}`)).toBeNull();
		expect(calibrationForEvidenceV1(document, parentId, source.sourceRevision)).toBeNull();
		expect(() => createSceneDocumentV1(fixture({ coordinateFrame: 'GLTF_Y_UP_METERS', calibration }))).toThrow(/SPZ evidence source revision/);
	});

	it('rejects calibration without three anchors, with a mismatched source, or tampered transform', () => {
		const anchors: CalibrationAnchor[] = [
			{ id: 'a', splat: [0, 0, 0], worldM: [4, 1, -3] },
			{ id: 'b', splat: [1, 0, 0], worldM: [4 + 2.5 * Math.cos(0.7), 1, -3 - 2.5 * Math.sin(0.7)] },
			{ id: 'c', splat: [0, 1, 0], worldM: [4, 3.5, -3] }
		];
		const source = { evidenceId: objectId, sourceRevision: `sha256:${hash}`, format: 'SPZ', coordinateSystem: 'RUB', decoderRevision: 'spz-v4-decoder-core-v1', representationRevision: 'three-gaussian-splat-v1' };
		const calibration = createSceneCalibrationV1({ sourceSha256: hash, anchors, toleranceM: 0.02 });
		expect(() => createSceneCalibrationV1({ sourceSha256: hash, anchors: anchors.slice(0, 2), toleranceM: 0.02 })).toThrow();
		expect(() => createSceneDocumentV1(fixture({ coordinateFrame: 'GLTF_Y_UP_METERS', evidenceSources: [source], calibration: { ...calibration, sourceSha256: 'b'.repeat(64) } }))).toThrow(/Calibration source hash/);
		expect(() => createSceneDocumentV1(fixture({ coordinateFrame: 'GLTF_Y_UP_METERS', evidenceSources: [source], calibration: { ...calibration, transform: { ...calibration.transform, scale: 8 } } }))).toThrow(/anchor-derived transform/);
		expect(() => createSceneDocumentV1(fixture({ coordinateFrame: 'SPZ_RUB', evidenceSources: [source], calibration }))).toThrow(/target requires GLTF_Y_UP_METERS/);
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
			anchorKind: 'MESH_SURFACE_HYPOTHESIS' as const,
			meshObjectId: objectId, meshAssetSha256: hash, triangleIndex: 11, barycentric: [0.2, 0.3, 0.5], label: 'Trace mark'
		};
		const objects = (fixture().objects as any[]).map((object) => ({ ...object, assetSha256: hash }));
		const document = createSceneDocumentV1(fixture({ caseId: sceneId, status: 'HYPOTHESIS', objects, evidenceBindings: [binding], surfaceMarkers: [marker] }));
		expect(document.surfaceMarkers?.[0]).toEqual(marker);
	});

	it('rejects surface markers with invalid barycentric weights, stale source, or out-of-range triangle', () => {
		const binding = { evidenceId: objectId, sourceRevision: `sha256:${hash}` };
		const base = { markerId: parentId, evidenceId: objectId, sourceRevision: binding.sourceRevision, anchorKind: 'MESH_SURFACE_HYPOTHESIS' as const, meshObjectId: objectId, meshAssetSha256: hash, triangleIndex: 0, barycentric: [0.2, 0.3, 0.5], label: 'Trace mark' };
		const manifest = (surfaceMarker: unknown) => fixture({ caseId: sceneId, status: 'HYPOTHESIS', evidenceBindings: [binding], surfaceMarkers: [surfaceMarker] });
		expect(() => createSceneDocumentV1(manifest({ ...base, barycentric: [0.2, 0.3, 0.6] }))).toThrow(/Barycentric weights/);
		expect(() => createSceneDocumentV1(manifest({ ...base, sourceRevision: `sha256:${'b'.repeat(64)}` }))).toThrow(/evidence source revision/);
		expect(() => createSceneDocumentV1(manifest({ ...base, triangleIndex: 12 }))).toThrow(/triangle in a manifest mesh/);
		const markerWithoutClassification = { ...base, anchorKind: undefined };
		expect(() => createSceneDocumentV1(fixture({ caseId: sceneId, status: 'HYPOTHESIS', sceneClassification: 'SINGLE_IMAGE_HYPOTHESIS', evidenceBindings: [binding], surfaceMarkers: [markerWithoutClassification] }))).toThrow(/explicitly classified as mesh-surface hypotheses/);
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

	it('rejects a cycle in object parent hierarchy with exact object index path', () => {
		const uuidA = '11111111-1111-4111-8111-111111111111';
		const uuidB = '22222222-2222-4222-8222-222222222222';
		const objA = { ...(fixture().objects as any[])[0], objectId: uuidA, parentObjectId: uuidB };
		const objB = { ...(fixture().objects as any[])[0], objectId: uuidB, parentObjectId: uuidA };
		try {
			createSceneDocumentV1(fixture({ caseId: sceneId, status: 'HYPOTHESIS', objects: [objA, objB] }));
			expect.unreachable('Should have thrown on cyclic parent hierarchy');
		} catch (err: any) {
			expect(err.message).toMatch(/Scene object parent hierarchy contains a cycle/);
			// Zod error path must identify ['objects', index, 'parentObjectId']
			const issue = err.issues?.find((i: any) => i.message.includes('cycle'));
			expect(issue).toBeDefined();
			expect(issue.path[0]).toBe('objects');
			expect(typeof issue.path[1]).toBe('number');
			expect(issue.path[2]).toBe('parentObjectId');
		}
	});

	it('accepts valid acyclic parent hierarchy without inventing invalid property paths', () => {
		const uuidRoot = '33333333-3333-4333-8333-333333333333';
		const uuidChild = '44444444-4444-4444-8444-444444444444';
		const root = { ...(fixture().objects as any[])[0], objectId: uuidRoot, parentObjectId: null };
		const child = { ...(fixture().objects as any[])[0], objectId: uuidChild, parentObjectId: uuidRoot };
		const doc = createSceneDocumentV1(fixture({ caseId: sceneId, status: 'HYPOTHESIS', objects: [root, child] }));
		expect(doc.objects).toHaveLength(2);
		expect(doc.objects[1].parentObjectId).toBe(uuidRoot);
	});
});
