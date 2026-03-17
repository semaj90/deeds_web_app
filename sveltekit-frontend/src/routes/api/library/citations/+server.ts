import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { searchLawCitations } from '$lib/server/legal/law-citations';

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user?.id) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const query = url.searchParams.get('q')?.trim() ?? '';
	const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit') ?? 30)));

	try {
		const citations = await searchLawCitations(query, limit);
		return json({ citations, count: citations.length, query });
	} catch (error) {
		console.error('[api/library/citations] search failed:', error);
		return json({ error: 'Failed to search law citations', citations: [], count: 0, query }, { status: 500 });
	}
};