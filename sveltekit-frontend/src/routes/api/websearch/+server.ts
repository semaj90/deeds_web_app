import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { recordSearchQuery } from '$lib/server/analytics/search-analytics.js';
import { webSearch } from '$lib/server/retrieval/web-search.js';

const websearchSchema = z.object({
	query: z.string().min(1).max(5000),
	maxResults: z.number().int().min(1).max(20).default(5),
	engines: z.array(z.string()).optional()
});

/** POST /api/websearch — Web search via SearXNG */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	try {
		const raw = await request.json();
		const parsed = websearchSchema.safeParse(raw);
		if (!parsed.success) {
			return json(
				{ success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' },
				{ status: 400 }
			);
		}

		const { query, maxResults } = parsed.data;
		recordSearchQuery({ query, pipeline: 'contextual', cacheHit: false, userId: locals.user.id });

		try {
			const response = await webSearch(query, maxResults);
			const results = response.results.map((result) => ({
				title: result.title,
				url: result.url,
				content: result.snippet,
				engine: result.source
			}));

			if (results.length > 0) {
				return json({ success: true, data: results, provider: response.provider });
			}

			return json({ success: false, error: 'Search service returned no results', data: [], provider: response.provider });
		} catch {
			// Shared adapter exhausted its configured providers.
		}

		return json({ success: false, error: 'Search service unavailable', data: [], provider: 'none' });
	} catch (err) {
		console.error('[/api/websearch] error:', err);
		return json({ success: false, error: 'Web search failed', data: [], provider: 'none' }, { status: 500 });
	}
};
