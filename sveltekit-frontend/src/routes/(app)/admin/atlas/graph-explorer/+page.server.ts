import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) throw redirect(303, '/login?redirect=/admin/atlas/graph-explorer');
	if (locals.user.role !== 'admin') throw redirect(303, '/admin/atlas');
	return {};
};
