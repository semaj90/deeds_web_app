/**
 * GET /api/admin/inference-stats
 *
 * Queries CouchDB MapReduce views for LLM inference observability:
 *   - by_type: aggregated stats per inference type (llm, embedding, vector_search)
 *   - by_backend: aggregated stats per backend (ollama, tensorrt, bifrost, qdrant)
 *   - by_hour: time-series latency/count per hour (last 24h)
 *   - errors: recent inference errors
 *   - slowest: slowest inferences (>1s latency)
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';

const inferenceStatsSchema = z.object({
	view: z.enum(['all', 'by_type', 'by_backend', 'by_hour', 'errors', 'slowest']).default('all'),
	limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	const parsed = inferenceStatsSchema.safeParse({
		view: url.searchParams.get('view'),
		limit: url.searchParams.get('limit'),
	});

	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid params' }, { status: 400 });
	}

	const { view, limit } = parsed.data;
	const wantAll = view === 'all';

	let byType: Record<string, unknown> = {};
	let byBackend: Record<string, unknown> = {};
	let byHour: Array<{ key: unknown; value: unknown }> = [];
	let errors: Array<{ key: unknown; value: unknown }> = [];
	let slowest: Array<{ key: unknown; value: unknown }> = [];

	try {
		if (wantAll || view === 'by_type') {
			const { getStatsByType } = await import(
				'$lib/server/observability/inference-log-views.js'
			);
			byType = await getStatsByType();
		}

		if (wantAll || view === 'by_backend') {
			const { getStatsByBackend } = await import(
				'$lib/server/observability/inference-log-views.js'
			);
			byBackend = await getStatsByBackend();
		}

		const loadCouchView = async (viewName: string, opts: Record<string, string>) => {
			const { couchdb } = await import('$lib/services/couchdb-client.js');
			const result = await couchdb.view('inference_log', 'stats', viewName, opts);
			return result.rows ?? [];
		};

		if (wantAll || view === 'by_hour') {
			byHour = await loadCouchView('by_hour', {
				group: 'true',
				descending: 'true',
				limit: String(Math.min(limit, 24)),
			}).catch(() => []);
		}

		if (wantAll || view === 'errors') {
			errors = await loadCouchView('errors', {
				descending: 'true',
				limit: String(Math.min(limit, 50)),
			}).catch(() => []);
		}

		if (wantAll || view === 'slowest') {
			slowest = await loadCouchView('slowest', {
				descending: 'true',
				limit: String(Math.min(limit, 20)),
			}).catch(() => []);
		}

		return json({ byType, byBackend, byHour, errors, slowest, queriedAt: new Date().toISOString() });
	} catch (err) {
		console.error('[inference-stats] CouchDB error:', err);
		return json({
			byType, byBackend, byHour, errors, slowest,
			queriedAt: new Date().toISOString(),
			error: 'CouchDB unavailable',
		});
	}
};
