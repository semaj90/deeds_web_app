import { describe, expect, it, vi } from 'vitest';
import { fetchSceneAssetV1, fetchSceneRevisionV1, saveSceneRevisionV1 } from './scene-persistence-client-v1.js';
import { createSceneQualityReceiptV1, stableStringifySceneDocumentV1 } from './scene-document-v1.js';
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
