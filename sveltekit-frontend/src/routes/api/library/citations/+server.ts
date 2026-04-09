import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { searchLawCitations } from '$lib/server/legal/law-citations';

const querySchema = z.object({
	q: z.string().max(500).default(''),
	limit: z.coerce.number().int().min(1).max(100).default(30)
});

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user?.id) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
	}
	const { q: query, limit } = parsed.data;

	try {
		const citations = await searchLawCitations(query, limit);
		return json({ citations, count: citations.length, query });
	} catch (error) {
		console.error('[api/library/citations] search failed:', error);
		return json({ citations: [], count: 0, query });
	}
};