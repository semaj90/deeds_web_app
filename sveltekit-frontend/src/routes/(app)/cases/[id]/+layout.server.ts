import { error, redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types';
import { getAuthorizedCase } from '$lib/server/case-access.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Case detail layout load. Fetches the full case row once at the layout level
 * so every sub-route (/board, /canvas, /chat, /evidence, /notes, /overview,
 * /persons, /reports, /ai) can read it via `await parent()` without re-fetching.
 *
 * Returns the FULL case row (previously truncated to 4 fields). Sub-routes
 * that only need {id, title, status, jurisdiction} still work; sub-routes that
 * need more fields (caseNumber, practiceArea, etc.) no longer have to re-query.
 *
 * Every case-specific child must await this parent before reading case data or
 * consulting a cache so membership is established first.
 */
export const load: LayoutServerLoad = async ({ locals, params, depends }) => {
	if (!locals.user) {
		throw redirect(302, '/login');
	}

	// UUID guard prevents noisy 400s on malformed IDs.
	if (!UUID_RE.test(params.id)) {
		throw error(404, 'Case not found');
	}

	const actorId = Number(locals.user.id);
	if (!Number.isInteger(actorId) || actorId <= 0) throw error(404, 'Case not found');
	depends(`app:case-detail:${params.id}`);
	const caseRow = await getAuthorizedCase(params.id, actorId);
	if (!caseRow) throw error(404, 'Case not found');

	return {
		caseData:  caseRow,
		loadError: null,
	};
};
