/**
 * POST /api/analytics/search
 *
 * Record search analytics events (query, result count, execution time).
 * Fire-and-forget from the client — always returns 200.
 * Persists to RabbitMQ analytics.track queue for async processing.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';

const searchAnalyticsSchema = z.object({
	query: z.string().max(500).default(''),
	resultCount: z.number().int().min(0).default(0),
	executionTimeMs: z.number().min(0).default(0),
	type: z.enum(['cases', 'laws', 'evidence', 'poi', 'citations', 'all']).default('laws'),
	timestamp: z.string().optional(),
});

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	try {
		const body = await request.json();
		const parsed = searchAnalyticsSchema.safeParse(body);

		const {
			query = '',
			resultCount = 0,
			executionTimeMs = 0,
			type = 'laws',
			timestamp = new Date().toISOString()
		} = parsed.success ? parsed.data : body;

		// Publish to RabbitMQ analytics.track queue (fire-and-forget)
		try {
			const { rabbitmq } = await import('$lib/server/queue/rabbitmq-manager-fixed.js');
			rabbitmq.publishAnalyticsEvent({
				eventType: 'search',
				payload: {
					query: query.slice(0, 500),
					resultCount,
					executionTimeMs,
					searchType: type,
					timestamp,
				},
			}).catch(() => {});
		} catch {
			// RabbitMQ unavailable — non-fatal
		}

		console.log(
			`[search-analytics] type=${type} query="${query.slice(0, 80)}" results=${resultCount} time=${executionTimeMs}ms`
		);

		return json({ success: true });
	} catch {
		// Always return 200 — analytics should never block the client
		return json({ success: true });
	}
};
