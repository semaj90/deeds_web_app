import type { RequestHandler } from './$types';
import { json, error } from '@sveltejs/kit';
import { db } from '$lib/server/db/client';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { ENV } from '$lib/server/env.server.js';
import { recordSearchQuery } from '$lib/server/analytics/search-analytics.js';

const errorSearchSchema = z.object({
	errorMessage: z.string().max(50000).optional().default(''),
	filePath: z.string().max(1000).optional().default(''),
	limit: z.number().int().min(1).max(50).optional().default(10),
}).refine(d => d.errorMessage.trim() || d.filePath.trim(), {
	message: 'Provide errorMessage or filePath',
});

/**
 * POST /api/error-brain/search
 * Search knowledge base sources for error fix candidates
 * Sources: phase72_error table (DB) + Qdrant codebase_chunks_768 (vector) + CouchDB ace_synthesis (docs)
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	// Zod schema validates errorMessage/filePath (at least one required) + limit range
	const parsed = errorSearchSchema.safeParse(await request.json());
	if (!parsed.success) {
		throw error(400, parsed.error.issues[0]?.message ?? 'Invalid input');
	}

	const errorMessage = parsed.data.errorMessage;
	const filePath = parsed.data.filePath;
	const limit = parsed.data.limit;
	const searchQuery = errorMessage.trim() || filePath.trim();
	const escapedSearchQuery = searchQuery.slice(0, 100).replace(/[\\%_]/g, '\\$&');
	const searchPattern = `%${escapedSearchQuery}%`;
	recordSearchQuery({ query: searchQuery, pipeline: 'codebase', cacheHit: false, userId: locals.user.id });

	const sources: Array<{ type: string; id: string; content: string; relevance: number; metadata: Record<string, unknown> }> = [];
	let errorLogSearchStatus: 'searched' | 'unavailable' = 'searched';

	// Source 0: PostgreSQL error observations. This is distinct from phase72_error
	// historical fixes and remains a candidate source, not an admission decision.
	try {
		const errorLogResults = await db.execute(sql`
			SELECT id::text, error_category, severity, message, route_path, file_path,
			       line_number, packet_key, source_ref, resolved, created_at
			FROM public.error_logs
			WHERE message ILIKE ${searchPattern} ESCAPE '\\'
			   OR COALESCE(file_path, '') ILIKE ${searchPattern} ESCAPE '\\'
			   OR COALESCE(route_path, '') ILIKE ${searchPattern} ESCAPE '\\'
			ORDER BY created_at DESC
			LIMIT ${limit}
		`).catch(() => {
			errorLogSearchStatus = 'unavailable';
			return { rows: [] };
		});

		for (const row of errorLogResults.rows as Record<string, any>[]) {
			sources.push({
				type: 'error_log',
				id: String(row.id),
				content: `[${row.severity}] ${row.message}`,
				relevance: 0.5,
				metadata: {
					category: row.error_category,
					severity: row.severity,
					filePath: row.file_path,
					routePath: row.route_path,
					lineNumber: row.line_number,
					packetKey: row.packet_key,
					sourceRef: row.source_ref,
					resolved: row.resolved,
					createdAt: row.created_at,
					rankKind: 'lexical_candidate',
				},
			});
		}
	} catch (e) {
		errorLogSearchStatus = 'unavailable';
		console.warn('[error-brain/search] error_logs search failed:', (e as Error).message);
	}

	// Source 1: phase72_error — historical fixes from the DB
	try {
		const dbResults = await db.execute(sql`
			SELECT id, file_path, error_code, message, suggestion, status, created_at
			FROM phase72_error
			WHERE (
				message ILIKE ${searchPattern} ESCAPE '\\'
				OR COALESCE(file_path, '') ILIKE ${searchPattern} ESCAPE '\\'
			)
			AND suggestion IS NOT NULL
			AND suggestion != ''
			ORDER BY
				CASE WHEN status = 'fixed' THEN 0 ELSE 1 END,
				created_at DESC
			LIMIT ${limit}
		`).catch(() => ({ rows: [] }));

		for (const row of dbResults.rows as Record<string, any>[]) {
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
				collection: 'codebase_chunks_768',
				query: queryText,
				queryEmbedding: embedding,
				limit: Math.min(limit, 5),
				scoreThreshold: 0.3,
			});

			for (const hit of hits) {
				const p = (hit.payload ?? {}) as Record<string, unknown>;
				sources.push({
					type: 'codebase_chunk',
					id: String(hit.id),
					content: (p.content ?? p.text ?? '') as string,
					relevance: hit.score ?? 0.5,
					metadata: {
						filePath: (p.filePath ?? '') as string,
						language: (p.language ?? 'typescript') as string,
					},
				});
			}
		}
	} catch (e) {
		console.warn('[error-brain/search] Vector search failed:', (e as Error).message);
	}

	// Source 3: CouchDB ace_synthesis — cached AI analysis docs
	try {
		const couchUrl = ENV.COUCHDB_URL;
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
		errorLogSearchStatus,
		searchedDatabases: ['error_logs', 'phase72_error', 'qdrant:codebase_chunks_768', 'couchdb:ace_synthesis'],
	});
};
