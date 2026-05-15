import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { recordSearchQuery } from '$lib/server/analytics/search-analytics.js';

const websearchSchema = z.object({
	query: z.string().min(1).max(5000),
	maxResults: z.number().min(1).max(20).default(5),
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

		const { ENV } = await import('$lib/server/env.server.js');
		const searxngUrl = ENV.SEARXNG_URL;

		try {
			const searchUrl = new URL('/search', searxngUrl);
			searchUrl.searchParams.set('q', query);
			searchUrl.searchParams.set('format', 'json');
			searchUrl.searchParams.set('categories', 'general');

			const res = await fetch(searchUrl.toString(), {
				signal: AbortSignal.timeout(10_000)
			});

			if (res.ok) {
				const data = await res.json();
				const results = (data.results ?? []).slice(0, maxResults).map(
					(r: Record<string, unknown>) => ({
						title: r.title ?? '',
						url: r.url ?? '',
						content: r.content ?? '',
						engine: r.engine ?? 'searxng'
					})
				);

				return json({ success: true, data: results });
			}
		} catch {
			// SearXNG unavailable
		}

		return json({ success: false, error: 'Search service unavailable', data: [] });
	} catch (err) {
		console.error('[/api/websearch] error:', err);
		return json({ success: false, error: 'Web search failed', data: [] }, { status: 500 });
	}
};
