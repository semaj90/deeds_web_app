import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db/client';

const routeHealthSchema = z.object({
	routePath: z.string().min(1).max(500),
	filePath: z.string().max(500).default(''),
	state: z.enum(['healthy', 'degraded', 'unhealthy']).default('healthy'),
	recentErrorCount: z.number().min(0).default(0),
	lastErrorClusterId: z.string().max(200).optional(),
	selectedSuggestionId: z.string().max(200).optional(),
	lastErrorMessageShort: z.string().max(1000).optional()
});

/** POST /api/phase78/route-health — Update route health status */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const raw = await request.json();
		const parsed = routeHealthSchema.safeParse(raw);
		if (!parsed.success) {
			return json(
				{ success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' },
				{ status: 400 }
			);
		}

		const { routePath, state, recentErrorCount } = parsed.data;

		const { routeHealth } = await import('$lib/server/db/schema.js');
		const { eq } = await import('drizzle-orm');

		const existing = await db
			.select({ id: routeHealth.id })
			.from(routeHealth)
			.where(eq(routeHealth.routePath, routePath))
			.limit(1);

		if (existing.length > 0) {
			await db
				.update(routeHealth)
				.set({
					state,
					recentErrorCount,
					updatedAt: new Date()
				})
				.where(eq(routeHealth.routePath, routePath));
		} else {
			await db.insert(routeHealth).values({
				routePath,
				state,
				recentErrorCount
			});
		}

		return json({ success: true });
	} catch (err) {
		console.error('[/api/phase78/route-health] error:', err);
		return json({ success: false, error: 'Failed to update route health' }, { status: 500 });
	}
};