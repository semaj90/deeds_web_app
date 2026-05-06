import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

const safe = <T>(p: Promise<T>, fb: T): Promise<T> => p.catch(() => fb);

export const load: PageServerLoad = async ({ locals, fetch, url }) => {
	if (!locals.user) throw redirect(303, '/login');
	const limit = url.searchParams.get('limit') ?? '20';
	const clusters = await safe(fetch(`/api/code-intel/clusters?limit=${limit}`).then(r => r.json()), []);
	return { clusters: Array.isArray(clusters) ? clusters : [] };
};
