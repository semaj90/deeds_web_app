import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals, fetch }) => {
	if (!locals.user) throw redirect(303, '/login?redirect=/admin/atlas/ontology');
	if (locals.user.role !== 'admin') throw redirect(303, '/admin/atlas');

	const data = await fetch('/api/admin/atlas/ontology-resolution')
		.then(async (r) => (r.ok ? await r.json() : null))
		.catch(() => null);

	return {
		migrationApplied: data?.migrationApplied ?? false,
		vocabulary: data?.vocabulary ?? [],
		resolutionStats: data?.resolutionStats ?? null,
		totalTuples: data?.totalTuples ?? 0,
		oakKernel: data?.oakKernel ?? { reachable: false },
	};
};
