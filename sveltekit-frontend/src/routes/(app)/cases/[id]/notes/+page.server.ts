import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

/**
 * Notes sub-route load. Previously re-fetched the case independently; now
 * reads it from `await parent()` (layout already loaded the full row).
 *
 * caseData was truncated to {id, title, status, jurisdiction} in the prior
 * implementation. The layout now returns the FULL row — strictly additive,
 * so notes/+page.svelte continues to work unchanged.
 */
export const load: PageServerLoad = async ({ locals, parent }) => {
	if (!locals.user) {
		throw redirect(302, '/login');
	}

	const { caseData, loadError } = await parent();

	return {
		user: locals.user,
		caseData,
		loadError,
	};
};