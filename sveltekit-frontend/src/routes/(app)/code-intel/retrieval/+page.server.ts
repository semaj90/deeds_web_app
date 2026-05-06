import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

const safe = <T>(p: Promise<T>, fb: T): Promise<T> => p.catch(() => fb);

export const load: PageServerLoad = async ({ locals, fetch, url }) => {
	if (!locals.user) throw redirect(303, '/login');
	const limit = url.searchParams.get('limit') ?? '30';
	const runs = await safe(fetch(`/api/code-intel/retrieval-runs?limit=${limit}`).then(r => r.json()), []);
	return { runs: Array.isArray(runs) ? runs : [] };
};
