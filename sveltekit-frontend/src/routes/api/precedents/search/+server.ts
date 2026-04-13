import { pgRows } from '$lib/server/db/client';
/**
 * POST /api/precedents/search
 *
 * Search legal precedents (case opinions, rulings).
 * Uses PostgreSQL full-text search on title + summary with optional filters.
 * Also searches Qdrant 'legal_cases' collection for semantic similarity.
 *
 * Request body: { query: string, court?: string, caseId?: string, limit?: number }
 * Response: { results: PrecedentSearchResult[], timing: Timing }
 */
import { json, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db/client';
import { sql } from 'drizzle-orm';
import { ENV } from '$lib/server/env.server.js';
import { z } from 'zod';
import { ollamaFetch } from '$lib/server/ollama.js';

const OLLAMA_URL = ENV.OLLAMA_BASE_URL;
const QDRANT_URL = ENV.QDRANT_URL;
const EMBEDDING_MODEL = 'embeddinggemma:latest';

// Zod schema validates query (trimmed, 1-500), court, caseId, limit (1-100, default 20)
const precedentSearchSchema = z.object({
	query: z.string().trim().min(1, 'Missing query').max(500),
	court: z.string().max(200).optional(),
	caseId: z.string().max(500).optional(),
	limit: z.number().int().min(1).max(100).optional().default(20),
});

interface PrecedentSearchResult {
	id: string;
	title: string;
	summary: string;
	citation: string | null;
	court: string | null;
	caseId: string | null;
	decisionDate: string | null;
	similarity: number;
	source: 'postgres' | 'qdrant';
}

async function embedQuery(query: string): Promise<number[] | null> {
	try {
		const res = await ollamaFetch(`${OLLAMA_URL}/api/embeddings`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ model: EMBEDDING_MODEL, prompt: query }),
			signal: AbortSignal.timeout(8000)
		});
		if (!res.ok) return null;
		const data = await res.json();
		return Array.isArray(data.embedding) ? data.embedding : null;
	} catch {
		return null;
	}
}

async function searchQdrantCases(
	vector: number[],
	limit: number,
	caseId?: string
): Promise<PrecedentSearchResult[]> {
	try {
		const filter = caseId
			? { must: [{ key: 'case_id', match: { value: caseId } }] }
			: undefined;

		const res = await fetch(`${QDRANT_URL}/collections/legal_cases/points/search`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				vector,
				limit,
				with_payload: true,
				score_threshold: 0.30,
				filter
			}),
			signal: AbortSignal.timeout(5000)
		});

		if (!res.ok) return [];
		const data = await res.json();
		const hits = data.result ?? [];

		return hits.map((hit: Record<string, unknown>) => {
			const payload = hit.payload as Record<string, unknown> | undefined;
			return {
				id: String(hit.id),
				title: String(payload?.title ?? payload?.case_name ?? ''),
				summary: String(payload?.summary ?? payload?.content ?? payload?.text ?? ''),
				citation: payload?.citation ? String(payload.citation) : null,
				court: payload?.court ? String(payload.court) : null,
				caseId: payload?.case_id ? String(payload.case_id) : null,
				decisionDate: payload?.decision_date ? String(payload.decision_date) : null,
				similarity: Number(hit.score ?? 0),
				source: 'qdrant' as const
			};
		});
	} catch {
		return [];
	}
}

function mapPgRow(r: Record<string, unknown>): PrecedentSearchResult {
	return {
		id: String(r.id),
		title: String(r.title ?? ''),
		summary: String(r.summary ?? ''),
		citation: r.citation ? String(r.citation) : null,
		court: r.court ? String(r.court) : null,
		caseId: r.case_id ? String(r.case_id) : null,
		decisionDate: r.decision_date ? String(r.decision_date) : null,
		similarity: Number(r.similarity ?? 0),
		source: 'postgres'
	};
}

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	const start = performance.now();
	const parsed = precedentSearchSchema.safeParse(await request.json());
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
	}
	const { query, limit } = parsed.data;
	const court = parsed.data.court ?? null;
	const caseId = parsed.data.caseId;

	const timing: Record<string, number> = {};
	const courtPattern = court ? `%${court}%` : null;

	// Run embedding + text search in parallel
	const embedStart = performance.now();
	const [embedding, pgResults] = await Promise.all([
		embedQuery(query),
		(async () => {
			const pgStart = performance.now();
			try {
				let results;
				if (courtPattern && caseId) {
					results = await db.execute(sql`
						SELECT
							lp.id, lp.title, lp.summary, lp.citation, lp.court,
							lp.case_id, lp.decision_date,
							ts_rank(
								to_tsvector('english', lp.title || ' ' || lp.summary),
								plainto_tsquery('english', ${query})
							) AS similarity
						FROM legal_precedents lp
						WHERE to_tsvector('english', lp.title || ' ' || lp.summary)
							@@ plainto_tsquery('english', ${query})
							AND lp.court ILIKE ${courtPattern}
							AND lp.case_id = ${caseId}
						ORDER BY similarity DESC
						LIMIT ${limit}
					`);
				} else if (courtPattern) {
					results = await db.execute(sql`
						SELECT
							lp.id, lp.title, lp.summary, lp.citation, lp.court,
							lp.case_id, lp.decision_date,
							ts_rank(
								to_tsvector('english', lp.title || ' ' || lp.summary),
								plainto_tsquery('english', ${query})
							) AS similarity
						FROM legal_precedents lp
						WHERE to_tsvector('english', lp.title || ' ' || lp.summary)
							@@ plainto_tsquery('english', ${query})
							AND lp.court ILIKE ${courtPattern}
						ORDER BY similarity DESC
						LIMIT ${limit}
					`);
				} else if (caseId) {
					results = await db.execute(sql`
						SELECT
							lp.id, lp.title, lp.summary, lp.citation, lp.court,
							lp.case_id, lp.decision_date,
							ts_rank(
								to_tsvector('english', lp.title || ' ' || lp.summary),
								plainto_tsquery('english', ${query})
							) AS similarity
						FROM legal_precedents lp
						WHERE to_tsvector('english', lp.title || ' ' || lp.summary)
							@@ plainto_tsquery('english', ${query})
							AND lp.case_id = ${caseId}
						ORDER BY similarity DESC
						LIMIT ${limit}
					`);
				} else {
					results = await db.execute(sql`
						SELECT
							lp.id, lp.title, lp.summary, lp.citation, lp.court,
							lp.case_id, lp.decision_date,
							ts_rank(
								to_tsvector('english', lp.title || ' ' || lp.summary),
								plainto_tsquery('english', ${query})
							) AS similarity
						FROM legal_precedents lp
						WHERE to_tsvector('english', lp.title || ' ' || lp.summary)
							@@ plainto_tsquery('english', ${query})
						ORDER BY similarity DESC
						LIMIT ${limit}
					`);
				}

				timing.pg_search_ms = Math.round(performance.now() - pgStart);
				const rows = pgRows(results) as Record<string, unknown>[];
				return rows.map(mapPgRow);
			} catch (err) {
				console.error('[Precedents] PostgreSQL search failed:', err);
				timing.pg_search_ms = Math.round(performance.now() - pgStart);
				return [];
			}
		})()
	]);

	timing.embed_ms = Math.round(performance.now() - embedStart);

	// Qdrant semantic search (if embedding succeeded)
	let qdrantResults: PrecedentSearchResult[] = [];
	if (embedding) {
		const qdrantStart = performance.now();
		qdrantResults = await searchQdrantCases(embedding, limit, caseId);
		timing.qdrant_ms = Math.round(performance.now() - qdrantStart);
	}

	// Merge and deduplicate: Qdrant results take priority for same IDs
	const seen = new Set<string>();
	const merged: PrecedentSearchResult[] = [];

	// Interleave by normalized similarity score
	const allResults = [...qdrantResults, ...pgResults];
	allResults.sort((a, b) => b.similarity - a.similarity);

	for (const r of allResults) {
		const key = r.id || `${r.title}:${r.citation}`;
		if (!seen.has(key)) {
			seen.add(key);
			merged.push(r);
		}
		if (merged.length >= limit) break;
	}

	timing.total_ms = Math.round(performance.now() - start);

	return json({
		results: merged,
		count: merged.length,
		sources: {
			postgres: pgResults.length,
			qdrant: qdrantResults.length
		},
		timing,
		model: embedding ? EMBEDDING_MODEL : 'text-search-only'
	});
};
