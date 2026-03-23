import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { getLawCitationDetail } from '$lib/server/legal/law-citations';

const querySchema = z.object({
	limit: z.coerce.number().int().min(1).max(200).default(24)
});

export const GET: RequestHandler = async ({ locals, params, url }) => {
	if (!locals.user?.id) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const citation = decodeURIComponent(params.citation);
	const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
	const limit = parsed.success ? parsed.data.limit : 24;

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