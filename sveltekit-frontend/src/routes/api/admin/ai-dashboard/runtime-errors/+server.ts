import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import {
	loadRankedRuntimeErrors,
	loadRuntimeErrorPriorities,
} from '$lib/server/atlas/board/runtime-error-priorities.js';

export const GET: RequestHandler = async ({ locals, url }) => {
	const exportLimit = url.searchParams.get('export');
	const limit = exportLimit === '10' ? 10 : exportLimit === '100' ? 100 : exportLimit === '1000' ? 1000 : null;
	const headers = { 'Cache-Control': 'no-store' };
	const empty = { status: 'UNAVAILABLE', total: 0, top10: [], top100: [], export: null };
	if (locals.user?.role !== 'admin') {
		return json(empty, { status: locals.user ? 403 : 401, headers });
	}

	if (exportLimit !== null) {
		if (limit === null || url.searchParams.getAll('export').length !== 1) {
			return json(empty, { status: 400, headers });
		}
		const report = await loadRankedRuntimeErrors(limit);
		if (report.status === 'UNAVAILABLE') return json(empty, { status: 503, headers });
		return json({
			status: report.status,
			total: report.total,
			top10: [],
			top100: [],
			export: {
				schema: 'atlas.runtime-error-priority-batch-export.v1',
				exportedAt: new Date().toISOString(),
				metadata: {
					status: report.status,
					windowDays: 30,
					limit,
					totalRankedGroups: report.total,
					exportedGroups: report.records.length,
					sourceTables: ['error_events', 'error_logs'],
					ordering: ['priorityScore DESC', 'occurrences DESC', 'lastSeen DESC', 'fingerprint ASC'],
					scoring: 'severity × logarithmic repeat count × 14-day exponential recency decay',
					fullStackTracesIncluded: false,
					applicationFramesIncluded: true,
					affectedFilesAreStackObservations: true,
					maxAffectedFilesPerGroup: 25,
				},
				records: report.records.map((record, index) => ({ rank: index + 1, ...record })),
			},
		}, { headers });
	}

	const report = await loadRuntimeErrorPriorities();
	return json({ ...report, export: null }, { headers });
};
