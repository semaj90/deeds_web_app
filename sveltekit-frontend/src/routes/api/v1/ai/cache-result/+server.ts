import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { z } from 'zod';

const cacheSchema = z.object({
	textHash: z.string().min(1).max(128),
	summary: z.string().min(1).max(100000)
});

/** POST /api/v1/ai/cache-result — Cache an AI result by text hash */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	try {
		const raw = await request.json();
		const parsed = cacheSchema.safeParse(raw);
		if (!parsed.success) {
			return json(
				{ error: parsed.error.issues[0]?.message ?? 'Invalid input' },
				{ status: 400 }
			);
		}

		const { textHash, summary } = parsed.data;

		const { getRedis } = await import('$lib/server/redis.js');
		const redis = getRedis();
		await redis.set(`summary:${textHash}`, JSON.stringify({ summary }), 'EX', 86400);

		return json({ success: true });
	} catch (err) {
		console.error('[/api/v1/ai/cache-result] error:', err);
		return json({ error: 'Cache operation failed' }, { status: 500 });
	}
};