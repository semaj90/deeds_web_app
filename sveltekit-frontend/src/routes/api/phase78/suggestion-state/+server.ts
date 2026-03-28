import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { z } from 'zod';

const suggestionStateSchema = z.object({
	routePath: z.string().min(1).max(500),
	state: z.enum(['applied', 'dismissed', 'snooze', 'pending'])
});

/** POST /api/phase78/suggestion-state — Track suggestion dismiss/snooze/apply state */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	try {
		const raw = await request.json();
		const parsed = suggestionStateSchema.safeParse(raw);
		if (!parsed.success) {
			return json(
				{ success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' },
				{ status: 400 }
			);
		}

		const { routePath, state } = parsed.data;

		const { getRedis } = await import('$lib/server/redis.js');
		const redis = getRedis();

		const key = `suggestion:${routePath}`;
		await redis.set(
			key,
			JSON.stringify({
				state,
				updatedAt: new Date().toISOString()
			}),
			'EX',
			state === 'snooze' ? 86400 : 604800
		);

		return json({ success: true });
	} catch (err) {
		console.error('[/api/phase78/suggestion-state] error:', err);
		return json({ success: false, error: 'Failed to update suggestion state' }, { status: 500 });
	}
};