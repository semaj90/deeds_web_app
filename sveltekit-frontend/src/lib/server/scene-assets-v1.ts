import { createHash } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db/client.js';
import { sceneAssets } from '$lib/server/db/schema/scene-assets.js';
import { ENV } from '$lib/server/env.server.js';
import { assertArtifactBucket } from '$lib/server/storage/storage-buckets.js';
import { getFileFromSeaweed, headFileInSeaweed, putFileToSeaweed } from '$lib/server/storage/seaweed.js';

export const SCENE_ASSET_MAX_BYTES = 64 * 1024 * 1024;
export const SCENE_ASSET_CONTENT_TYPE = 'model/gltf-binary';

export function isGlbV2(bytes: Uint8Array): boolean {
	if (bytes.byteLength < 20) return false;
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	return view.getUint32(0, true) === 0x46546c67 && view.getUint32(4, true) === 2 && view.getUint32(8, true) === bytes.byteLength;
}

export function sha256Bytes(bytes: Uint8Array): string {
	return createHash('sha256').update(bytes).digest('hex');
}

async function readBoundedBody(body: ReadableStream<Uint8Array> | null, expectedLength: number | null): Promise<{ bytes: Uint8Array; sha256: string }> {
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
			if (length > SCENE_ASSET_MAX_BYTES) {
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

export async function readSceneGlbV1(input: { caseId: string; sceneId: string; assetId: string }) {
	const [registered] = await db.select().from(sceneAssets).where(and(
		eq(sceneAssets.caseId, input.caseId), eq(sceneAssets.sceneId, input.sceneId), eq(sceneAssets.assetId, input.assetId)
	)).limit(1);
	if (!registered) return null;
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
