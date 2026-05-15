import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

const safe = <T>(p: Promise<T>, fb: T): Promise<T> => p.catch(() => fb);

export const load: PageServerLoad = async ({ locals, fetch, url }) => {
	if (!locals.user) throw redirect(303, '/login');
	const limit = url.searchParams.get('limit') ?? '40';
	const [entries, stats] = await Promise.all([
		safe(fetch(`/api/code-intel/memory-gain?limit=${limit}`).then(r => r.json()), []),
		safe(fetch('/api/code-intel/memory-gain/stats').then(r => r.json()), []),
	]);
	return {
		entries: Array.isArray(entries) ? entries : [],
		stats: Array.isArray(stats) ? stats : [],
	};
};
