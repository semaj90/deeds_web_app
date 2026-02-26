/**
 * POST /api/web/search
 *
 * Web search endpoint for external knowledge retrieval.
 * Tries Google Custom Search → DuckDuckGo fallback.
 *
 * Body: { query: string, maxResults?: number }
 */
import { json, type RequestEvent } from '@sveltejs/kit';
import { webSearch } from '$lib/server/retrieval/web-search.js';

export async function POST({ request }: RequestEvent) {
	const body = await request.json();
	const { query, maxResults = 5 } = body as { query: string; maxResults?: number };

	if (!query || typeof query !== 'string') {
		return json({ error: 'query is required' }, { status: 400 });
	}

	const response = await webSearch(query.slice(0, 200), Math.min(maxResults, 10));
	return json(response);
}
