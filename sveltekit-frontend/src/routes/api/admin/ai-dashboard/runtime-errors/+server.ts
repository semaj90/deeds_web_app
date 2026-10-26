import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { loadRuntimeErrorPriorities } from '$lib/server/atlas/board/runtime-error-priorities.js';

export const GET: RequestHandler = async ({ locals }) => {
	if (locals.user?.role !== 'admin') {
		return json(
			{ status: 'UNAVAILABLE', total: 0, top10: [], top100: [] },
			{ status: locals.user ? 403 : 401, headers: { 'Cache-Control': 'no-store' } },
		);
	}

	const report = await loadRuntimeErrorPriorities();
	return json(report, { headers: { 'Cache-Control': 'no-store' } });
};
