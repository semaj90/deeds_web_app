import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import {
	encodeFeatureMask,
	hasFeature,
	hasAllFeatures,
	popcount256,
	hamming256,
	encodeScenePack,
	decodeScenePack,
	identityMatrix,
	MAX_PACK_BYTES,
	normalizeMrl,
	cosineNormalized,
	MODEL_ID,
	createSceneCatalogService,
	type ScenePackEntryInputV1
} from './scene-catalog-pack-v1.js';

function vec(a: number, b: number): Float32Array {
	const x = new Float32Array(768);
	x[0] = a;
	x[1] = b;
	return x;
}

describe('Parent Atlas Scene Catalog Binary Pack & MRL (v1)', () => {
	describe('256-Bit Feature Bitset (32B)', () => {
		it('encodes feature codes 0..255 and calculates popcount & hamming distance', () => {
			const maskA = encodeFeatureMask([0, 7, 128, 255]);
			const maskB = encodeFeatureMask([0, 7, 64, 255]);

			expect(maskA.byteLength).toBe(32);
			expect(hasFeature(maskA, 0)).toBe(true);
			expect(hasFeature(maskA, 7)).toBe(true);
			expect(hasFeature(maskA, 128)).toBe(true);
			expect(hasFeature(maskA, 255)).toBe(true);
			expect(hasFeature(maskA, 64)).toBe(false);

			expect(hasAllFeatures(maskA, [0, 7, 255])).toBe(true);
			expect(hasAllFeatures(maskA, [0, 64])).toBe(false);

			expect(popcount256(maskA)).toBe(4);
			// Differ on 128 and 64 -> Hamming distance = 2
			expect(hamming256(maskA, maskB)).toBe(2);

			expect(() => encodeFeatureMask([256])).toThrow(RangeError);
		});
	});

	describe('PASC v1 64-Byte Aligned Binary Pack', () => {
		const input: ScenePackEntryInputV1[] = [
			{
				id: '019b0000-0000-7000-8000-000000000001',
				assetSha256: 'a'.repeat(64),
				handle: 100,
				taxonomyCode: 4,
				materialId: 8,
				motionId: 11,
				lod: 2,
				features: encodeFeatureMask([0, 7, 255]),
				matrix: identityMatrix()
			},
			{
				id: '019b0000-0000-7000-8000-000000000002',
				assetSha256: 'b'.repeat(64),
				handle: 101,
				taxonomyCode: 5,
				features: encodeFeatureMask([2, 30])
			}
		];

		it('roundtrips binary records with 64-byte section alignment', () => {
			const buf = encodeScenePack(input, { revision: 7 });
			const out = decodeScenePack(buf);

			expect(out.revision).toBe(7);
			expect(out.bytes).toBe(384);
			expect(out.layout.recordOffset % 64).toBe(0);
			expect(out.layout.matrixOffset % 64).toBe(0);
			expect(out.layout.featureOffset % 64).toBe(0);

			expect(out.entries[0].id).toBe(input[0].id);
			expect(out.entries[0].assetSha256).toBe(input[0].assetSha256);
			expect(out.entries[0].motionId).toBe(11);
			expect(out.entries[0].matrix[15]).toBe(1);
			expect(hasFeature(out.entries[0].features, 255)).toBe(true);
			expect(out.entries[1].handle).toBe(101);
		});

		it('is deterministic and enforces 8 MiB budget', () => {
			const a = encodeScenePack(input);
			const b = encodeScenePack(input);
			expect(createHash('sha256').update(a).digest('hex')).toBe(
				createHash('sha256').update(b).digest('hex')
			);
			expect(a.length).toBeLessThan(MAX_PACK_BYTES);
			expect(() => encodeScenePack(input, { maxBytes: 128 })).toThrow(/budget/);
		});

		it('rejects corrupt header, duplicate UUID/handle, and nonfinite matrix', () => {
			const original = encodeScenePack(input);
			const broken = Buffer.from(original);
			broken.writeUInt32LE(0, 20);
			expect(() => decodeScenePack(broken)).toThrow(/layout/);

			const broken2 = Buffer.from(original);
			broken2[0] = 0;
			expect(() => decodeScenePack(broken2)).toThrow(/magic/);

			expect(() => encodeScenePack([input[0], { ...input[0], handle: 200 }])).toThrow(/UUID/);
			expect(() => encodeScenePack([input[0], { ...input[1], handle: 100 }])).toThrow(/handle/);

			const m = identityMatrix();
			m[1] = Infinity;
			expect(() => encodeScenePack([{ ...input[0], matrix: m }])).toThrow(/matrix/);
		});

		it('encodes empty pack with valid 64-byte header', () => {
			const out = decodeScenePack(encodeScenePack([]));
			expect(out.bytes).toBe(64);
			expect(out.entries.length).toBe(0);
		});
	});

	describe('MRL 128/256/512/768 Vector Prefix Normalization', () => {
		it('truncates and L2-normalizes 768-dim EmbeddingGemma 2 vectors', () => {
			const v1 = vec(3, 4); // norm = 5
			const n256 = normalizeMrl(v1, 256);
			expect(n256.length).toBe(256);
			expect(n256[0]).toBeCloseTo(0.6, 5);
			expect(n256[1]).toBeCloseTo(0.8, 5);
			expect(cosineNormalized(n256, n256)).toBeCloseTo(1.0, 5);
		});
	});

	describe('Case-Authorized Scene Catalog Service', () => {
		const entries: ScenePackEntryInputV1[] = [
			{
				id: '019b0000-0000-7000-8000-000000000001',
				handle: 0,
				taxonomyCode: 1,
				lod: 0,
				assetSha256: 'a'.repeat(64),
				features: encodeFeatureMask([1, 2]),
				embedding: {
					modelId: MODEL_ID,
					modelRevision: 'demo-r1',
					promptProfile: 'search-document',
					vector768: vec(1, 0)
				}
			},
			{
				id: '019b0000-0000-7000-8000-000000000002',
				handle: 1,
				taxonomyCode: 1,
				lod: 0,
				assetSha256: 'b'.repeat(64),
				features: encodeFeatureMask([1]),
				embedding: {
					modelId: MODEL_ID,
					modelRevision: 'demo-r1',
					promptProfile: 'search-document',
					vector768: vec(0, 1)
				}
			},
			{
				id: '019b0000-0000-7000-8000-000000000003',
				handle: 2,
				taxonomyCode: 2,
				lod: 0,
				assetSha256: 'c'.repeat(64),
				features: encodeFeatureMask([1, 2]),
				embedding: {
					modelId: MODEL_ID,
					modelRevision: 'old-r0',
					promptProfile: 'search-document',
					vector768: vec(0, 1)
				}
			}
		];
		const context = { principalId: 'user-1', caseId: 'case-A' };

		it('filters by taxonomyCode and required feature bitmask', async () => {
			const svc = createSceneCatalogService({
				listSceneCandidates: async () => entries,
				mayReadAsset: async () => true
			});
			const result = await svc.query(context, {
				sceneId: 'A',
				taxonomyCode: 1,
				requiredFeatures: [2]
			});
			expect(result.map((x) => x.handle)).toEqual([0]);
		});

		it('enforces per-request authorization on both queries and binary packs', async () => {
			let allowed = new Set([entries[0].id]);
			const svc = createSceneCatalogService({
				listSceneCandidates: async () => entries,
				mayReadAsset: async (_, e) => allowed.has(e.id)
			});

			expect((await svc.query(context, { sceneId: 'A', requiredFeatures: [1] })).length).toBe(1);

			allowed = new Set([entries[1].id]);
			const next = await svc.query(context, { sceneId: 'A', requiredFeatures: [1] });
			expect(next.map((x) => x.id)).toEqual([entries[1].id]);

			const pack = await svc.buildAuthorizedPack(context, { sceneId: 'A', revision: 2 });
			expect(decodeScenePack(pack.binary).entries.map((x) => x.id)).toEqual([entries[1].id]);
		});

		it('ranks by MRL embedding prefix and rejects model/revision mismatch', async () => {
			const svc = createSceneCatalogService({
				listSceneCandidates: async () => entries,
				mayReadAsset: async () => true
			});
			const result = await svc.query(context, {
				sceneId: 'A',
				embedding: {
					modelId: MODEL_ID,
					modelRevision: 'demo-r1',
					promptProfile: 'search-document',
					vector768: vec(1, 0),
					dims: 256
				}
			});
			expect(result.map((x) => x.id)).toEqual([entries[0].id, entries[1].id]);
			expect(result[0].score).toBeCloseTo(1, 5);

			await expect(
				svc.query(context, {
					sceneId: 'A',
					embedding: {
						modelId: 'embeddinggemma-300m',
						modelRevision: 'demo-r1',
						promptProfile: 'search-document',
						vector768: vec(1, 0)
					}
				})
			).rejects.toThrow(/model/);
		});
	});
});
