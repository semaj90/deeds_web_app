/**
 * POST /api/web/search
 *
 * Web search endpoint for external knowledge retrieval.
 * Tries Google Custom Search → DuckDuckGo fallback.
 */
import { json, type RequestEvent } from '@sveltejs/kit';
import { webSearch } from '$lib/server/retrieval/web-search.js';
import { z } from 'zod';

const webSearchSchema = z.object({
	query: z.string().min(1, 'query is required').max(200),
	maxResults: z.number().int().min(1).max(10).optional().default(5)
});

export async function POST({ request }: RequestEvent) {
	const raw = await request.json();
	const parsed = webSearchSchema.safeParse(raw);
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
	}
	const { query, maxResults } = parsed.data;

	const response = await webSearch(query, maxResults);
	return json(response);
}