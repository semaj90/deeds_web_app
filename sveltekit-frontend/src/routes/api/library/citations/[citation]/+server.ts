import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { getLawCitationDetail } from '$lib/server/legal/law-citations';

export const GET: RequestHandler = async ({ locals, params, url }) => {
	if (!locals.user?.id) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const citation = decodeURIComponent(params.citation);
	const limit = Math.min(200, Math.max(1, Number(url.searchParams.get('limit') ?? 24)));

	try {
		const detail = await getLawCitationDetail(citation, limit);
		if (!detail) {
			return json({ error: 'Citation not found' }, { status: 404 });
		}

		return json(detail);
	} catch (error) {
		console.error('[api/library/citations/[citation]] detail failed:', error);
		return json({ error: 'Failed to load law citation page' }, { status: 500 });
	}
};