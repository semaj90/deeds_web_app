import { beforeEach, describe, expect, it, vi } from 'vitest';
import { sceneAssets } from '$lib/server/db/schema/scene-assets.js';
import { sceneAssetFiles } from '$lib/server/db/schema/scene-asset-files.js';

const mocks = vi.hoisted(() => {
	const objects = new Map<string, Uint8Array>();
	const registry: { root: Record<string, unknown> | null; files: Record<string, unknown>[] } = { root: null, files: [] };
	const put = vi.fn(async ({ objectKey, bytes }: { objectKey: string; bytes: Uint8Array }) => { objects.set(objectKey, bytes.slice()); });
	const get = vi.fn(async ({ objectKey }: { objectKey: string }) => objects.get(objectKey)?.slice() ?? new Uint8Array());
	const transaction = vi.fn(async (work: (tx: unknown) => Promise<unknown>) => work({
		insert: (table: unknown) => ({
			values: (values: Record<string, unknown> | Record<string, unknown>[]) => {
				const rows = Array.isArray(values) ? values : [values];
				if (table === sceneAssets) registry.root = { assetId: '44444444-4444-4444-8444-444444444444', ...rows[0] };
				if (table === sceneAssetFiles) registry.files = rows;
				return { onConflictDoNothing: async () => undefined };
			}
		}),
		select: () => ({
			from: (table: unknown) => {
				const result = table === sceneAssets ? { limit: async () => registry.root ? [registry.root] : [] } : registry.files;
				return { where: () => result };
			}
		})
	}));
	const select = (projection?: Record<string, unknown>) => ({
		from: (table: unknown) => ({
			where: () => table === sceneAssets
				? { limit: async () => registry.root ? [registry.root] : [] }
				: projection ? registry.files.map((row) => ({ path: row.relativePath, bytes: row.byteLength, sha256: row.sha256 }))
					: { limit: async () => registry.files.slice(0, 1) }
		})
	});
	return { objects, registry, put, get, transaction, select };
});

vi.mock('$lib/server/db/client.js', () => ({ db: { transaction: mocks.transaction, select: mocks.select } }));
vi.mock('$lib/server/env.server.js', () => ({ ENV: { SEAWEED_ARTIFACTS_BUCKET: 'atlas-artifacts' } }));
vi.mock('$lib/server/storage/storage-buckets.js', () => ({ assertArtifactBucket: vi.fn() }));
vi.mock('$lib/server/storage/seaweed.js', () => ({ putFileToSeaweed: mocks.put, getFileFromSeaweed: mocks.get, headFileInSeaweed: vi.fn() }));

import { readSceneSogPackageFileV1, readSceneSogPackageManifestV1, storeSceneSogPackageV1 } from './scene-assets-v1.js';

const caseId = '11111111-1111-4111-8111-111111111111';
const sceneId = '22222222-2222-4222-8222-222222222222';
const assetId = '44444444-4444-4444-8444-444444444444';

function packageFiles() {
	const webp = new Uint8Array([82, 73, 70, 70, 4, 0, 0, 0, 87, 69, 66, 80, 1, 2, 3, 4]);
	const manifest = {
		version: 1, count: 1, counts: [1], lodLevels: 1, filenames: ['0_0/meta.json'],
		tree: { bound: { min: [0, 0, 0], max: [1, 1, 1] }, lods: { '0': { file: 0, offset: 0, count: 1 } } }
	};
	const chunk = {
		version: 2, count: 1,
		means: { mins: [0, 0, 0], maxs: [1, 1, 1], files: ['means_l.webp', 'means_u.webp'] },
		scales: { codebook: new Array(256).fill(0), files: ['scales.webp'] },
		quats: { files: ['quats.webp'] },
		sh0: { codebook: new Array(256).fill(0), files: ['sh0.webp'] }
	};
	return [
		{ path: 'lod-meta.json', bytes: new TextEncoder().encode(JSON.stringify(manifest)) },
		{ path: '0_0/meta.json', bytes: new TextEncoder().encode(JSON.stringify(chunk)) },
		...['means_l.webp', 'means_u.webp', 'scales.webp', 'quats.webp', 'sh0.webp'].map((name) => ({ path: `0_0/${name}`, bytes: webp }))
	];
}

describe('case Streamed SOG asset storage', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.objects.clear();
		mocks.registry.root = null;
		mocks.registry.files = [];
	});

	it('hashes and verifies each immutable SOG member before registering and reading it back', async () => {
		const files = packageFiles();
		expect(files.every((file) => file.bytes.byteLength > 0)).toBe(true);
		const result = await storeSceneSogPackageV1({ caseId, sceneId, actorId: 7, files });
		expect(result).toMatchObject({ format: 'SOG', fileCount: 7, gaussianCount: 1, lodCounts: [1] });
		expect(mocks.put).toHaveBeenCalledTimes(files.length);
		expect(mocks.get).toHaveBeenCalledTimes(files.length);
		expect(mocks.registry.files).toHaveLength(files.length);
		const manifest = await readSceneSogPackageManifestV1({ caseId, sceneId, assetId });
		expect(manifest?.sha256).toBe(result.sha256);
		const storedMember = mocks.registry.files[0]!;
		const sourceMember = files.find((file) => file.path === storedMember.relativePath)!;
		expect(mocks.objects.get(String(storedMember.objectKey))).toEqual(sourceMember.bytes);
		const member = await readSceneSogPackageFileV1({ caseId, sceneId, assetId, path: String(storedMember.relativePath) });
		expect(member?.contentType).toBe(storedMember.contentType);
		expect(member?.bytes).toEqual(sourceMember.bytes);
	});

	it('rejects traversal before any object-store or database write', async () => {
		await expect(storeSceneSogPackageV1({ caseId, sceneId, actorId: 7, files: [{ path: '../lod-meta.json', bytes: new Uint8Array([1]) }] }))
			.rejects.toThrow('SCENE_SOG_UNSAFE_PACKAGE_PATH');
		expect(mocks.put).not.toHaveBeenCalled();
		expect(mocks.transaction).not.toHaveBeenCalled();
	});

	it('rejects unreferenced package files before writing any object', async () => {
		const files = [...packageFiles(), { path: '0_0/unused.webp', bytes: new Uint8Array([1, 2, 3]) }];
		await expect(storeSceneSogPackageV1({ caseId, sceneId, actorId: 7, files })).rejects.toThrow('SOG_UNREFERENCED_PACKAGE_FILE');
		expect(mocks.put).not.toHaveBeenCalled();
		expect(mocks.transaction).not.toHaveBeenCalled();
	});
});
