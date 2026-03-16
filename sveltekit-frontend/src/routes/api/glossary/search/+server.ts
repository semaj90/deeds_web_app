/**
 * POST /api/glossary/search
 *
 * Search legal glossary terms using:
 *   1. pgvector semantic similarity (if embeddings exist)
 *   2. Full-text search on term + definition (fallback)
 *   3. ILIKE prefix match for autocomplete-style queries
 *
 * Request body: { query: string, category?: string, limit?: number }
 * Response: { results: GlossaryResult[], timing: Timing }
 */
import { json, type RequestHandler } from '@sveltejs/kit';
import db from '$lib/server/db';
import { sql } from 'drizzle-orm';
import { ENV } from '$lib/server/env.server.js';
import { z } from 'zod';
import { ollamaFetch } from '$lib/server/ollama.js';

const OLLAMA_URL = ENV.OLLAMA_BASE_URL;
const EMBEDDING_MODEL = 'embeddinggemma:latest';

// Zod schema validates query (trimmed, 1-500), category, limit (1-100, default 20)
const glossarySearchSchema = z.object({
	query: z.string().trim().min(1, 'Missing query').max(500),
	category: z.string().max(200).optional(),
	limit: z.number().int().min(1).max(100).optional().default(20),
});

interface GlossaryResult {
	id: string;
	term: string;
	definition: string;
	category: string | null;
	jurisdiction: string | null;
	relatedTerms: string[];
	sources: string[];
	similarity: number;
	matchType: 'semantic' | 'fulltext' | 'prefix';
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

function mapRow(r: Record<string, unknown>, matchType: GlossaryResult['matchType']): GlossaryResult {
	return {
		id: String(r.id),
		term: String(r.term ?? ''),
		definition: String(r.definition ?? ''),
		category: r.category ? String(r.category) : null,
		jurisdiction: r.jurisdiction ? String(r.jurisdiction) : null,
		relatedTerms: Array.isArray(r.related_terms) ? r.related_terms as string[] : [],
		sources: Array.isArray(r.sources) ? r.sources as string[] : [],
		similarity: Number(r.similarity ?? 0),
		matchType
	};
}

export const POST: RequestHandler = async ({ request }) => {
	const start = performance.now();
	const parsed = glossarySearchSchema.safeParse(await request.json());
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
	}
	const { query, limit } = parsed.data;
	const category = parsed.data.category ?? null;

	const timing: Record<string, number> = {};
	const categoryPattern = category ? `%${category}%` : null;

	// Check if the table exists (graceful degradation)
	try {
		await db.execute(sql`SELECT 1 FROM legal_glossary LIMIT 0`);
	} catch {
		return json({
			results: [],
			count: 0,
			timing: { total_ms: Math.round(performance.now() - start) },
			error: 'legal_glossary table not yet created. Run migration first.'
		});
	}

	// Strategy 1: Try semantic search with pgvector
	const embedStart = performance.now();
	const embedding = await embedQuery(query);
	timing.embed_ms = Math.round(performance.now() - embedStart);

	const results: GlossaryResult[] = [];
	const seen = new Set<string>();

	if (embedding) {
		const vectorLiteral = `[${embedding.join(',')}]`;
		try {
			const semanticStart = performance.now();
			const semanticResults = categoryPattern
				? await db.execute(sql`
					SELECT
						lg.id, lg.term, lg.definition, lg.category, lg.jurisdiction,
						lg.related_terms, lg.sources,
						1 - (lg.embedding::vector <=> ${vectorLiteral}::vector) AS similarity
					FROM legal_glossary lg
					WHERE lg.embedding IS NOT NULL
						AND lg.category ILIKE ${categoryPattern}
					ORDER BY lg.embedding::vector <=> ${vectorLiteral}::vector
					LIMIT ${limit}
				`)
				: await db.execute(sql`
					SELECT
						lg.id, lg.term, lg.definition, lg.category, lg.jurisdiction,
						lg.related_terms, lg.sources,
						1 - (lg.embedding::vector <=> ${vectorLiteral}::vector) AS similarity
					FROM legal_glossary lg
					WHERE lg.embedding IS NOT NULL
					ORDER BY lg.embedding::vector <=> ${vectorLiteral}::vector
					LIMIT ${limit}
				`);
			timing.semantic_ms = Math.round(performance.now() - semanticStart);

			const rows = [...semanticResults] as Record<string, unknown>[];
			for (const r of rows) {
				const id = String(r.id);
				if (!seen.has(id)) {
					seen.add(id);
					results.push(mapRow(r, 'semantic'));
				}
			}
		} catch {
			// pgvector may not be set up — continue to text search
		}
	}

	// Strategy 2: Full-text search (catches results without embeddings)
	if (results.length < limit) {
		const remaining = limit - results.length;
		try {
			const ftsStart = performance.now();
			const ftsResults = categoryPattern
				? await db.execute(sql`
					SELECT
						lg.id, lg.term, lg.definition, lg.category, lg.jurisdiction,
						lg.related_terms, lg.sources,
						ts_rank(
							to_tsvector('english', lg.term || ' ' || lg.definition),
							plainto_tsquery('english', ${query})
						) AS similarity
					FROM legal_glossary lg
					WHERE to_tsvector('english', lg.term || ' ' || lg.definition)
						@@ plainto_tsquery('english', ${query})
						AND lg.category ILIKE ${categoryPattern}
					ORDER BY similarity DESC
					LIMIT ${remaining}
				`)
				: await db.execute(sql`
					SELECT
						lg.id, lg.term, lg.definition, lg.category, lg.jurisdiction,
						lg.related_terms, lg.sources,
						ts_rank(
							to_tsvector('english', lg.term || ' ' || lg.definition),
							plainto_tsquery('english', ${query})
						) AS similarity
					FROM legal_glossary lg
					WHERE to_tsvector('english', lg.term || ' ' || lg.definition)
						@@ plainto_tsquery('english', ${query})
					ORDER BY similarity DESC
					LIMIT ${remaining}
				`);
			timing.fulltext_ms = Math.round(performance.now() - ftsStart);

			const rows = [...ftsResults] as Record<string, unknown>[];
			for (const r of rows) {
				const id = String(r.id);
				if (!seen.has(id)) {
					seen.add(id);
					results.push(mapRow(r, 'fulltext'));
				}
			}
		} catch {
			// full-text search failed
		}
	}

	// Strategy 3: Prefix match (for autocomplete / short queries)
	if (results.length < limit && query.length >= 2) {
		const remaining = limit - results.length;
		const prefixPattern = `${query}%`;
		try {
			const prefixStart = performance.now();
			const prefixResults = categoryPattern
				? await db.execute(sql`
					SELECT
						lg.id, lg.term, lg.definition, lg.category, lg.jurisdiction,
						lg.related_terms, lg.sources,
						0.5 AS similarity
					FROM legal_glossary lg
					WHERE lg.term ILIKE ${prefixPattern}
						AND lg.category ILIKE ${categoryPattern}
					ORDER BY lg.term
					LIMIT ${remaining}
				`)
				: await db.execute(sql`
					SELECT
						lg.id, lg.term, lg.definition, lg.category, lg.jurisdiction,
						lg.related_terms, lg.sources,
						0.5 AS similarity
					FROM legal_glossary lg
					WHERE lg.term ILIKE ${prefixPattern}
					ORDER BY lg.term
					LIMIT ${remaining}
				`);
			timing.prefix_ms = Math.round(performance.now() - prefixStart);

			const rows = [...prefixResults] as Record<string, unknown>[];
			for (const r of rows) {
				const id = String(r.id);
				if (!seen.has(id)) {
					seen.add(id);
					results.push(mapRow(r, 'prefix'));
				}
			}
		} catch {
			// prefix search failed
		}
	}

	timing.total_ms = Math.round(performance.now() - start);

	return json({
		results,
		count: results.length,
		timing,
		model: embedding ? EMBEDDING_MODEL : 'text-search-only'
	});
};
