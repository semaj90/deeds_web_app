/**
 * GET /api/tags/search — Semantic tag search via Qdrant
 * Query: ?q=contract+law&limit=10
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { searchTagsBySemantic } from '$lib/server/ace/tag-sync.js';
import { ENV } from '$lib/server/env.server.js';
import { ollamaFetch } from '$lib/server/ollama.js';
import { executeEmbeddingInputV1 } from '$lib/server/embedding/embedding-execution-adapter-v1.js';

const querySchema = z.object({
	q: z.string().min(1, 'q parameter required').max(500),
	limit: z.coerce.number().int().min(1).max(50).default(10)
});

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'q parameter required' }, { status: 400 });
	}
	const { q: query, limit } = parsed.data;

	try {
		const embeddingResult = await executeEmbeddingInputV1({
			text: query,
			mode: 'unprompted_legacy',
			executor: async (prompt) => {
				const embedRes = await ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/embed`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ model: 'embeddinggemma:latest', input: prompt }),
					signal: AbortSignal.timeout(15_000),
				});
				if (!embedRes.ok) throw new Error(`EMBEDDING_HTTP_${embedRes.status}`);
				const embedData = await embedRes.json() as { embeddings?: unknown };
				return Array.isArray(embedData.embeddings) ? embedData.embeddings[0] : undefined;
			},
		});
		const queryEmbedding = embeddingResult.embedding;

		const results = await searchTagsBySemantic(queryEmbedding, limit);
		return json({ query, results, count: results.length });
	} catch (err) {
		return json({ query, results: [], count: 0 });
	}
};
