import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db/client';
import { eq, desc } from 'drizzle-orm';

const contextSchema = z.object({
	query: z.string().min(1).max(10000),
	caseId: z.string().uuid().optional(),
	evidenceId: z.string().uuid().optional(),
	limit: z.number().min(1).max(20).optional().default(5)
});

/** POST /api/ai/context — Retrieve relevant documents and citations for a query */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	try {
		const raw = await request.json();
		const parsed = contextSchema.safeParse(raw);
		if (!parsed.success) {
			return json({ message: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
		}

		const { query, caseId, limit } = parsed.data;
		const documents: Array<{ id: string; title: string; type: string }> = [];
		const citations: Array<{ id: string; text: string }> = [];

		// Fetch case-related evidence as context documents
		if (caseId) {
			try {
				const { evidence } = await import('$lib/server/db/schema-postgres.js');
				const evidenceRows = await db
					.select({
						id: evidence.id,
						title: evidence.title,
						fileType: evidence.fileType
					})
					.from(evidence)
					.where(eq(evidence.caseId, caseId))
					.orderBy(desc(evidence.createdAt))
					.limit(limit);

				for (const row of evidenceRows) {
					documents.push({
						id: row.id,
						title: row.title ?? 'Untitled Evidence',
						type: row.fileType ?? 'document'
					});
				}
			} catch {
				// Evidence table may not exist
			}

			// Fetch case-linked citations
			try {
				const { citations: citationsTable } = await import('$lib/server/db/schema-postgres.js');
				const citationRows = await db
					.select({
						id: citationsTable.id,
						citationType: citationsTable.citationType,
						quotedText: citationsTable.quotedText,
						formattedCitation: citationsTable.formattedCitation
					})
					.from(citationsTable)
					.where(eq(citationsTable.caseId, caseId))
					.limit(limit);

				for (const row of citationRows) {
					citations.push({
						id: row.id,
						text: row.formattedCitation || row.quotedText || row.citationType
					});
				}
			} catch {
				// Citations table may not exist
			}
		}

		// Attempt vector search for query-relevant documents
		try {
			const { QdrantClient } = await import('@qdrant/js-client-rest');
			const { generateEmbeddings } = await import('$lib/server/grpc/embedding-client.js');
			const embResult = await generateEmbeddings([query]);
			const embedding = embResult?.vectors?.[0];

			if (embedding?.length === 768) {
				const { ENV: env } = await import('$lib/server/env.server.js');
				const client = new QdrantClient({ url: env.QDRANT_URL });
				const results = await client.search('legal_documents', {
					vector: embedding,
					limit,
					with_payload: true
				});
				for (const result of results) {
					const payload = result.payload as Record<string, unknown> | null;
					if (payload) {
						documents.push({
							id: String(result.id),
							title: String(payload.title ?? payload.filename ?? 'Document'),
							type: String(payload.type ?? 'vector-match')
						});
					}
				}
			}
		} catch {
			// Vector search unavailable — return DB-only results
		}

		return json({ documents, citations });
	} catch (err) {
		console.error('[/api/ai/context] error:', err);
		return json({ documents: [], citations: [] }, { status: 500 });
	}
};