import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, params, fetch }) => {
	if (!locals.user) {
		throw redirect(302, '/login');
	}

	try {
		const res = await fetch(`/api/fictional-cases/${params.id}`);
		if (!res.ok) {
			return { caseData: null, loadError: res.status === 404 ? 'Case not found' : 'Failed to load case' };
		}
		const caseData = await res.json();
		return { caseData, loadError: null };
	} catch {
		return { caseData: null, loadError: 'Database unavailable' };
	}
};