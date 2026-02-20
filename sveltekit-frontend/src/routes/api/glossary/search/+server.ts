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

const OLLAMA_URL = ENV.OLLAMA_BASE_URL;
const EMBEDDING_MODEL = 'embeddinggemma:latest';

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
		const res = await fetch(`${OLLAMA_URL}/api/embeddings`, {
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

export const POST: RequestHandler = async ({ request }) => {
	const start = performance.now();
	const body = await request.json();
	const query = typeof body.query === 'string' ? body.query.trim() : '';
	const category = typeof body.category === 'string' ? body.category : null;
	const limit = Math.min(Math.max(Number(body.limit) || 20, 1), 100);

	if (!query) {
		return json({ error: 'Missing query' }, { status: 400 });
	}

	const timing: Record<string, number> = {};
	const sanitizedQuery = query.replace(/'/g, "''");
	const categoryFilter = category
		? `AND lg.category ILIKE '%${category.replace(/'/g, "''")}%'`
		: '';

	// Check if the table exists (graceful degradation)
	try {
		await db.execute(sql.raw(`SELECT 1 FROM legal_glossary LIMIT 0`));
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
			const semanticResults = await db.execute(sql.raw(`
				SELECT
					lg.id, lg.term, lg.definition, lg.category, lg.jurisdiction,
					lg.related_terms, lg.sources,
					1 - (lg.embedding::vector <=> '${vectorLiteral}'::vector) AS similarity
				FROM legal_glossary lg
				WHERE lg.embedding IS NOT NULL ${categoryFilter}
				ORDER BY lg.embedding::vector <=> '${vectorLiteral}'::vector
				LIMIT ${limit}
			`));
			timing.semantic_ms = Math.round(performance.now() - semanticStart);

			const rows = [...semanticResults] as Record<string, unknown>[];
			for (const r of rows) {
				const id = String(r.id);
				if (!seen.has(id)) {
					seen.add(id);
					results.push({
						id,
						term: String(r.term ?? ''),
						definition: String(r.definition ?? ''),
						category: r.category ? String(r.category) : null,
						jurisdiction: r.jurisdiction ? String(r.jurisdiction) : null,
						relatedTerms: Array.isArray(r.related_terms) ? r.related_terms as string[] : [],
						sources: Array.isArray(r.sources) ? r.sources as string[] : [],
						similarity: Number(r.similarity ?? 0),
						matchType: 'semantic'
					});
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
			const ftsResults = await db.execute(sql.raw(`
				SELECT
					lg.id, lg.term, lg.definition, lg.category, lg.jurisdiction,
					lg.related_terms, lg.sources,
					ts_rank(
						to_tsvector('english', lg.term || ' ' || lg.definition),
						plainto_tsquery('english', '${sanitizedQuery}')
					) AS similarity
				FROM legal_glossary lg
				WHERE to_tsvector('english', lg.term || ' ' || lg.definition)
					@@ plainto_tsquery('english', '${sanitizedQuery}')
					${categoryFilter}
				ORDER BY similarity DESC
				LIMIT ${remaining}
			`));
			timing.fulltext_ms = Math.round(performance.now() - ftsStart);

			const rows = [...ftsResults] as Record<string, unknown>[];
			for (const r of rows) {
				const id = String(r.id);
				if (!seen.has(id)) {
					seen.add(id);
					results.push({
						id,
						term: String(r.term ?? ''),
						definition: String(r.definition ?? ''),
						category: r.category ? String(r.category) : null,
						jurisdiction: r.jurisdiction ? String(r.jurisdiction) : null,
						relatedTerms: Array.isArray(r.related_terms) ? r.related_terms as string[] : [],
						sources: Array.isArray(r.sources) ? r.sources as string[] : [],
						similarity: Number(r.similarity ?? 0),
						matchType: 'fulltext'
					});
				}
			}
		} catch {
			// full-text search failed
		}
	}

	// Strategy 3: Prefix match (for autocomplete / short queries)
	if (results.length < limit && query.length >= 2) {
		const remaining = limit - results.length;
		try {
			const prefixStart = performance.now();
			const prefixResults = await db.execute(sql.raw(`
				SELECT
					lg.id, lg.term, lg.definition, lg.category, lg.jurisdiction,
					lg.related_terms, lg.sources,
					0.5 AS similarity
				FROM legal_glossary lg
				WHERE lg.term ILIKE '${sanitizedQuery}%'
					${categoryFilter}
				ORDER BY lg.term
				LIMIT ${remaining}
			`));
			timing.prefix_ms = Math.round(performance.now() - prefixStart);

			const rows = [...prefixResults] as Record<string, unknown>[];
			for (const r of rows) {
				const id = String(r.id);
				if (!seen.has(id)) {
					seen.add(id);
					results.push({
						id,
						term: String(r.term ?? ''),
						definition: String(r.definition ?? ''),
						category: r.category ? String(r.category) : null,
						jurisdiction: r.jurisdiction ? String(r.jurisdiction) : null,
						relatedTerms: Array.isArray(r.related_terms) ? r.related_terms as string[] : [],
						sources: Array.isArray(r.sources) ? r.sources as string[] : [],
						similarity: 0.5,
						matchType: 'prefix'
					});
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