/**
 * GET /api/recommendations/metrics
 * Returns recommendation metrics summary + optional export data.
 *
 * Query params:
 *   ?period=24h|7d|30d (default: 7d)
 *   ?export=true        (include hourly breakdown + A/B tests)
 */

import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';

const querySchema = z.object({
	period: z.enum(['24h', '7d', '30d']).default('7d'),
	export: z.enum(['true', 'false']).default('false')
});

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	try {
		const { recommendationMetrics } = await import(
			'$lib/server/ml/recommendation-metrics.js'
		);

		const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
		const { period, export: exportFlag } = parsed.success ? parsed.data : { period: '7d' as const, export: 'false' };
		const wantExport = exportFlag === 'true';

		if (wantExport) {
			const data = await recommendationMetrics.getExportData(period);
			return json(data);
		}

		const summary = await recommendationMetrics.getSummary(period);
		return json(summary);
	} catch (err) {
		console.error('[API] /api/recommendations/metrics error:', err);
		return json({});
	}
};
