import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { parseStreamedSogManifestJsonV1, validateStreamedSogManifestV1, verifyStreamedSogPackageV1 } from './streamed-sog-manifest-v1.js';

function manifest() {
	return {
		version: 1,
		asset: { generator: 'splat-transform v3.10.3' },
		count: 12,
		counts: [8, 4],
		lodLevels: 2,
		filenames: ['0_0/meta.json', '1_0/meta.json'],
		tree: {
			bound: { min: [0, 0, 0], max: [4, 4, 4] },
			children: [
				{ bound: { min: [0, 0, 0], max: [2, 4, 4] }, lods: { '0': { file: 0, offset: 0, count: 5 }, '1': { file: 1, offset: 0, count: 2 } } },
				{ bound: { min: [2, 0, 0], max: [4, 4, 4] }, lods: { '0': { file: 0, offset: 5, count: 3 }, '1': { file: 1, offset: 2, count: 2 } } }
			]
		}
	};
}

function packageFixture() {
	const webp = new Uint8Array([82, 73, 70, 70, 4, 0, 0, 0, 87, 69, 66, 80, 1, 2, 3, 4]);
	const chunkMeta = (count: number) => new TextEncoder().encode(JSON.stringify({
		version: 2, count, means: { mins: [0, 0, 0], maxs: [1, 1, 1], files: ['means_l.webp', 'means_u.webp'] },
		scales: { codebook: new Array(256).fill(0), files: ['scales.webp'] }, quats: { files: ['quats.webp'] },
		sh0: { codebook: new Array(256).fill(0), files: ['sh0.webp'] }
	}));
	const contents = new Map<string, Uint8Array>([['lod-meta.json', new TextEncoder().encode(JSON.stringify(manifest()))]]);
	for (const [folder, count] of [['0_0', 8], ['1_0', 4]] as const) {
		contents.set(`${folder}/meta.json`, chunkMeta(count));
		for (const name of ['means_l.webp', 'means_u.webp', 'scales.webp', 'quats.webp', 'sh0.webp']) contents.set(`${folder}/${name}`, webp);
	}
	const files = [...contents].map(([path, bytes]) => ({ path, bytes: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex') }));
	return { contents, files };
}

describe('Streamed SOG manifest v1 admission', () => {
	it('accepts a valid two-leaf, two-level tree and preserves relative chunk paths', () => {
		const parsed = validateStreamedSogManifestV1(manifest());
		expect(parsed.counts).toEqual([8, 4]);
		expect(parsed.filenames).toEqual(['0_0/meta.json', '1_0/meta.json']);
	});

	it('rejects mismatched totals, levels, invalid chunk indexes, and unsafe paths', () => {
		expect(() => validateStreamedSogManifestV1({ ...manifest(), count: 11 })).toThrow('SOG_TOTAL_COUNT_MISMATCH');
		expect(() => validateStreamedSogManifestV1({ ...manifest(), lodLevels: 3 })).toThrow('SOG_LOD_LEVEL_COUNT_MISMATCH');
		const wrongFile = manifest();
		(wrongFile.tree.children[0].lods['0'] as { file: number }).file = 2;
		expect(() => validateStreamedSogManifestV1(wrongFile)).toThrow('SOG_CHUNK_FILE_INDEX_OUT_OF_RANGE');
		expect(() => validateStreamedSogManifestV1({ ...manifest(), filenames: ['../secret/meta.json', '1_0/meta.json'] })).toThrow('SOG_UNSAFE_CHUNK_PATH');
	});

	it('rejects tree count drift, gapped or overlapping chunk ranges, and inverted bounds', () => {
		const countDrift = manifest();
		countDrift.tree.children[1].lods['0'].count = 4;
		expect(() => validateStreamedSogManifestV1(countDrift)).toThrow('SOG_TREE_COUNTS_MISMATCH');
		const gap = manifest();
		gap.tree.children[1].lods['0'].offset = 6;
		expect(() => validateStreamedSogManifestV1(gap)).toThrow('SOG_CHUNK_RANGES_OVERLAP_OR_GAP');
		const inverted = manifest();
		inverted.tree.children[0].bound.min[0] = 3;
		expect(() => validateStreamedSogManifestV1(inverted)).toThrow('SOG_INVALID_NODE_BOUNDS');
	});

	it('bounds JSON size and reports malformed JSON with stable errors', () => {
		expect(() => parseStreamedSogManifestJsonV1('{')).toThrow('SOG_MANIFEST_INVALID_JSON');
		expect(() => parseStreamedSogManifestJsonV1(' '.repeat(1024 * 1024 + 1))).toThrow('SOG_MANIFEST_BYTE_LIMIT_EXCEEDED');
		expect(parseStreamedSogManifestJsonV1(JSON.stringify(manifest())).version).toBe(1);
	});

	it('verifies the exact index, chunk metadata, and WebP bytes against revision receipts', async () => {
		const fixture = packageFixture();
		const receipt = await verifyStreamedSogPackageV1({ files: fixture.files, readFile: async (path) => fixture.contents.get(path)! });
		expect(receipt).toMatchObject({ filesVerified: 13, chunkCount: 2, gaussianCount: 12, lodCounts: [8, 4] });
		expect(receipt.totalBytes).toBeGreaterThan(1000);
	});

	it('fails closed on mismatched stored bytes, invalid WebP signatures, and missing index receipts', async () => {
		const hashMismatch = packageFixture();
		hashMismatch.files[1] = { ...hashMismatch.files[1], sha256: 'f'.repeat(64) };
		await expect(verifyStreamedSogPackageV1({ files: hashMismatch.files, readFile: async (path) => hashMismatch.contents.get(path)! })).rejects.toThrow('SOG_PACKAGE_FILE_HASH_MISMATCH');
		const invalidTexture = packageFixture();
		invalidTexture.contents.set('0_0/means_l.webp', new Uint8Array(16));
		invalidTexture.files = [...invalidTexture.contents].map(([path, bytes]) => ({ path, bytes: bytes.byteLength, sha256: createHash('sha256').update(bytes).digest('hex') }));
		await expect(verifyStreamedSogPackageV1({ files: invalidTexture.files, readFile: async (path) => invalidTexture.contents.get(path)! })).rejects.toThrow('SOG_TEXTURE_NOT_WEBP');
		const missingIndex = packageFixture();
		await expect(verifyStreamedSogPackageV1({ files: missingIndex.files.filter((file) => file.path !== 'lod-meta.json'), readFile: async (path) => missingIndex.contents.get(path)! })).rejects.toThrow('SOG_PACKAGE_FILE_RECEIPT_MISSING');
	});
});
