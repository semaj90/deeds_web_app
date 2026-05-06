import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

const safe = <T>(p: Promise<T>, fb: T): Promise<T> => p.catch(() => fb);

export const load: PageServerLoad = async ({ locals, fetch }) => {
	if (!locals.user) throw redirect(303, '/login');
	const [gds, neo4jHealth] = await Promise.all([
		safe(fetch('/api/code-intel/graph/gds-status').then(r => r.json()), { status: 'unknown' }),
		safe(fetch('/api/code-intel/neo4j/health').then(r => r.json()), { status: 'unknown' }),
	]);
	return { gds, neo4jHealth };
};
