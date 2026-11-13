/**
 * GET /api/library/documents/[documentId]/image
 * Streams an authorized raster image for the browser's native image viewer.
 */
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { pool } from '$lib/server/db/client';
import { getSeaweedStream } from '$lib/server/seaweed-client.js';
import { isUuid } from '$lib/server/validation.js';
import { ENV } from '$lib/server/env.server.js';
import { authorizeLibraryDocumentV1 } from '$lib/server/library/library-document-access-v1.js';

const BUCKET = ENV.MINIO_LIBRARY_BUCKET;
const ALLOWED_IMAGE_MIME = new Set(['image/jpeg', 'image/png', 'image/webp']);

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) throw error(401, 'Unauthorized');
	const { documentId } = params;
	if (!isUuid(documentId)) throw error(400, 'Invalid ID format');

	const access = await authorizeLibraryDocumentV1({ documentId, actorId: locals.user.id });
	if (!access.allowed) throw error(404, 'Document not found');

	const result = await pool.query(
		'SELECT minio_key, title, mime_type FROM library_documents WHERE id = $1',
		[documentId],
	).catch(() => null);
	const row = result?.rows[0] as { minio_key?: string | null; title?: string | null; mime_type?: string | null } | undefined;
	if (!row?.minio_key) throw error(404, 'Image not found');

	const mimeType = String(row.mime_type ?? '').split(';', 1)[0].trim().toLowerCase();
	if (!ALLOWED_IMAGE_MIME.has(mimeType)) throw error(415, 'Document is not a supported image');

	const nodeStream = await getSeaweedStream(BUCKET, row.minio_key).catch(() => null);
	if (!nodeStream) throw error(404, 'Image not found');
	const body = new ReadableStream<Uint8Array>({
		start(controller) {
			nodeStream.on('data', (chunk: Buffer) => controller.enqueue(chunk));
			nodeStream.on('end', () => controller.close());
			nodeStream.on('error', (cause: Error) => controller.error(cause));
		},
		cancel() {
			nodeStream.destroy();
		},
	});

	return new Response(body, {
		status: 200,
		headers: {
			'Content-Type': mimeType,
			'Content-Disposition': `inline; filename="${encodeURIComponent(row.title ?? documentId)}"`,
			'X-Content-Type-Options': 'nosniff',
			'Cross-Origin-Resource-Policy': 'same-origin',
			'Cache-Control': 'private, no-store',
		},
	});
};
