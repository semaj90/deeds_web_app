import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { z } from 'zod';

const querySchema = z.object({
	action: z.enum(['status', 'recent-errors', 'fix-suggestions']).default('status'),
	query: z.string().max(2000).optional()
});

/** GET /api/v1/agentic — Agentic controller status, errors, and fix suggestions */
export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
	const { action, query: actionQuery } = parsed.success ? parsed.data : { action: 'status' as const, query: undefined };

	try {
		if (action === 'status') {
			const { getRedis } = await import('$lib/server/redis.js');
			const redis = getRedis();
			const isConnected = redis.status === 'ready';

			return json({
				status: 'active',
				system: {
					redisConnected: isConnected,
					agenticControllerActive: true,
					watcherStatus: 'idle'
				},
				activity: {
					recentASTProcessing: 0,
					pendingErrors: 0,
					lastActivity: new Date().toISOString()
				}
			});
		}

		if (action === 'recent-errors') {
			const { getRedis } = await import('$lib/server/redis.js');
			const redis = getRedis();
			const errorKeys = await redis.keys('agentic:error:*');
			const errors: Array<Record<string, unknown>> = [];

			if (errorKeys.length > 0) {
				const pipeline = redis.pipeline();
				for (const key of errorKeys.slice(0, 20)) {
					pipeline.get(key);
				}
				const results = await pipeline.exec();
				if (results) {
					for (const [err, val] of results as Array<[Error | null, string | null]>) {
						if (!err && val) {
							try {
								errors.push(JSON.parse(val));
							} catch {
								// skip
							}
						}
					}
				}
			}

			return json({ errors });
		}

		if (action === 'fix-suggestions') {
			const query = actionQuery ?? '';

			if (!query) {
				return json({ suggestions: [] });
			}

			const { ollamaFetch } = await import('$lib/server/ollama.js');
			const { ENV } = await import('$lib/server/env.server.js');

			const res = await ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/generate`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					model: 'gemma4-rotorquant:latest',
					prompt: `Given this error: "${query.slice(0, 2000)}", suggest fixes. Return JSON: { "suggestions": [{ "suggestion": "...", "successRate": 0.0-1.0, "similarError": "...", "relevance": 0.0-1.0 }] }`,
					stream: false,
					options: { temperature: 0.4 }
				}),
				signal: AbortSignal.timeout(30_000)
			});

			if (res.ok) {
				const data = await res.json();
				try {
					const parsed = JSON.parse(data.response);
					return json({
						suggestions: Array.isArray(parsed.suggestions) ? parsed.suggestions : []
					});
				} catch {
					return json({
						suggestions: [
							{
								suggestion: data.response,
								successRate: 0.5,
								similarError: query.slice(0, 100),
								relevance: 0.5
							}
						]
					});
				}
			}

			return json({ suggestions: [] });
		}

		return json({ error: `Unknown action: ${action}` }, { status: 400 });
	} catch (err) {
		console.error('[/api/v1/agentic] error:', err);
		if (action === 'recent-errors') return json({ errors: [] });
    if (action === 'fix-suggestions') return json({ suggestions: [] });
    return json({
      status: 'inactive',
      system: { redisConnected: false, agenticControllerActive: false, watcherStatus: 'idle' },
      activity: { recentASTProcessing: 0, pendingErrors: 0, lastActivity: null },
    });
	}
};
