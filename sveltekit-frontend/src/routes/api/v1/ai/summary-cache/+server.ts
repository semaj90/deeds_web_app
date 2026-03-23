import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { z } from 'zod';

const cacheCheckSchema = z.object({
	textHash: z.string().min(1).max(256)
});

/** POST /api/v1/ai/summary-cache — Check if a summary is cached by text hash */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const raw = await request.json();
		const parsed = cacheCheckSchema.safeParse(raw);
		if (!parsed.success) {
			return json(
				{ error: parsed.error.issues[0]?.message ?? 'Invalid input' },
				{ status: 400 }
			);
		}

		const { textHash } = parsed.data;

		const { getRedis } = await import('$lib/server/redis.js');
		const redis = getRedis();
		const cached = await redis.get(`summary:${textHash}`);

		if (cached) {
			try {
				const data = JSON.parse(cached);
				return json({ summary: data.summary ?? cached });
			} catch {
				return json({ summary: cached });
			}
		}

		return json({});
	} catch (err) {
		console.error('[/api/v1/ai/summary-cache] error:', err);
		return json({}, { status: 500 });
	}
};