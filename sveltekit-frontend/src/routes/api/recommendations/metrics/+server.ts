/**
 * GET /api/recommendations/metrics
 * Returns recommendation metrics summary + optional export data.
 *
 * Query params:
 *   ?period=24h|7d|30d (default: 7d)
 *   ?export=true        (include hourly breakdown + A/B tests)
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url }) => {
	try {
		const { recommendationMetrics } = await import(
			'$lib/server/ml/recommendation-metrics.js'
		);

		const period = (url.searchParams.get('period') ?? '7d') as '24h' | '7d' | '30d';
		const wantExport = url.searchParams.get('export') === 'true';

		if (wantExport) {
			const data = await recommendationMetrics.getExportData(period);
			return json(data);
		}

		const summary = await recommendationMetrics.getSummary(period);
		return json(summary);
	} catch (err) {
		console.error('[API] /api/recommendations/metrics error:', err);
		return json(
			{ error: 'Failed to fetch recommendation metrics' },
			{ status: 500 }
		);
	}
};
