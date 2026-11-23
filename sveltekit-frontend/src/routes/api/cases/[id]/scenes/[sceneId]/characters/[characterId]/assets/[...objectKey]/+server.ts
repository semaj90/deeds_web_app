import { json } from '@sveltejs/kit';
import { createHash } from 'node:crypto';
import { z } from 'zod';
import { getAuthorizedCase } from '$lib/server/case-access.js';
import { ENV } from '$lib/server/env.server.js';
import { getFileFromSeaweed } from '$lib/server/storage/seaweed.js';
import { assertCharacterAssetsBucket, resolveCharacterAssetsBucket } from '$lib/server/storage/storage-buckets.js';
import type { RequestHandler } from './$types';

const uuid = z.uuid();
const safeSegment = z.string().regex(/^[a-zA-Z0-9._-]{1,128}$/);
const sha256Hex = z.string().regex(/^[a-f0-9]{64}$/i);
const MAX_CHARACTER_ASSET_BYTES = 16 * 1024 * 1024; // 16 MiB cap

function sanitizeObjectKey(raw: string): string | null {
	const cleaned = raw.replace(/^\/+/, '');
	if (!cleaned || cleaned.includes('..') || cleaned.includes('\\') || cleaned.length > 512) {
		return null;
	}
	if (!/^[a-zA-Z0-9._/-]+$/.test(cleaned)) {
		return null;
	}
	return cleaned;
}

function contentTypeForKey(key: string): string {
	const lower = key.toLowerCase();
	if (lower.endsWith('.glb')) return 'model/gltf-binary';
	if (lower.endsWith('.png')) return 'image/png';
	if (lower.endsWith('.webp')) return 'image/webp';
	if (lower.endsWith('.json')) return 'application/json';
	return 'application/octet-stream';
}

export const GET: RequestHandler = async ({ locals, params, request, url }) => {
	const caseResult = uuid.safeParse(params.id);
	const sceneResult = uuid.safeParse(params.sceneId);
	const charResult = safeSegment.safeParse(params.characterId);
	const objectKey = sanitizeObjectKey(params.objectKey ?? '');

	if (!caseResult.success || !sceneResult.success || !charResult.success || !objectKey) {
		return json({ success: false, data: null, message: 'Invalid identifiers or object key' }, { status: 400 });
	}
	if (!locals.user?.id) {
		return json({ success: false, data: null, message: 'Unauthorized' }, { status: 401 });
	}
	const actorId = Number(locals.user.id);
	if (!Number.isSafeInteger(actorId) || actorId <= 0) {
		return json({ success: false, data: null, message: 'Unauthorized' }, { status: 401 });
	}

	const authorized = await getAuthorizedCase(caseResult.data, actorId);
	if (!authorized) {
		return json({ success: false, data: null, message: 'Case not found' }, { status: 404 });
	}
	if (!ENV.SCENE_PERSISTENCE_ENABLED) {
		return json(
			{ success: false, data: null, message: 'Scene character asset reads are disabled pending schema and bucket admission' },
			{ status: 503 }
		);
	}

	const expectedShaParam = url.searchParams.get('expectedSha256');
	if (expectedShaParam !== null && !sha256Hex.safeParse(expectedShaParam).success) {
		return json({ success: false, data: null, message: 'Invalid expectedSha256 query parameter' }, { status: 400 });
	}

	try {
		const bucket = resolveCharacterAssetsBucket();
		assertCharacterAssetsBucket(bucket);

		const scopedKey = `cases/${caseResult.data}/scenes/${sceneResult.data}/characters/${charResult.data}/${objectKey}`;
		const bytes = await getFileFromSeaweed({
			bucket,
			objectKey: scopedKey,
			maximumBytes: MAX_CHARACTER_ASSET_BYTES
		});

		const actualSha = createHash('sha256').update(bytes).digest('hex');
		if (expectedShaParam && actualSha.toLowerCase() !== expectedShaParam.toLowerCase()) {
			return json({ success: false, data: null, message: 'Character asset SHA-256 verification failed' }, { status: 409 });
		}

		const contentType = contentTypeForKey(objectKey);
		const total = bytes.byteLength;
		const rangeHeader = request.headers.get('range');

		if (rangeHeader) {
			const match = /^bytes=(\d+)-(\d*)$/.exec(rangeHeader.trim());
			if (!match) {
				return json({ success: false, data: null, message: 'Invalid Range header' }, { status: 416 });
			}
			const start = Number(match[1]);
			const end = match[2] === '' ? total - 1 : Math.min(total - 1, Number(match[2]));
			if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start > end || start >= total) {
				return json({ success: false, data: null, message: 'Range not satisfiable' }, { status: 416 });
			}
			const slice = bytes.subarray(start, end + 1);
			return new Response(new Uint8Array(slice), {
				status: 206,
				headers: {
					'content-type': contentType,
					'content-length': String(slice.byteLength),
					'content-range': `bytes ${start}-${end}/${total}`,
					'accept-ranges': 'bytes',
					'etag': `"sha256-${actualSha}"`,
					'cache-control': 'private, no-store',
					'x-content-type-options': 'nosniff'
				}
			});
		}

		return new Response(new Uint8Array(bytes), {
			status: 200,
			headers: {
				'content-type': contentType,
				'content-length': String(total),
				'accept-ranges': 'bytes',
				'etag': `"sha256-${actualSha}"`,
				'cache-control': 'private, no-store',
				'x-content-type-options': 'nosniff'
			}
		});
	} catch {
		return json({ success: false, data: null, message: 'Character asset not found or storage unavailable' }, { status: 404 });
	}
};
