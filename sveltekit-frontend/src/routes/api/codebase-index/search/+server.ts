/**
 * Semantic Codebase Search API
 * Endpoint: POST /api/codebase-index/search
 * Purpose: Vector search across codebase with KAG context
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getQdrantUrl, getOllamaBaseUrl } from '$lib/config/env.server.js';

const QDRANT_URL = getQdrantUrl();
const OLLAMA_URL = getOllamaBaseUrl();
const COLLECTION = 'codebase_chunks_768';

interface SearchResult {
	id: string;
	score: number;
	payload: {
		file_path: string;
		file_name: string;
		extension: string;
		content: string;
		chunk_index: number;
		total_chunks: number;
		domain?: string;
		complexity?: string;
		tags?: string[];
	};
}

export const POST: RequestHandler = async ({ request, fetch, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	try {
		const { query, limit = 10, vector = 'content' } = await request.json();

		if (!query) {
			return json({ error: 'Query is required' }, { status: 400 });
		}

		// Generate embedding
		const embedRes = await fetch(`${OLLAMA_URL}/api/embed`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: 'embeddinggemma:latest',
				input: query
			}),
			signal: AbortSignal.timeout(10_000)
		});

		if (!embedRes.ok) {
			return json({ error: 'Failed to generate embedding' }, { status: 500 });
		}

		const embedData = await embedRes.json();
		const embedding = embedData.embeddings[0];

		// Search Qdrant
		const searchRes = await fetch(
			`${QDRANT_URL}/collections/${COLLECTION}/points/query`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					query: embedding,
					using: vector,
					limit,
					with_payload: true
				}),
				signal: AbortSignal.timeout(10_000)
			}
		);

		if (!searchRes.ok) {
			return json({ error: 'Search failed' }, { status: 500 });
		}

		const searchData = await searchRes.json();
		const results: SearchResult[] = searchData.result.points || [];

		return json({
			query,
			results,
			total: results.length,
			vector_used: vector
		});
	} catch (error) {
		console.error('Codebase search error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
};
