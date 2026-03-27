/**
 * GET /api/library/documents/[documentId]/pdf
 * Stream the original PDF for a library document from MinIO.
 * Supports Range requests so the browser PDF viewer can page-seek efficiently.
 */
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { pool } from '$lib/server/db/client';
import { statObject, getStream, getPartialStream } from '$lib/server/minio-client.js';
import { isUuid } from '$lib/server/validation.js';

const BUCKET = process.env.MINIO_LIBRARY_BUCKET ?? 'legal-library';

export const GET: RequestHandler = async ({ params, locals, request }) => {
	if (!locals.user) throw error(401, 'Unauthorized');

	const { documentId } = params;
	if (!isUuid(documentId)) throw error(400, 'Invalid ID format');

	// Fetch document metadata — we need the minio_key and mime type
	const res = await pool
		.query(`SELECT minio_key, title FROM library_documents WHERE id = $1`, [documentId])
		.catch(() => null);

	if (!res?.rows[0]) throw error(404, 'Document not found');
	const { minio_key: minioKey, title } = res.rows[0];

	if (!minioKey) throw error(404, 'No source file stored for this document');

	// Get object stats (size) for Content-Length + Range support
	const stat = await statObject(BUCKET, minioKey).catch(() => null);

	if (!stat) throw error(404, 'File not found in storage');

	const totalSize = stat.size;
	const rangeHeader = request.headers.get('range');

	// ── Range request (browser seeking into PDF) ────────────────────────────
	if (rangeHeader) {
		const match = rangeHeader.match(/bytes=(\d+)-(\d*)/);
		if (!match) throw error(416, 'Invalid Range header');

		const start = parseInt(match[1], 10);
		const end = match[2] ? parseInt(match[2], 10) : totalSize - 1;

		if (start > end || end >= totalSize) throw error(416, 'Range not satisfiable');

		const chunkSize = end - start + 1;

		const nodeStream = await getPartialStream(BUCKET, minioKey, start, chunkSize);

		const body = new ReadableStream({
			start(controller) {
				nodeStream.on('data', (chunk: Buffer) => controller.enqueue(chunk));
				nodeStream.on('end', () => controller.close());
				nodeStream.on('error', (err: Error) => controller.error(err));
			},
		});

		return new Response(body, {
			status: 206,
			headers: {
				'Content-Type': 'application/pdf',
				'Content-Range': `bytes ${start}-${end}/${totalSize}`,
				'Content-Length': String(chunkSize),
				'Accept-Ranges': 'bytes',
				'Content-Disposition': `inline; filename="${encodeURIComponent(title ?? documentId)}.pdf"`,
				'Cache-Control': 'private, max-age=3600',
			},
		});
	}

	// ── Full file ────────────────────────────────────────────────────────────
	const nodeStream = await getStream(BUCKET, minioKey);

	const body = new ReadableStream({
		start(controller) {
			nodeStream.on('data', (chunk: Buffer) => controller.enqueue(chunk));
			nodeStream.on('end', () => controller.close());
			nodeStream.on('error', (err: Error) => controller.error(err));
		},
	});

	return new Response(body, {
		status: 200,
		headers: {
			'Content-Type': 'application/pdf',
			'Content-Length': String(totalSize),
			'Accept-Ranges': 'bytes',
			'Content-Disposition': `inline; filename="${encodeURIComponent(title ?? documentId)}.pdf"`,
			'Cache-Control': 'private, max-age=3600',
		},
	});
};