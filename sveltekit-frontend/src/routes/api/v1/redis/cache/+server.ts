import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { z } from 'zod';

const cacheSetSchema = z.object({
	key: z.string().min(1).max(500),
	value: z.any(),
	ttl: z.number().min(1).max(604800).default(3600) // max 7 days
});

/** POST /api/v1/redis/cache — Set a key-value pair in Redis */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const raw = await request.json();
		const parsed = cacheSetSchema.safeParse(raw);
		if (!parsed.success) {
			return json({ error: parsed.error.issues[0]?.message }, { status: 400 });
		}

		const { key, value, ttl } = parsed.data;

		const { getRedis } = await import('$lib/server/redis.js');
		const redis = getRedis();
		await redis.set(`app:${key}`, JSON.stringify(value), 'EX', ttl);

		return json({ success: true });
	} catch (err) {
		console.error('[/api/v1/redis/cache] error:', err);
		return json({ error: 'Cache operation failed' }, { status: 500 });
	}
};
