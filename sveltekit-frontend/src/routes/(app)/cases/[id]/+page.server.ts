import type { PageServerLoad } from './$types';

/**
 * Case detail root load. Per triage doc §3 Proposal 5: previously a pure
 * redirect guard, forcing 8 child routes (/board, /canvas, /chat, /evidence,
 * /notes, /overview, /persons, /reports) to each re-fetch the case
 * independently. This load now fetches once and exposes the case via
 * parent() so child routes inherit graceful 404 handling.
 *
 * Child route usage:
 *   const { case: caseRow, loadError } = await parent();
 *   if (loadError || !caseRow) return { ... };
 */
export const load: PageServerLoad = async ({ locals, parent }) => {
	const { caseData, loadError } = await parent();
	return {
		user: locals.user,
		case: caseData,
		loadError
	};
};
