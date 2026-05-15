import type { PageServerLoad } from './$types';
import { searchLawCitations } from '$lib/server/legal/law-citations';

export const load: PageServerLoad = async ({ url }) => {
	const query = url.searchParams.get('q')?.trim() ?? '';

	try {
		const citations = await searchLawCitations(query, 60);
		return {
			query,
			citations,
			loadError: null,
		};
	} catch (error) {
		console.error('[citations/law] load error:', error);
		return {
			query,
			citations: [],
			loadError: 'Failed to load law citation pages',
		};
	}
};
