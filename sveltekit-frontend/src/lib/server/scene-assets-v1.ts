import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db/client.js';
import { sceneAssets } from '$lib/server/db/schema/scene-assets.js';
import { sceneAssetFiles } from '$lib/server/db/schema/scene-asset-files.js';
import { ENV } from '$lib/server/env.server.js';
import { assertArtifactBucket } from '$lib/server/storage/storage-buckets.js';
import { getFileFromSeaweed, headFileInSeaweed, putFileToSeaweed } from '$lib/server/storage/seaweed.js';
import { STREAMED_SOG_CHUNK_MAX_BYTES, verifyStreamedSogPackageV1, type StreamedSogPackageFileV1 } from '$lib/splat/streamed-sog-manifest-v1.js';

export const SCENE_ASSET_MAX_BYTES = 64 * 1024 * 1024;
export const SCENE_ASSET_CONTENT_TYPE = 'model/gltf-binary';
export const SCENE_SOG_PACKAGE_MAX_BYTES = 64 * 1024 * 1024;
export const SCENE_SOG_PACKAGE_CONTENT_TYPE = 'application/vnd.parent-atlas.streamed-sog+json';
export const SCENE_SOG_PACKAGE_MAX_FILES = 4096;

type SceneSogInputFileV1 = { path: string; bytes: Uint8Array };

function sceneSogFileContentType(path: string): 'application/json' | 'image/webp' {
	if (path.endsWith('.json')) return 'application/json';
	if (path.endsWith('.webp')) return 'image/webp';
	throw new Error('SCENE_SOG_UNSUPPORTED_FILE_TYPE');
}

function isSafeSceneSogPath(path: string): boolean {
	return path.length > 0 && path.length <= 500 && /^[A-Za-z0-9._/-]+$/.test(path)
		&& !path.startsWith('/') && !path.includes('\\')
		&& path.split('/').every((part) => part.length > 0 && part !== '.' && part !== '..');
}

async function mapBounded<T>(items: readonly T[], concurrency: number, action: (item: T) => Promise<void>) {
	let next = 0;
	const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
		while (true) {
			const index = next++;
			if (index >= items.length) return;
			await action(items[index]!);
		}
	});
	await Promise.all(workers);
}

export function isGlbV2(bytes: Uint8Array): boolean {
	if (bytes.byteLength < 20) return false;
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	return view.getUint32(0, true) === 0x46546c67 && view.getUint32(4, true) === 2 && view.getUint32(8, true) === bytes.byteLength;
}

export function sha256Bytes(bytes: Uint8Array): string {
	return createHash('sha256').update(bytes).digest('hex');
}

async function readBoundedBody(body: ReadableStream<Uint8Array> | null, expectedLength: number | null, maximumBytes = SCENE_ASSET_MAX_BYTES): Promise<{ bytes: Uint8Array<ArrayBuffer>; sha256: string }> {
	if (!body) throw new Error('SCENE_ASSET_BODY_REQUIRED');
	const reader = body.getReader();
	const chunks: Uint8Array[] = [];
	const target = expectedLength === null ? null : new Uint8Array(expectedLength);
	const hash = createHash('sha256');
	let length = 0;
	try {
		while (true) {
			const { value, done } = await reader.read();
			if (done) break;
			if (!value) continue;
			length += value.byteLength;
			if (length > maximumBytes) {
				await reader.cancel();
				throw new Error('SCENE_ASSET_BYTE_LIMIT_EXCEEDED');
			}
			if (target) {
				if (length > target.byteLength) throw new Error('SCENE_ASSET_LENGTH_MISMATCH');
				target.set(value, length - value.byteLength);
			} else {
				chunks.push(value);
			}
			hash.update(value);
		}
	} finally {
		reader.releaseLock();
	}
	if (target) return { bytes: target.subarray(0, length), sha256: hash.digest('hex') };
	const bytes = new Uint8Array(length);
	let offset = 0;
	for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
	return { bytes, sha256: hash.digest('hex') };
}

export async function readBoundedSceneAssetRequestV1(body: ReadableStream<Uint8Array> | null, expectedLength: number, maximumBytes: number): Promise<Uint8Array<ArrayBuffer>> {
	if (!Number.isSafeInteger(expectedLength) || expectedLength <= 0 || expectedLength > maximumBytes) throw new Error('SCENE_ASSET_BYTE_LIMIT_EXCEEDED');
	const result = await readBoundedBody(body, expectedLength, maximumBytes);
	if (result.bytes.byteLength !== expectedLength) throw new Error('SCENE_ASSET_LENGTH_MISMATCH');
	return result.bytes;
}

export async function storeSceneGlbV1(input: {
	caseId: string;
	sceneId: string;
	actorId: number;
	body: ReadableStream<Uint8Array> | null;
	contentLength?: string | null;
}) {
	const timingsMs: Record<string, number> = {};
	const timed = async <T>(stage: string, action: () => Promise<T>): Promise<T> => {
		const started = performance.now();
		try { return await action(); }
		finally { timingsMs[stage] = Math.max(0, Math.round(performance.now() - started)); }
	};
	const declared = input.contentLength == null ? null : Number(input.contentLength);
	if (declared !== null && (!Number.isSafeInteger(declared) || declared <= 0 || declared > SCENE_ASSET_MAX_BYTES)) {
		throw new Error('SCENE_ASSET_BYTE_LIMIT_EXCEEDED');
	}
	const ingested = await timed('requestReadAndHash', () => readBoundedBody(input.body, declared));
	const { bytes, sha256 } = ingested;
	if (!isGlbV2(bytes)) throw new Error('SCENE_ASSET_INVALID_GLB_V2');
	if (declared !== null && declared !== bytes.byteLength) throw new Error('SCENE_ASSET_LENGTH_MISMATCH');

	const bucket = ENV.SEAWEED_ARTIFACTS_BUCKET;
	assertArtifactBucket(bucket);
	const objectKey = `scene-assets/${input.caseId}/${input.sceneId}/sha256/${sha256}.glb`;
	const contentType = SCENE_ASSET_CONTENT_TYPE;

	// Content-addressed writes are idempotent. Exact readback is required before
	// the PostgreSQL registry can describe the asset as available.
	await timed('seaweedPut', () => putFileToSeaweed({
		bucket, objectKey, bytes, contentType,
		metadata: { sha256, 'case-id': input.caseId, 'scene-id': input.sceneId, format: 'GLB' }
	}));
	const head = await timed('seaweedHead', () => headFileInSeaweed({ bucket, objectKey }));
	if (head.contentLength !== bytes.byteLength || head.contentType !== contentType) throw new Error('SCENE_ASSET_HEAD_READBACK_MISMATCH');
	await timed('seaweedGetAndVerify', async () => {
		const readback = await getFileFromSeaweed({ bucket, objectKey, maximumBytes: SCENE_ASSET_MAX_BYTES });
		if (readback.byteLength !== bytes.byteLength || sha256Bytes(readback) !== sha256) throw new Error('SCENE_ASSET_SHA256_READBACK_MISMATCH');
	});

	const registered = await timed('postgresRegisterAndReadback', async () => {
		await db.insert(sceneAssets).values({
			caseId: input.caseId, sceneId: input.sceneId, format: 'GLB', sha256,
			byteLength: bytes.byteLength, contentType, bucket, objectKey, createdBy: input.actorId
		}).onConflictDoNothing();
		const [row] = await db.select().from(sceneAssets).where(and(
			eq(sceneAssets.caseId, input.caseId), eq(sceneAssets.sceneId, input.sceneId), eq(sceneAssets.sha256, sha256)
		)).limit(1);
		if (!row || row.bucket !== bucket || row.objectKey !== objectKey || row.byteLength !== bytes.byteLength) {
			throw new Error('SCENE_ASSET_REGISTRY_READBACK_MISMATCH');
		}
		return row;
	});
	return { assetId: registered.assetId, format: 'GLB' as const, sha256, bytes: bytes.byteLength, bucket, objectKey, timingsMs };
}

/**
 * Store a verified multi-file Streamed SOG package as immutable case-scoped
 * SeaweedFS objects. The package digest is a canonical digest of the sorted
 * path/length/file-hash manifest; each member is independently read back and
 * hashed before PostgreSQL registers the package. Writes are bounded to four
 * concurrent members to avoid turning S3 request fan-out into an unbounded
 * memory or connection spike.
 */
export async function storeSceneSogPackageV1(input: {
	caseId: string;
	sceneId: string;
	actorId: number;
	files: readonly SceneSogInputFileV1[];
}) {
	if (!input.files.length || input.files.length > SCENE_SOG_PACKAGE_MAX_FILES) throw new Error('SCENE_SOG_FILE_COUNT_OUT_OF_RANGE');
	const byPath = new Map<string, SceneSogInputFileV1>();
	let totalBytes = 0;
	for (const file of input.files) {
		if (!isSafeSceneSogPath(file.path)) throw new Error('SCENE_SOG_UNSAFE_PACKAGE_PATH');
		if (byPath.has(file.path)) throw new Error('SCENE_SOG_DUPLICATE_PACKAGE_PATH');
		if (!ArrayBuffer.isView(file.bytes) || Object.prototype.toString.call(file.bytes) !== '[object Uint8Array]' || file.bytes.byteLength === 0) throw new Error('SCENE_SOG_EMPTY_PACKAGE_FILE');
		if (file.bytes.byteLength > STREAMED_SOG_CHUNK_MAX_BYTES) throw new Error('SCENE_SOG_FILE_BYTE_LIMIT_EXCEEDED');
		sceneSogFileContentType(file.path);
		totalBytes += file.bytes.byteLength;
		if (totalBytes > SCENE_SOG_PACKAGE_MAX_BYTES) throw new Error('SCENE_SOG_PACKAGE_BYTE_LIMIT_EXCEEDED');
		byPath.set(file.path, file);
	}
	const fileReceipts: StreamedSogPackageFileV1[] = [...byPath.values()].map(({ path, bytes }) => ({
		path, bytes: bytes.byteLength, sha256: sha256Bytes(bytes)
	}));
	const timingsMs: Record<string, number> = {};
	const time = async <T>(name: string, action: () => Promise<T>): Promise<T> => {
		const start = performance.now();
		try { return await action(); }
		finally { timingsMs[name] = Math.max(0, Math.round(performance.now() - start)); }
	};
	const verified = await time('packageAdmission', () => verifyStreamedSogPackageV1({
		files: fileReceipts,
		maximumTotalBytes: SCENE_SOG_PACKAGE_MAX_BYTES,
		readFile: async (path) => {
			const file = byPath.get(path);
			if (!file) throw new Error('SCENE_SOG_PACKAGE_FILE_MISSING');
			return file.bytes;
		}
	}));
	if (verified.filesVerified !== byPath.size || verified.totalBytes !== totalBytes) throw new Error('SCENE_SOG_PACKAGE_ADMISSION_MISMATCH');

	const canonicalReceipt = fileReceipts.slice().sort((a, b) => a.path.localeCompare(b.path));
	const packageSha256 = createHash('sha256').update(JSON.stringify(canonicalReceipt)).digest('hex');
	const bucket = ENV.SEAWEED_ARTIFACTS_BUCKET;
	assertArtifactBucket(bucket);
	const prefix = `scene-assets/${input.caseId}/${input.sceneId}/sog/sha256/${packageSha256}`;
	const objectKeyFor = (path: string) => `${prefix}/${path}`;
	let putMs = 0;
	let readbackMs = 0;
	const storageStart = performance.now();
	await mapBounded([...byPath.values()], 4, async (file) => {
		const sha256 = sha256Bytes(file.bytes);
		const contentType = sceneSogFileContentType(file.path);
		const objectKey = objectKeyFor(file.path);
		const putStart = performance.now();
		await putFileToSeaweed({ bucket, objectKey, bytes: file.bytes, contentType, metadata: {
			sha256, 'case-id': input.caseId, 'scene-id': input.sceneId, 'asset-sha256': packageSha256, format: 'SOG'
		} });
		putMs += performance.now() - putStart;
		const getStart = performance.now();
		const readback = await getFileFromSeaweed({ bucket, objectKey, maximumBytes: STREAMED_SOG_CHUNK_MAX_BYTES });
		readbackMs += performance.now() - getStart;
		if (readback.byteLength !== file.bytes.byteLength || sha256Bytes(readback) !== sha256) throw new Error('SCENE_SOG_OBJECT_READBACK_MISMATCH');
	});
	timingsMs.seaweedPutSum = Math.round(putMs);
	timingsMs.seaweedReadbackSum = Math.round(readbackMs);
	timingsMs.seaweedConcurrentWall = Math.max(0, Math.round(performance.now() - storageStart));

	const rootObjectKey = objectKeyFor('lod-meta.json');
	const registered = await time<typeof sceneAssets.$inferSelect>('postgresRegisterAndReadback', () => db.transaction(async (tx) => {
		await tx.insert(sceneAssets).values({
			caseId: input.caseId, sceneId: input.sceneId, format: 'SOG', sha256: packageSha256,
			byteLength: totalBytes, contentType: SCENE_SOG_PACKAGE_CONTENT_TYPE, bucket, objectKey: rootObjectKey, createdBy: input.actorId
		}).onConflictDoNothing();
		const [root] = await tx.select().from(sceneAssets).where(and(
			eq(sceneAssets.caseId, input.caseId), eq(sceneAssets.sceneId, input.sceneId), eq(sceneAssets.sha256, packageSha256)
		)).limit(1);
		if (!root || root.format !== 'SOG' || root.byteLength !== totalBytes || root.contentType !== SCENE_SOG_PACKAGE_CONTENT_TYPE || root.objectKey !== rootObjectKey) {
			throw new Error('SCENE_SOG_REGISTRY_READBACK_MISMATCH');
		}
		const rows = canonicalReceipt.map((receipt) => ({
			assetId: root.assetId, relativePath: receipt.path, sha256: receipt.sha256,
			byteLength: receipt.bytes, contentType: sceneSogFileContentType(receipt.path),
			bucket, objectKey: objectKeyFor(receipt.path)
		}));
		await tx.insert(sceneAssetFiles).values(rows).onConflictDoNothing();
		const storedFiles = await tx.select().from(sceneAssetFiles).where(eq(sceneAssetFiles.assetId, root.assetId));
		const actual = new Map<string, typeof sceneAssetFiles.$inferSelect>(storedFiles.map((row) => [row.relativePath, row] as const));
		if (actual.size !== rows.length || rows.some((row) => {
			const found = actual.get(row.relativePath);
			return !found || found.sha256 !== row.sha256 || found.byteLength !== row.byteLength || found.contentType !== row.contentType || found.bucket !== row.bucket || found.objectKey !== row.objectKey;
		})) throw new Error('SCENE_SOG_FILE_REGISTRY_READBACK_MISMATCH');
		return root;
	}));
	return {
		assetId: registered.assetId, format: 'SOG' as const, sha256: packageSha256, bytes: totalBytes,
		bucket, fileCount: verified.filesVerified, gaussianCount: verified.gaussianCount,
		lodCounts: verified.lodCounts, timingsMs
	};
}

export async function readSceneSogPackageManifestV1(input: { caseId: string; sceneId: string; assetId: string }) {
	const [root] = await db.select().from(sceneAssets).where(and(
		eq(sceneAssets.caseId, input.caseId), eq(sceneAssets.sceneId, input.sceneId), eq(sceneAssets.assetId, input.assetId)
	)).limit(1);
	if (!root || root.format !== 'SOG' || root.contentType !== SCENE_SOG_PACKAGE_CONTENT_TYPE) return null;
	const files = await db.select({ path: sceneAssetFiles.relativePath, bytes: sceneAssetFiles.byteLength, sha256: sceneAssetFiles.sha256 })
		.from(sceneAssetFiles).where(eq(sceneAssetFiles.assetId, root.assetId));
	if (!files.length || files.reduce((total, file) => total + file.bytes, 0) !== root.byteLength) throw new Error('SCENE_SOG_FILE_REGISTRY_MISMATCH');
	const canonicalReceipt = files.slice().sort((a, b) => a.path.localeCompare(b.path));
	if (createHash('sha256').update(JSON.stringify(canonicalReceipt)).digest('hex') !== root.sha256) throw new Error('SCENE_SOG_PACKAGE_DIGEST_MISMATCH');
	return { assetId: root.assetId, format: 'SOG' as const, sha256: root.sha256, bytes: root.byteLength, files: canonicalReceipt };
}

export async function readSceneSogPackageFileV1(input: { caseId: string; sceneId: string; assetId: string; path: string }) {
	if (!isSafeSceneSogPath(input.path)) throw new Error('SCENE_SOG_UNSAFE_PACKAGE_PATH');
	const [root] = await db.select().from(sceneAssets).where(and(
		eq(sceneAssets.caseId, input.caseId), eq(sceneAssets.sceneId, input.sceneId), eq(sceneAssets.assetId, input.assetId)
	)).limit(1);
	if (!root || root.format !== 'SOG' || root.contentType !== SCENE_SOG_PACKAGE_CONTENT_TYPE) return null;
	const [file] = await db.select().from(sceneAssetFiles).where(and(
		eq(sceneAssetFiles.assetId, root.assetId), eq(sceneAssetFiles.relativePath, input.path)
	)).limit(1);
	if (!file) return null;
	assertArtifactBucket(file.bucket);
	const bytes = await getFileFromSeaweed({ bucket: file.bucket, objectKey: file.objectKey, maximumBytes: STREAMED_SOG_CHUNK_MAX_BYTES });
	if (bytes.byteLength !== file.byteLength || sha256Bytes(bytes) !== file.sha256 || sceneSogFileContentType(input.path) !== file.contentType) {
		throw new Error('SCENE_SOG_FILE_READBACK_MISMATCH');
	}
	return { bytes, contentType: file.contentType, sha256: file.sha256 };
}

export async function readSceneGlbV1(input: { caseId: string; sceneId: string; assetId: string }) {
	const [registered] = await db.select().from(sceneAssets).where(and(
		eq(sceneAssets.caseId, input.caseId), eq(sceneAssets.sceneId, input.sceneId), eq(sceneAssets.assetId, input.assetId)
	)).limit(1);
 if (!registered || registered.format !== 'GLB' || registered.contentType !== SCENE_ASSET_CONTENT_TYPE) return null;
	assertArtifactBucket(registered.bucket);
	const bytes = await getFileFromSeaweed({ bucket: registered.bucket, objectKey: registered.objectKey, maximumBytes: SCENE_ASSET_MAX_BYTES });
	if (bytes.byteLength !== registered.byteLength || sha256Bytes(bytes) !== registered.sha256 || !isGlbV2(bytes)) {
		throw new Error('SCENE_ASSET_READBACK_MISMATCH');
	}
	return { bytes, contentType: registered.contentType, sha256: registered.sha256 };
}

export async function findSceneAssetV1(input: { caseId: string; sceneId: string; assetId: string }) {
	const [row] = await db.select().from(sceneAssets).where(and(
		eq(sceneAssets.caseId, input.caseId), eq(sceneAssets.sceneId, input.sceneId), eq(sceneAssets.assetId, input.assetId)
	)).limit(1);
	return row ?? null;
}
