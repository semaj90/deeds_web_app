import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';

/** GET /api/route-operations/log — Route operations log for monitoring dashboard */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	try {
		const { getRedis } = await import('$lib/server/redis.js');
		const redis = getRedis();

		const keys = await redis.keys('route-op:*');
		const operations: Array<Record<string, unknown>> = [];

		if (keys.length > 0) {
			const pipeline = redis.pipeline();
			for (const key of keys.slice(0, 100)) {
				pipeline.get(key);
			}
			const results = await pipeline.exec();

			if (results) {
				for (const [err, val] of results as Array<[Error | null, string | null]>) {
					if (!err && val) {
						try {
							operations.push(JSON.parse(val));
						} catch {
							// skip malformed
						}
					}
				}
			}
		}

		operations.sort((a, b) => {
			const ta = typeof a.timestamp === 'number' ? a.timestamp : 0;
			const tb = typeof b.timestamp === 'number' ? b.timestamp : 0;
			return tb - ta;
		});

		return json({
			operations: operations.slice(0, 50),
			total: operations.length,
			timestamp: new Date().toISOString()
		});
	} catch (err) {
		console.error('[/api/route-operations/log] error:', err);
		return json({ operations: [], total: 0, timestamp: new Date().toISOString() });
	}
};