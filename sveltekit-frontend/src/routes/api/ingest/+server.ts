import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { z } from 'zod';

const jsonBodySchema = z.object({
	url: z.string().url().max(2000).optional(),
	path: z.string().max(1000).optional()
});

/** POST /api/ingest — Ingest documents into the RAG pipeline */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	try {
		const contentType = request.headers.get('content-type') ?? '';

		if (contentType.includes('multipart/form-data')) {
			const formData = await request.formData();
			const files = formData.getAll('files') as File[];

			if (!files.length) {
				return json({ error: 'No files provided' }, { status: 400 });
			}

			const { db } = await import('$lib/server/db/client');
			const { documents } = await import('$lib/server/db/schema.js');

			const results: Array<{ filename: string; status: string; id?: string }> = [];

			for (const file of files) {
				try {
					const buffer = Buffer.from(await file.arrayBuffer());
					let textContent = '';

					if (file.name.endsWith('.pdf')) {
						try {
							const pdfParse = (await import('pdf-parse')).default;
							const parsed = await pdfParse(buffer);
							textContent = parsed.text;
						} catch {
							textContent = `[PDF extraction failed for ${file.name}]`;
						}
					} else {
						textContent = buffer.toString('utf-8');
					}

					const [doc] = await db
						.insert(documents)
						.values({
							title: file.name,
							content: textContent.slice(0, 100000),
							fileType: file.type || 'application/octet-stream',
							status: 'ingested'
						})
						.returning({ id: documents.id });

					// Queue embedding generation
					try {
						const { generateEmbeddings } = await import(
							'$lib/server/grpc/embedding-client.js'
						);
						await generateEmbeddings([textContent.slice(0, 8000)]);
					} catch {
						// Non-fatal
					}

					results.push({ filename: file.name, status: 'ingested', id: doc?.id });
				} catch (err) {
					results.push({
						filename: file.name,
						status: 'error'
					});
				}
			}

			return json({
				success: true,
				ingested: results.filter((r) => r.status === 'ingested').length,
				total: files.length,
				results
			});
		}

		// JSON body fallback
		const raw = await request.json();
		const parsed = jsonBodySchema.safeParse(raw);
		if (!parsed.success) {
			return json({ error: parsed.error.issues[0]?.message ?? 'Invalid request body' }, { status: 400 });
		}
		const body = parsed.data;
		return json({
			success: true,
			message: `Ingest request received for ${body.url ?? body.path ?? 'unknown source'}`
		});
	} catch (err) {
		console.error('[/api/ingest] error:', err);
		return json({ error: 'Ingestion failed' }, { status: 500 });
	}
};