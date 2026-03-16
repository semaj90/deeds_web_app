/**
 * GET /api/tags/search — Semantic tag search via Qdrant
 * Query: ?q=contract+law&limit=10
 */
import { json, type RequestHandler } from '@sveltejs/kit';
import { searchTagsBySemantic } from '$lib/server/ace/tag-sync.js';
import { ENV } from '$lib/server/env.server.js';
import { ollamaFetch } from '$lib/server/ollama.js';

export const GET: RequestHandler = async ({ url }) => {
	const query = url.searchParams.get('q') ?? '';
	const limit = Math.min(Number(url.searchParams.get('limit') ?? 10), 50);

	if (!query) {
		return json({ error: 'q parameter required' }, { status: 400 });
	}

	try {
		// Embed query
		const OLLAMA_URL = ENV.OLLAMA_BASE_URL;
		const embedRes = await ollamaFetch(OLLAMA_URL + '/api/embed', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ model: 'embeddinggemma:latest', input: query })
		});

		if (!embedRes.ok) {
			return json({ error: 'Embedding service unavailable' }, { status: 503 });
		}

		const embedData = (await embedRes.json()) as { embeddings?: number[][] };
		const queryEmbedding = embedData.embeddings?.[0];

		if (!queryEmbedding) {
			return json({ error: 'Failed to generate query embedding' }, { status: 500 });
		}

		const results = await searchTagsBySemantic(queryEmbedding, limit);
		return json({ query, results, count: results.length });
	} catch (err) {
		return json(
			{ error: 'Search failed', message: err instanceof Error ? err.message : String(err) },
			{ status: 500 }
		);
	}
};
