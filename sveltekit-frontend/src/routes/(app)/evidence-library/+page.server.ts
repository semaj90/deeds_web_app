import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals }) => {
	if (!locals.user) throw redirect(302, '/login');
	const caseId = url.searchParams.get('caseId') ?? '';
	return { caseId };
};
