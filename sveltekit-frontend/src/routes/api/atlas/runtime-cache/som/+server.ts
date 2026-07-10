import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { getRedis } from '$lib/server/redis.js';

const postSchema = z.object({
	key: z.string().min(1).max(512),
	data: z.unknown(),
	ttl: z.number().int().positive().max(86_400).default(3600),
});

function normalizeSomKey(key: string): string {
	return key.startsWith('sw:som:') || key.startsWith('taxonomy:clusters:')
		? key
		: `sw:som:${key}`;
}

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) return json({ ok: false, error: 'Unauthorized' }, { status: 401 });

	const key = url.searchParams.get('key');
	if (!key) return json({ ok: false, error: 'missing key' }, { status: 400 });

	try {
		const redis = getRedis();
		const normalized = normalizeSomKey(key);
		const raw = await redis.get(normalized);
		return json({ ok: true, key: normalized, data: raw ? JSON.parse(raw) : null, hit: Boolean(raw) });
	} catch (err) {
		return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 502 });
	}
};

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ ok: false, error: 'Unauthorized' }, { status: 401 });

	const parsed = postSchema.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return json({ ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });

	try {
		const redis = getRedis();
		const key = normalizeSomKey(parsed.data.key);
		await redis.set(key, JSON.stringify(parsed.data.data), 'EX', parsed.data.ttl);
		return json({ ok: true, key, ttl: parsed.data.ttl });
	} catch (err) {
		return json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 502 });
	}
};

