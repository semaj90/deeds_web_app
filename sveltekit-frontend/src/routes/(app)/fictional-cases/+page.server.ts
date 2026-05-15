import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url, fetch }) => {
	if (!locals.user) {
		throw redirect(302, '/login');
	}

	const category = url.searchParams.get('category') ?? '';
	const jurisdiction = url.searchParams.get('jurisdiction') ?? '';
	const q = url.searchParams.get('q') ?? '';
	const limit = Number(url.searchParams.get('limit')) || 20;
	const offset = Number(url.searchParams.get('offset')) || 0;

	const params = new URLSearchParams();
	if (category) params.set('category', category);
	if (jurisdiction) params.set('jurisdiction', jurisdiction);
	if (q) params.set('q', q);
	params.set('limit', String(limit));
	params.set('offset', String(offset));

	try {
		const res = await fetch(`/api/fictional-cases?${params.toString()}`);
		if (!res.ok) {
			return { cases: [], total: 0, categoryStats: [], filters: { category, jurisdiction, q }, pagination: { limit, offset, hasMore: false }, loadError: 'Failed to load fictional cases' };
		}
		const data = await res.json();
		return {
			cases: data.cases ?? [],
			total: data.total ?? 0,
			categoryStats: data.categoryStats ?? [],
			filters: { category, jurisdiction, q },
			pagination: { limit, offset, hasMore: (data.cases ?? []).length === limit },
			loadError: null,
		};
	} catch {
		return { cases: [], total: 0, categoryStats: [], filters: { category, jurisdiction, q }, pagination: { limit, offset, hasMore: false }, loadError: 'Database unavailable' };
	}
};
