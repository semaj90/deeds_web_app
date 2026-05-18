import type { PageServerLoad } from './$types';
import { redirect } from '@sveltejs/kit';
import { ENV } from '$lib/server/env.server.js';

export const load: PageServerLoad = async ({ locals, fetch }) => {
	if (!locals.user) throw redirect(303, '/login?redirect=/admin/atlas');

	const healthPromise = fetch('/api/admin/atlas/health')
		.then(async (r) => (r.ok ? await r.json() : null))
		.catch(() => null);

	const cacheStatsPromise = locals.user.role === 'admin'
		? fetch('/api/admin/cache-stats')
			.then(async (r) => (r.ok ? await r.json() : null))
			.catch(() => null)
		: Promise.resolve(null);

	const [health, cacheStats] = await Promise.all([healthPromise, cacheStatsPromise]);

	return {
		health,
		cacheStats,
		chatModel: ENV.OLLAMA_CHAT_MODEL,
		embedModel: ENV.OLLAMA_EMBED_MODEL,
		kvProfile: process.env.TURBO_PROFILE ?? 'stock'
	};
};
