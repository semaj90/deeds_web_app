import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { z } from 'zod';

const healthCheckSchema = z.object({
	route: z.string().min(1).max(500)
});

/** POST /api/playwright/run-health-check — Run a Playwright health check on a route */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	try {
		const raw = await request.json();
		const parsed = healthCheckSchema.safeParse(raw);
		if (!parsed.success) {
			return json(
				{ success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' },
				{ status: 400 }
			);
		}

		const { route } = parsed.data;

		// Queue the check in Redis
		const { getRedis } = await import('$lib/server/redis.js');
		const redis = getRedis();

		await redis.set(
			`health-check:${route}`,
			JSON.stringify({
				route,
				requestedAt: new Date().toISOString(),
				status: 'queued'
			}),
			'EX',
			300
		);

		return json({ success: true, message: `Health check queued for ${route}` });
	} catch (err) {
		console.error('[/api/playwright/run-health-check] error:', err);
		return json({ success: false, error: 'Failed to queue health check' }, { status: 500 });
	}
};
