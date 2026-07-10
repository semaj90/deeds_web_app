import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { getRedis } from '$lib/server/redis.js';

const postSchema = z.object({
	key: z.string().min(1).max(512),
	data: z.unknown(),
	ttl: z.number().int().positive().max(86_400).default(900),
});

function isAllowedKey(key: string): boolean {
	return /^(sw:|runtime:|bitfrost:|ace:|atlas:|taxonomy:|query:)/.test(key);
}

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) return json({ ok: false, error: 'Unauthorized' }, { status: 401 });

	const key = url.searchParams.get('key');
	const prefix = url.searchParams.get('prefix') ?? 'sw:';
	const limit = Math.min(Number(url.searchParams.get('limit') ?? 100), 500);
	const redis = getRedis();

	try {
		if (key) {
			if (!isAllowedKey(key)) return json({ ok: false, error: 'key_not_allowed' }, { status: 403 });
			const raw = await redis.get(key);
			return json({ ok: true, key, data: raw ? JSON.parse(raw) : null, hit: Boolean(raw) });
		}

		if (!isAllowedKey(prefix)) return json({ ok: false, error: 'prefix_not_allowed' }, { status: 403 });
		const keys = (await redis.keys(`${prefix}*`)).slice(0, limit);
		return json({ ok: true, keys });
	} catch (err) {
		return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 502 });
	}
};

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ ok: false, error: 'Unauthorized' }, { status: 401 });

	const parsed = postSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return json({ ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
	if (!isAllowedKey(parsed.data.key)) return json({ ok: false, error: 'key_not_allowed' }, { status: 403 });

	try {
		const redis = getRedis();
		await redis.set(parsed.data.key, JSON.stringify(parsed.data.data), 'EX', parsed.data.ttl);
		return json({ ok: true, key: parsed.data.key, ttl: parsed.data.ttl });
	} catch (err) {
		return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 502 });
	}
};

