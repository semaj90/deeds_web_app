import { pgRows } from '$lib/server/db/client';
/**
 * Codebase Wiki API
 * GPU-accelerated semantic search with cosine retrieval
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { db } from '$lib/server/db/client';
import { sql } from 'drizzle-orm';
import { tryEmbedOllama } from '$lib/server/embedding/ollama-embed.js';

const wikiSearchSchema = z.object({
	query: z.string().min(1, 'query is required').max(500),
	limit: z.number().int().min(1).max(100).optional().default(10),
	domain: z.string().optional()
});

// GET /api/codebase/wiki - List wiki pages
export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) {
		return json({ pages: [], total: 0 }, { status: 401 });
	}

	try {
		const limit = parseInt(url.searchParams.get('limit') || '20');
		const category = url.searchParams.get('category');

		const result = await db.execute(
			category
				? sql`SELECT * FROM codebase_wiki_pages WHERE category = ${category} ORDER BY pagerank_score DESC LIMIT ${limit}`
				: sql`SELECT * FROM codebase_wiki_pages ORDER BY pagerank_score DESC LIMIT ${limit}`
		);

		return json({
			pages: pgRows(result),
			total: pgRows(result).length
		});
	} catch (error) {
		console.error('Wiki list error:', error);
		return json({ pages: [], total: 0 });
	}
};

// POST /api/codebase/wiki - Semantic search
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		return json({ results: [] }, { status: 401 });
	}

	try {
		const body = await request.json();
		const parsed = wikiSearchSchema.safeParse(body);

		if (!parsed.success) {
			return json(
				{ results: [], error: parsed.error.issues[0]?.message ?? 'Invalid input' },
				{ status: 400 }
			);
		}

		const { query, limit, domain } = parsed.data;

		// Generate embedding for the search query
		const embeddingResult = await tryEmbedOllama(query, { timeoutMs: 5000 });

		if (!embeddingResult || !embeddingResult.embedding) {
			return json({
				results: [],
				error: 'Failed to generate embedding',
				query
			});
		}

		// Convert embedding to PostgreSQL vector format
		const embeddingStr = `[${embeddingResult.embedding.join(',')}]`;

		// Call the semantic search function (0.3 threshold for broader recall)
		const searchResult = await db.execute(
			domain
				? sql`SELECT * FROM codebase_semantic_search(
						${embeddingStr}::vector(768),
						${limit}::integer,
						0.3::real,
						${domain}::text
					)`
				: sql`SELECT * FROM codebase_semantic_search(
						${embeddingStr}::vector(768),
						${limit}::integer,
						0.3::real,
						NULL
					)`
		);

		// Map similarity_score → similarity for consistent API response
		const results = (pgRows(searchResult) || []).map((r: any) => ({
			...r,
			similarity: r.similarity_score
		}));

		return json({
			results,
			query,
			model: embeddingResult.model,
			totalResults: results.length
		});
	} catch (error: any) {
		console.error('Semantic search error:', error);
		return json({
      results: [],
      error: 'Semantic search failed',
      query: '',
    });
	}
};
