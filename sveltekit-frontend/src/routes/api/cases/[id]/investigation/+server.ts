import { json } from '@sveltejs/kit';
import { authorizeCaseActor, errorResponse } from '$lib/server/investigation/investigation-http-v1.js';
import { listInvestigation, listSummaryExports } from '$lib/server/investigation/investigation-v1.js';
import type { RequestHandler } from './$types';

/** Stable shape on success and failure: GET returns empty arrays rather than an error-only body. */
export const GET: RequestHandler = async ({ locals, params }) => {
	const access = await authorizeCaseActor(locals, params.id);
	if ('response' in access) return access.response;
	try {
		const [facets, exports] = await Promise.all([listInvestigation(params.id), listSummaryExports(params.id)]);
		return json({ success: true, data: { facets, exports }, message: 'OK' });
	} catch (cause) {
		return errorResponse(cause, 'overview');
	}
};
