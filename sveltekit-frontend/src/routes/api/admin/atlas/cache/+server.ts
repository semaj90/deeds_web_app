import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	let cartridgeCount = 0;
	let featureCardCount = 0;
	let karpathyScoreCount = 0;
	let topoCacheCount = 0;
	let topScoredFiles: Array<{ path: string; blend: number }> = [];

	try {
		const { getRedis } = await import('$lib/server/redis.js');
		const redis = getRedis();

		const [cartridgeKeys, featureKeys, topoKeys, prRaw] = await Promise.all([
			redis.keys('ace:cartridge:*').catch(() => [] as string[]),
			redis.keys('ace:feature:*').catch(() => [] as string[]),
			redis.keys('ace:topo:*').catch(() => [] as string[]),
			redis.hgetall('gpu:karpathy:scores').catch(() => null),
		]);

		cartridgeCount = cartridgeKeys.length;
		featureCardCount = featureKeys.length;
		topoCacheCount = topoKeys.length;

		if (prRaw) {
			const entries = Object.entries(prRaw)
				.map(([path, v]) => {
					try { return { path, blend: JSON.parse(v as string).blend ?? 0 }; } catch { return null; }
				})
				.filter((x): x is { path: string; blend: number } => x !== null)
				.sort((a, b) => b.blend - a.blend);
			karpathyScoreCount = entries.length;
			topScoredFiles = entries.slice(0, 8);
		}
	} catch { /* Redis offline */ }

	return json({ cartridgeCount, featureCardCount, karpathyScoreCount, topoCacheCount, topScoredFiles });
};

export const DELETE: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	const key = url.searchParams.get('key');
	if (!key) return json({ error: 'key param required' }, { status: 400 });

	const allowed = ['ace:cartridge:*', 'ace:feature:*', 'ace:topo:*'];
	if (!allowed.includes(key)) return json({ error: 'key not in allowlist' }, { status: 403 });

	try {
		const { getRedis } = await import('$lib/server/redis.js');
		const redis = getRedis();
		const keys = await redis.keys(key);
		if (keys.length) await redis.del(...keys);
		return json({ deleted: keys.length });
	} catch (e) {
		return json({ error: String(e) }, { status: 500 });
	}
};