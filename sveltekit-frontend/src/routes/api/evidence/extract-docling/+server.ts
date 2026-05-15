/**
 * POST /api/evidence/extract-docling
 *
 * On-demand Granite-Docling extraction for uploaded files.
 * Accepts: image (direct) or PDF (renders pages to images first).
 * Returns: DoclingResult with structured blocks, page numbers, bounding boxes.
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';

const bodySchema = z.object({
  /** Base64-encoded file content (max ~75MB decoded) */
  fileBase64: z.string().min(1).max(100_000_000),
  /** Original filename for type detection */
  fileName: z.string().min(1).max(500),
  /** Max PDF pages to process (default 10) */
  maxPages: z.number().int().min(1).max(50).optional(),
});

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	let body: z.infer<typeof bodySchema>;
	try {
		body = bodySchema.parse(await request.json());
	} catch {
		return json({ error: 'Invalid request body' }, { status: 400 });
	}

	const { fileBase64, fileName, maxPages = 10 } = body;
	const buffer = Buffer.from(fileBase64, 'base64');

	try {
		const { isGraniteDoclingAvailable, analyzeImageWithGraniteDocling, analyzePdfWithGraniteDocling } =
			await import('$lib/server/analysis/granite-docling.js');

		if (!(await isGraniteDoclingAvailable())) {
			return json({ error: 'Granite-Docling model not available in Ollama' }, { status: 503 });
		}

		const isPdf = /\.pdf$/i.test(fileName);
		const isImage = /\.(png|jpg|jpeg|tiff|tif|bmp|webp)$/i.test(fileName);

		if (!isPdf && !isImage) {
			return json({ error: 'Unsupported file type. Accepts: PDF, PNG, JPG, TIFF, BMP, WebP' }, { status: 400 });
		}

		const result = isPdf
			? await analyzePdfWithGraniteDocling(buffer, maxPages)
			: await analyzeImageWithGraniteDocling(buffer);

		return json({
			fullText: result.fullText,
			blocks: result.blocks,
			pageCount: result.pageCount,
			processingTimeMs: result.processingTimeMs,
			method: isPdf ? 'granite-docling-pdf' : 'granite-docling-image',
		});
	} catch (err) {
		console.error('[extract-docling] Error:', err);
		return json({ error: 'Extraction failed' }, { status: 500 });
	}
};
