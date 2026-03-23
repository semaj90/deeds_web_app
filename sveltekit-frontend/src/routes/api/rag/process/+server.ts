import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';

/** POST /api/rag/process — Process uploaded files through RAG pipeline */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const formData = await request.formData();
		const files = formData.getAll('files') as File[];
		const enableOCR = formData.get('enableOCR') === 'true';
		const enableEmbedding = formData.get('enableEmbedding') !== 'false';
		const enableRAG = formData.get('enableRAG') !== 'false';

		if (!files.length) {
			return json({ error: 'No files provided' }, { status: 400 });
		}

		const results: Array<{
			filename: string;
			status: string;
			documentId?: string;
			error?: string | null;
		}> = [];

		const { db } = await import('$lib/server/db/client');
		const { documents } = await import('$lib/server/db/schema.js');

		for (const file of files) {
			try {
				const buffer = Buffer.from(await file.arrayBuffer());
				let textContent = '';

				// Extract text based on file type
				if (file.name.endsWith('.pdf')) {
					try {
						const pdfParse = (await import('pdf-parse')).default;
						const parsed = await pdfParse(buffer);
						textContent = parsed.text;
					} catch {
						if (enableOCR) {
							textContent = `[OCR placeholder for ${file.name}]`;
						}
					}
				} else {
					textContent = buffer.toString('utf-8');
				}

				// Store document record
				const [doc] = await db
					.insert(documents)
					.values({
						title: file.name,
						content: textContent.slice(0, 100000),
						fileType: file.type || 'application/octet-stream',
						status: 'processed'
					})
					.returning({ id: documents.id });

				// Generate embeddings if enabled
				if (enableEmbedding && textContent.length > 10) {
					try {
						const { generateEmbeddings } = await import(
							'$lib/server/grpc/embedding-client.js'
						);
						await generateEmbeddings([textContent.slice(0, 8000)]);
					} catch {
						// Non-fatal: embedding generation failure
					}
				}

				results.push({
					filename: file.name,
					status: 'processed',
					documentId: doc?.id,
					error: null
				});
			} catch (err) {
				results.push({
					filename: file.name,
					status: 'error',
					error: err instanceof Error ? err.message : 'Processing failed'
				});
			}
		}

		const successfulUploads = results.filter((r) => r.status === 'processed').length;

		return json({
			successfulUploads,
			totalFiles: files.length,
			results
		});
	} catch (err) {
		console.error('[/api/rag/process] error:', err);
		return json({ error: 'RAG processing failed' }, { status: 500 });
	}
};