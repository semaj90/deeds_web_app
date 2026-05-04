import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { z } from 'zod';
import { getFileHealth, triggerProactiveGuarding } from '$lib/server/analytics/architectural-guard.js';
import { getRedis } from '$lib/server/redis.js';

const focusSchema = z.object({
	filePath: z.string().min(1).max(500),
});

/**
 * POST /api/analytics/focus
 * Body: { filePath: string }
 *
 * Frontend reports which file the user is currently looking at.
 * Triggers proactive architectural guarding if the file is significant but "unfamiliar"
 * to the retrieval pipeline.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	const parsed = focusSchema.safeParse(await request.json().catch(() => ({})));
	if (!parsed.success) return json({ error: 'filePath is required' }, { status: 400 });
	const { filePath } = parsed.data;

	try {
		// 1. Evaluate file health
		const health = await getFileHealth(filePath);

		// 2. Trigger background grounding if risk is elevated
		const triggered = await triggerProactiveGuarding(filePath);

		// 3. Cache the current focus metadata in Redis for external tools (MCP)
		const redis = getRedis();
		const focusKey = `analytics:focus:${locals.user?.id ?? 'anonymous'}`;
		await redis.set(focusKey, JSON.stringify({
			filePath,
			health: health.healthScore,
			priority: health.guardingPriority,
			timestamp: new Date().toISOString()
		}), 'EX', 300); // 5 min TTL

		return json({
			success: true,
			health,
			triggered,
			message: triggered
				? `Proactive guarding started for ${filePath}`
				: `File ${filePath} is healthy or recently guarded.`
		});
	} catch (err) {
		console.error('[focus-api] Failed to process focus event:', err);
		return json({ error: (err as Error).message }, { status: 500 });
	}
};