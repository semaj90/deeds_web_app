import { describe, expect, it, vi } from 'vitest';
import { evidenceSceneIdV1, fetchSceneAssetV1, fetchSceneRevisionV1, saveSceneManifestRevisionV1, saveSceneRevisionV1 } from './scene-persistence-client-v1.js';
import { createSceneCalibrationV1, createSceneQualityReceiptV1, stableStringifySceneDocumentV1 } from './scene-document-v1.js';
import type { CalibrationAnchor } from './calibration.js';
import { sha256Hex } from './spz-loader.js';

const caseId = '11111111-1111-4111-8111-111111111111';
const sceneId = '22222222-2222-4222-8222-222222222222';
const bytes = new Uint8Array([1, 2, 3, 4]);
const digest = '9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a';

async function createManifest(assetId = '33333333-3333-4333-8333-333333333333') {
	const manifest = {
		schema: 'parent-atlas.scene-document.v1' as const,
		sceneId,
		caseId,
		status: 'HYPOTHESIS' as const,
		revision: 1,
		parentManifestSha256: null,
		createdAt: '2026-11-05T00:00:00.000Z',
		coordinateFrame: 'GLTF_Y_UP_METERS' as const,
		objects: [],
		animations: [],
		evidenceBindings: [],
		evidenceSources: [],
		assets: [{ assetId, format: 'GLB' as const, sha256: digest, bytes: bytes.byteLength, role: 'DERIVED' as const }],
		quality: createSceneQualityReceiptV1({ derivedAssetBytes: bytes.byteLength, triangleCount: 0 })
	};
	return { manifest, manifestSha256: await sha256Hex(new TextEncoder().encode(stableStringifySceneDocumentV1(manifest))) };
}

describe('scene persistence browser client', () => {
	it('derives a stable exhibit-scoped scene identity without reusing the evidence UUID', async () => {
		const id = await evidenceSceneIdV1(caseId, '55555555-5555-4555-8555-555555555555');
		expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
		expect(await evidenceSceneIdV1(caseId.toUpperCase(), '55555555-5555-4555-8555-555555555555')).toBe(id);
		expect(await evidenceSceneIdV1('44444444-4444-4444-8444-444444444444', '55555555-5555-4555-8555-555555555555')).not.toBe(id);
		await expect(evidenceSceneIdV1('not-a-uuid', '55555555-5555-4555-8555-555555555555')).rejects.toThrow('CASE_AND_EVIDENCE_IDS_MUST_BE_UUIDS');
	});

	it('uploads the immutable asset before appending its manifest revision', async () => {
		const assetId = '33333333-3333-4333-8333-333333333333';
		const { manifest, manifestSha256 } = await createManifest(assetId);
		const fetcher = vi.fn()
			.mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: { assetId, format: 'GLB', sha256: digest, bytes: bytes.byteLength }, message: 'Stored' }), { status: 201 }))
			.mockResolvedValueOnce(new Response(JSON.stringify({ success: true, data: { revision: 1, manifestSha256, manifest, replayed: false }, message: 'Saved' }), { status: 201 }));
		const result = await saveSceneRevisionV1({
			caseId, sceneId, expectedRevision: 0, commandId: 'cmd-1', glb: bytes.buffer,
			createManifest: (asset) => ({ ...manifest, assets: [{ ...manifest.assets[0], assetId: asset.assetId }] }),
			fetcher
		});
		expect(fetcher).toHaveBeenCalledTimes(2);
		expect(fetcher.mock.calls[0][0]).toContain('/assets');
		expect(fetcher.mock.calls[1][0]).toContain('/revisions');
		expect(result.revision.revision).toBe(1);
	});

	it('rejects a manifest whose contents do not match the server digest', async () => {
		const { manifest, manifestSha256 } = await createManifest();
		const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
			success: true,
			data: { revision: 1, manifestSha256, manifest: { ...manifest, status: 'FIXTURE' }, replayed: false }
		})));
		await expect(fetchSceneRevisionV1({ caseId, sceneId, fetcher })).rejects.toThrow('SCENE_MANIFEST_SHA256_MISMATCH');
	});

	it('rejects a manifest returned for a different case or scene', async () => {
		const { manifest, manifestSha256 } = await createManifest();
		const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
			success: true,
			data: { revision: 1, manifestSha256, manifest: { ...manifest, caseId: '44444444-4444-4444-8444-444444444444' }, replayed: false }
		})));
		await expect(fetchSceneRevisionV1({ caseId, sceneId, fetcher })).rejects.toThrow('scope');
	});

	it('does not append a revision when object upload is rejected', async () => {
		const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: false, data: null, message: 'disabled' }), { status: 503 }));
		await expect(saveSceneRevisionV1({ caseId, sceneId, expectedRevision: 0, commandId: 'cmd-1', glb: bytes.buffer, createManifest: () => ({}), fetcher }))
			.rejects.toThrow('disabled');
		expect(fetcher).toHaveBeenCalledOnce();
	});

	it('appends a manifest-only revision without uploading an unchanged asset', async () => {
		const { manifest, manifestSha256 } = await createManifest();
		const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({
			success: true,
			data: { revision: 1, manifestSha256, manifest, replayed: false }
		}), { status: 201 }));
		const result = await saveSceneManifestRevisionV1({ caseId, sceneId, expectedRevision: 0, commandId: 'cmd-manifest-only', manifest, fetcher });
		expect(fetcher).toHaveBeenCalledOnce();
		expect(fetcher.mock.calls[0][0]).toContain('/revisions');
		expect(result.manifestSha256).toBe(manifestSha256);
	});

	it('persists an evidence-bound calibration revision without inventing a derived asset', async () => {
		const evidenceId = '55555555-5555-4555-8555-555555555555';
		const sourceSha = 'a'.repeat(64);
		const anchors: CalibrationAnchor[] = [
			{ id: 'a', splat: [0, 0, 0], worldM: [4, 1, -3] },
			{ id: 'b', splat: [1, 0, 0], worldM: [4 + 2.5 * Math.cos(0.7), 1, -3 - 2.5 * Math.sin(0.7)] },
			{ id: 'c', splat: [0, 1, 0], worldM: [4, 3.5, -3] }
		];
		const calibration = createSceneCalibrationV1({ sourceSha256: sourceSha, anchors, toleranceM: 0.02 });
		const source = { evidenceId, sourceRevision: `sha256:${sourceSha}`, format: 'SPZ' as const, coordinateSystem: 'RUB' as const, decoderRevision: 'spz-v4-decoder-core-v1', representationRevision: 'three-gaussian-splat-v1' };
		const manifest = {
			schema: 'parent-atlas.scene-document.v1' as const, sceneId, caseId, status: 'HYPOTHESIS' as const, revision: 1,
			parentManifestSha256: null, createdAt: '2026-11-05T00:00:00.000Z', coordinateFrame: 'GLTF_Y_UP_METERS' as const,
			objects: [], animations: [], evidenceSources: [source], assets: [], calibration,
			quality: createSceneQualityReceiptV1({ derivedAssetBytes: 0, triangleCount: 0 })
		};
		const manifestSha256 = await sha256Hex(new TextEncoder().encode(stableStringifySceneDocumentV1(manifest)));
		const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, data: { revision: 1, manifestSha256, manifest, replayed: false }, message: 'Saved' }), { status: 201 }));
		const result = await saveSceneManifestRevisionV1({ caseId, sceneId, expectedRevision: 0, commandId: 'cmd-calibration-only', manifest, fetcher });
		expect(result.manifest.calibration?.sourceSha256).toBe(sourceSha);
		expect(fetcher).toHaveBeenCalledOnce();
		expect(fetcher.mock.calls[0][0]).toContain('/revisions');
	});

	it('rejects a manifest-only revision with mismatched case or revision before network access', async () => {
		const { manifest } = await createManifest();
		const fetcher = vi.fn();
		await expect(saveSceneManifestRevisionV1({ caseId, sceneId, expectedRevision: 1, commandId: 'cmd-invalid', manifest, fetcher }))
			.rejects.toThrow('scope or expected revision');
		expect(fetcher).not.toHaveBeenCalled();
	});

	it('validates saved-asset size and digest before handing bytes to a loader', async () => {
		const fetcher = vi.fn().mockImplementation(() => Promise.resolve(new Response(bytes, { headers: { 'content-type': 'model/gltf-binary' } })));
		const loaded = await fetchSceneAssetV1({ caseId, sceneId, assetId: 'asset-1', expectedSha256: digest, expectedBytes: bytes.byteLength, fetcher });
		expect(loaded.byteLength).toBe(bytes.byteLength);
		await expect(fetchSceneAssetV1({ caseId, sceneId, assetId: 'asset-1', expectedSha256: 'a'.repeat(64), expectedBytes: bytes.byteLength, fetcher }))
			.rejects.toThrow('digest');
	});

	it('reads the current revision with no-store semantics and handles empty scenes', async () => {
		const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true, data: null, message: 'No scene revision' })));
		expect(await fetchSceneRevisionV1({ caseId, sceneId, fetcher })).toBeNull();
		expect(fetcher.mock.calls[0][1]).toMatchObject({ cache: 'no-store' });
	});
});
