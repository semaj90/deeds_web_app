/**
 * GET /api/tags/search — Semantic tag search via Qdrant
 * Query: ?q=contract+law&limit=10
 */
import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { searchTagsBySemantic } from '$lib/server/ace/tag-sync.js';
import { ENV } from '$lib/server/env.server.js';
import { ollamaFetch } from '$lib/server/ollama.js';

const querySchema = z.object({
	q: z.string().min(1, 'q parameter required').max(500),
	limit: z.coerce.number().int().min(1).max(50).default(10)
});

export const GET: RequestHandler = async ({ url }) => {
	const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'q parameter required' }, { status: 400 });
	}
	const { q: query, limit } = parsed.data;

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
