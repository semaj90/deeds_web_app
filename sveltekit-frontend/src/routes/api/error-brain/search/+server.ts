import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db/client';
import { sql } from 'drizzle-orm';

/**
 * POST /api/error-brain/search
 * Search knowledge base sources for error fix candidates
 * Sources: phase72_error table (DB) + Qdrant codebase_chunks_768 (vector) + CouchDB ace_synthesis (docs)
 */
export const POST: RequestHandler = async ({ request }) => {
	const body = await request.json();
	if (!body?.errorMessage && !body?.filePath) {
		throw error(400, 'Provide errorMessage or filePath');
	}

	const errorMessage = body.errorMessage ?? '';
	const filePath = body.filePath ?? '';
	const limit = Math.min(Number(body.limit) || 10, 50);

	const sources: Array<{ type: string; id: string; content: string; relevance: number; metadata: Record<string, unknown> }> = [];

	// Source 1: phase72_error — historical fixes from the DB
	try {
		const dbResults = await db.execute(sql`
			SELECT id, file_path, error_code, message, suggestion, status, created_at
			FROM phase72_error
			WHERE (
				message ILIKE ${'%' + errorMessage.slice(0, 100) + '%'}
				OR file_path ILIKE ${'%' + filePath.split('/').pop() + '%'}
			)
			AND suggestion IS NOT NULL
			AND suggestion != ''
			ORDER BY
				CASE WHEN status = 'fixed' THEN 0 ELSE 1 END,
				created_at DESC
			LIMIT ${limit}
		`).catch(() => ({ rows: [] }));

		for (const row of dbResults.rows as any[]) {
			sources.push({
				type: 'historical_fix',
				id: row.id,
				content: `[${row.error_code}] ${row.message}\nSuggestion: ${row.suggestion}`,
				relevance: row.status === 'fixed' ? 0.9 : 0.6,
				metadata: { filePath: row.file_path, errorCode: row.error_code, status: row.status },
			});
		}
	} catch (e) {
		console.warn('[error-brain/search] DB search failed:', (e as Error).message);
	}

	// Source 2: Qdrant — semantic search over codebase chunks
	try {
		const { generateSingleEmbedding } = await import('$lib/server/grpc/embedding-client.js');
		const queryText = `${errorMessage} ${filePath}`.trim();
		const embedding = await generateSingleEmbedding(queryText.slice(0, 512));

		if (embedding?.length) {
			const { qdrant } = await import('$lib/server/vector/qdrant-manager.js');
			const { results: hits } = await qdrant.hybridSearch({
				collection: 'codebase_chunks_768' as any,
				query: queryText,
				queryEmbedding: embedding,
				limit: Math.min(limit, 5),
				scoreThreshold: 0.3,
			});

			for (const hit of hits) {
				sources.push({
					type: 'codebase_chunk',
					id: String(hit.id),
					content: (hit.payload as any)?.content ?? (hit.payload as any)?.text ?? '',
					relevance: hit.score ?? 0.5,
					metadata: {
						filePath: (hit.payload as any)?.filePath ?? '',
						language: (hit.payload as any)?.language ?? 'typescript',
					},
				});
			}
		}
	} catch (e) {
		console.warn('[error-brain/search] Vector search failed:', (e as Error).message);
	}

	// Source 3: CouchDB ace_synthesis — cached AI analysis docs
	try {
		const couchUrl = process.env.COUCHDB_URL ?? 'http://localhost:5984';
		const res = await fetch(`${couchUrl}/ace_synthesis/_all_docs?include_docs=true&limit=${Math.min(limit, 5)}`, {
			signal: AbortSignal.timeout(3000),
		});
		if (res.ok) {
			const data = await res.json();
			for (const row of data.rows ?? []) {
				if (row.doc?.summary) {
					sources.push({
						type: 'ace_synthesis',
						id: row.id,
						content: row.doc.summary,
						relevance: 0.4,
						metadata: { type: row.doc.type ?? 'synthesis' },
					});
				}
			}
		}
	} catch (e) {
		console.warn('[error-brain/search] CouchDB search failed:', (e as Error).message);
	}

	// Sort by relevance, dedupe
	sources.sort((a, b) => b.relevance - a.relevance);

	return json({
		query: { errorMessage, filePath },
		sources: sources.slice(0, limit),
		totalFound: sources.length,
		searchedDatabases: ['phase72_error', 'qdrant:codebase_chunks_768', 'couchdb:ace_synthesis'],
	});
};
