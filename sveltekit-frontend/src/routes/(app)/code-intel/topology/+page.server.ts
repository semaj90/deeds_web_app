import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

const safe = <T>(p: Promise<T>, fb: T): Promise<T> => p.catch(() => fb);

export const load: PageServerLoad = async ({ locals, fetch, url }) => {
	if (!locals.user) throw redirect(303, '/login');
	const snapshotId = url.searchParams.get('snapshotId') ?? undefined;
	const qs = snapshotId ? `?snapshotId=${snapshotId}` : '';
	const data = await safe(fetch(`/api/code-intel/topology${qs}`).then(r => r.json()), null);
	return { snapshot: data?.snapshot ?? null, nodes: data?.nodes ?? [] };
};
