/**
 * GET /api/analytics/similar-queries?q=<query>&limit=5
 *
 * Finds similar past search queries by embedding the input and searching
 * the user_searches Qdrant collection. Returns top-N matches with timestamps.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { qdrant } from '$lib/server/vector/qdrant-manager.js';
import { generateEmbedding } from '$lib/server/ai/embeddings-simple.js';

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const query = url.searchParams.get('q')?.trim();
	const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '5', 10) || 5, 20);

	if (!query) {
		return json({ similarQueries: [], total: 0 });
	}

	try {
		const embedding = await generateEmbedding(query);
		if (!embedding || embedding.length === 0) {
			return json({ similarQueries: [], total: 0 });
		}

		const results = await qdrant.client.search('user_searches', {
			vector: embedding,
			limit,
			with_payload: true,
			filter: {
				must: [
					{ key: 'user_id', match: { value: locals.user.id } },
				],
			},
		});

		const similarQueries = results.map((r) => ({
			query: (r.payload as Record<string, unknown>)?.query_text ?? '',
			score: Math.round((r.score ?? 0) * 1000) / 1000,
			timestamp: (r.payload as Record<string, unknown>)?.created_at ?? null,
			eventType: (r.payload as Record<string, unknown>)?.event_type ?? 'search',
		}));

		return json({ similarQueries, total: similarQueries.length });
	} catch (err) {
		console.warn('[Analytics] Similar queries search failed:', (err as Error).message);
		return json({ similarQueries: [], total: 0 });
	}
};
