/**
 * LLM Self-Improvement API - Metrics Endpoint
 * Phase 72 - Task 15: Monitoring and Observability
 *
 * GET /api/llm-improvement/metrics
 * Returns system metrics and health status
 */

import { getMetricsCollector } from '$lib/services/error-analysis/MetricsCollector';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = async ({ url }) => {
	try {
		const metrics = getMetricsCollector();
		const includeHistory = url.searchParams.get('history') === 'true';

		const snapshot = await metrics.getSnapshot();

		return json({
			success: true,
			timestamp: snapshot.timestamp,
			metrics: snapshot.metrics,
			history: includeHistory ? snapshot.history : undefined,
			summary: metrics.getSummary()
		});
	} catch (err) {
		return json(
			{ error: err instanceof Error ? err.message : 'Failed to get metrics' },
			{ status: 500 }
		);
	}
};

/**
 * POST /api/llm-improvement/metrics
 * Record a performance metric
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { metric, durationMs } = body as {
			metric: 'embeddingGenerationTime' | 'vectorSearchLatency' | 'fixApplicationTime' | 'policyUpdateTime';
			durationMs: number;
		};

		if (!metric || typeof durationMs !== 'number') {
			return json({ error: 'Missing metric or durationMs' }, { status: 400 });
		}

		const metrics = getMetricsCollector();
		metrics.recordPerformance(metric, durationMs);

		return json({ success: true });
	} catch (err) {
		return json(
			{ error: err instanceof Error ? err.message : 'Failed to record metric' },
			{ status: 500 }
		);
	}
};

/**
 * PUT /api/llm-improvement/metrics
 * Start or stop metrics collection
 */
export const PUT: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { action } = body as { action: 'start' | 'stop' | 'reset' };
		const metrics = getMetricsCollector();

		switch (action) {
			case 'start':
				metrics.start();
				return json({ success: true, message: 'Metrics collection started' });

			case 'stop':
				metrics.stop();
				return json({ success: true, message: 'Metrics collection stopped' });

			case 'reset':
				metrics.reset();
				return json({ success: true, message: 'Metrics reset' });

			default:
				return json({ error: 'Invalid action' }, { status: 400 });
		}
	} catch (err) {
		return json(
			{ error: err instanceof Error ? err.message : 'Action failed' },
			{ status: 500 }
		);
	}
};