import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { z } from 'zod';

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB per file
const MAX_FILES = 20;
const ALLOWED_TYPES = new Set([
	'application/pdf', 'text/plain', 'text/html', 'text/markdown',
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
	'application/octet-stream', ''
]);
const ALLOWED_EXTENSIONS = new Set(['.pdf', '.txt', '.html', '.md', '.docx']);

// Custom Zod refinement for file validation
const documentFileSchema = z
	.custom<File>((v) => v instanceof File, 'Must be a File')
	.refine((file) => file.size <= MAX_FILE_SIZE, `File exceeds 50MB limit`)
	.refine((file) => {
		const ext = file.name.includes('.') ? '.' + file.name.split('.').pop()!.toLowerCase() : '';
		return ALLOWED_EXTENSIONS.has(ext) || ALLOWED_TYPES.has(file.type);
	}, 'Unsupported file type');

const ragProcessSchema = z.object({
	files: z.array(documentFileSchema).min(1, 'No files provided').max(MAX_FILES, `Too many files (max ${MAX_FILES})`),
	enableOCR: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
	enableEmbedding: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
	enableRAG: z.enum(['true', 'false']).default('true').transform((v) => v === 'true'),
});

/** POST /api/rag/process — Process uploaded files through RAG pipeline */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	try {
		const formData = await request.formData();

		// Validate FormData with Zod
		const parsed = ragProcessSchema.safeParse({
			files: formData.getAll('files'),
			enableOCR: formData.get('enableOCR'),
			enableEmbedding: formData.get('enableEmbedding'),
			enableRAG: formData.get('enableRAG'),
		});

		if (!parsed.success) {
			return json(
				{ error: parsed.error.issues[0]?.message ?? 'Invalid request' },
				{ status: 400 }
			);
		}

		const { files, enableOCR, enableEmbedding, enableRAG } = parsed.data;

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
					error: 'Processing failed'
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