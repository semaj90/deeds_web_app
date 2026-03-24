/**
 * MinIO file proxy — serves files stored in MinIO via /minio/{bucket}/{key}
 * Used by POI photos, evidence uploads, and chat images.
 */
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getFile } from '$lib/server/minio-client.js';

const MIME_MAP: Record<string, string> = {
	'.jpg': 'image/jpeg',
	'.jpeg': 'image/jpeg',
	'.png': 'image/png',
	'.webp': 'image/webp',
	'.gif': 'image/gif',
	'.svg': 'image/svg+xml',
	'.pdf': 'application/pdf',
	'.mp4': 'video/mp4',
	'.mp3': 'audio/mpeg',
};

export const GET: RequestHandler = async ({ params }) => {
	const fullPath = params.path;
	if (!fullPath) throw error(400, 'Missing path');

	// Split: first segment = bucket, rest = object key
	const slashIdx = fullPath.indexOf('/');
	if (slashIdx < 1) throw error(400, 'Invalid path — expected /minio/{bucket}/{key}');

	const bucket = fullPath.substring(0, slashIdx);
	const objectKey = fullPath.substring(slashIdx + 1);

	if (!objectKey) throw error(400, 'Missing object key');

	try {
		const body = await getFile(bucket, objectKey);

		// Determine content type from extension
		const ext = '.' + objectKey.split('.').pop()?.toLowerCase();
		const contentType = MIME_MAP[ext] || 'application/octet-stream';

		return new Response(new Uint8Array(body), {
			headers: {
				'Content-Type': contentType,
				'Content-Length': String(body.length),
				'Cache-Control': 'public, max-age=86400, immutable',
			},
		});
	} catch (err: any) {
		if (err?.code === 'NoSuchKey' || err?.code === 'NoSuchBucket') {
			throw error(404, 'File not found');
		}
		console.error('[minio-proxy] Error fetching object:', err?.message ?? err);
		throw error(500, 'Failed to fetch file from storage');
	}
};
