/**
 * POST /api/statutes/search
 *
 * Semantic search over statute_chunks using pgvector (768-dim).
 * Embeds the query via Ollama, then searches for similar statute chunks.
 * Joins parent statute metadata (title, jurisdiction, section, category).
 *
 * Request body: { query: string, jurisdiction?: string, category?: string, limit?: number }
 * Response: { results: StatuteSearchResult[], timing: Timing }
 */
import { json, type RequestHandler } from '@sveltejs/kit';
import db from '$lib/server/db';
import { sql } from 'drizzle-orm';
import { ENV } from '$lib/server/env.server.js';

const OLLAMA_URL = ENV.OLLAMA_BASE_URL;
const EMBEDDING_MODEL = 'embeddinggemma:latest';

interface StatuteSearchResult {
	chunkId: string;
	statuteId: string;
	statuteTitle: string;
	section: string | null;
	jurisdiction: string | null;
	category: string | null;
	chunkIndex: number;
	content: string;
	similarity: number;
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
	const jurisdiction = typeof body.jurisdiction === 'string' ? body.jurisdiction : null;
	const category = typeof body.category === 'string' ? body.category : null;
	const limit = Math.min(Math.max(Number(body.limit) || 20, 1), 100);

	if (!query) {
		return json({ error: 'Missing query' }, { status: 400 });
	}

	const timing: Record<string, number> = {};

	// 1. Embed the query
	const embedStart = performance.now();
	const embedding = await embedQuery(query);
	timing.embed_ms = Math.round(performance.now() - embedStart);

	if (!embedding) {
		return json({ error: 'Embedding service unavailable' }, { status: 503 });
	}

	// 2. Build pgvector cosine similarity query with optional filters
	const searchStart = performance.now();

	const vectorLiteral = `[${embedding.join(',')}]`;

	// Build WHERE clause dynamically
	const conditions: string[] = ['sc.embedding IS NOT NULL'];
	if (jurisdiction) {
		conditions.push(`s.jurisdiction ILIKE '%' || ${sql.raw(`'${jurisdiction.replace(/'/g, "''")}'`)} || '%'`);
	}
	if (category) {
		conditions.push(`s.category ILIKE '%' || ${sql.raw(`'${category.replace(/'/g, "''")}'`)} || '%'`);
	}
	const whereClause = conditions.join(' AND ');

	try {
		const results = await db.execute(sql.raw(`
			SELECT
				sc.id AS chunk_id,
				sc.statute_id,
				s.title AS statute_title,
				s.section,
				s.jurisdiction,
				s.category,
				sc.chunk_index,
				sc.content,
				1 - (sc.embedding::vector <=> '${vectorLiteral}'::vector) AS similarity
			FROM statute_chunks sc
			JOIN statutes s ON s.id = sc.statute_id
			WHERE ${whereClause}
			ORDER BY sc.embedding::vector <=> '${vectorLiteral}'::vector
			LIMIT ${limit}
		`));

		timing.search_ms = Math.round(performance.now() - searchStart);
		timing.total_ms = Math.round(performance.now() - start);

		const rows = [...results] as Record<string, unknown>[];
		const searchResults: StatuteSearchResult[] = rows.map((r) => ({
			chunkId: String(r.chunk_id),
			statuteId: String(r.statute_id),
			statuteTitle: String(r.statute_title ?? ''),
			section: r.section ? String(r.section) : null,
			jurisdiction: r.jurisdiction ? String(r.jurisdiction) : null,
			category: r.category ? String(r.category) : null,
			chunkIndex: Number(r.chunk_index),
			content: String(r.content ?? ''),
			similarity: Number(r.similarity ?? 0)
		}));

		return json({
			results: searchResults,
			count: searchResults.length,
			timing,
			model: EMBEDDING_MODEL
		});
	} catch (err) {
		console.error('[Statutes Search] Query failed:', err);

		// Fallback: text search if pgvector fails (e.g. no embeddings indexed yet)
		try {
			const textResults = await db.execute(sql.raw(`
				SELECT
					sc.id AS chunk_id,
					sc.statute_id,
					s.title AS statute_title,
					s.section,
					s.jurisdiction,
					s.category,
					sc.chunk_index,
					sc.content,
					ts_rank(to_tsvector('english', sc.content), plainto_tsquery('english', '${query.replace(/'/g, "''")}')) AS similarity
				FROM statute_chunks sc
				JOIN statutes s ON s.id = sc.statute_id
				WHERE to_tsvector('english', sc.content) @@ plainto_tsquery('english', '${query.replace(/'/g, "''")}')
				${jurisdiction ? `AND s.jurisdiction ILIKE '%${jurisdiction.replace(/'/g, "''")}%'` : ''}
				${category ? `AND s.category ILIKE '%${category.replace(/'/g, "''")}%'` : ''}
				ORDER BY similarity DESC
				LIMIT ${limit}
			`));

			timing.search_ms = Math.round(performance.now() - searchStart);
			timing.total_ms = Math.round(performance.now() - start);
			timing.fallback = 1;

			const rows = [...textResults] as Record<string, unknown>[];
			const searchResults: StatuteSearchResult[] = rows.map((r) => ({
				chunkId: String(r.chunk_id),
				statuteId: String(r.statute_id),
				statuteTitle: String(r.statute_title ?? ''),
				section: r.section ? String(r.section) : null,
				jurisdiction: r.jurisdiction ? String(r.jurisdiction) : null,
				category: r.category ? String(r.category) : null,
				chunkIndex: Number(r.chunk_index),
				content: String(r.content ?? ''),
				similarity: Number(r.similarity ?? 0)
			}));

			return json({
				results: searchResults,
				count: searchResults.length,
				timing,
				model: 'text-search-fallback'
			});
		} catch (fallbackErr) {
			console.error('[Statutes Search] Text fallback also failed:', fallbackErr);
			return json({ error: 'Search unavailable', results: [], timing }, { status: 503 });
		}
	}
};
