import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { getLawCitationDetail } from '$lib/server/legal/law-citations';

export const load: PageServerLoad = async ({ params }) => {
	const rawCitation = decodeURIComponent(params.citation);

	try {
		const detail = await getLawCitationDetail(rawCitation, 160);
		if (!detail) {
			throw error(404, 'Law citation page not found');
		}

		return { detail };
	} catch (err) {
		console.error('[citations/law/[citation]] load error:', err);
		if (err && typeof err === 'object' && 'status' in err) throw err;
		throw error(500, 'Failed to load law citation page');
	}
};