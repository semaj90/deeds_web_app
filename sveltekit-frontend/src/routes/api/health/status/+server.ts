import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';

/** GET /api/health/status — Service connection status check */
export const GET: RequestHandler = async () => {
	const services: Record<string, { status: string }> = {};

	// Check Ollama
	try {
		const { ollamaFetch } = await import('$lib/server/ollama.js');
		const { ENV } = await import('$lib/server/env.server.js');
		const res = await ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/tags`, {
			signal: AbortSignal.timeout(3000)
		});
		services.ollama = { status: res.ok ? 'connected' : 'error' };
	} catch {
		services.ollama = { status: 'disconnected' };
	}

	// Check Redis
	try {
		const { getRedis } = await import('$lib/server/redis.js');
		const redis = getRedis();
		await redis.ping();
		services.redis = { status: 'connected' };
	} catch {
		services.redis = { status: 'disconnected' };
	}

	// Check PostgreSQL
	try {
		const { db } = await import('$lib/server/db/client');
		const { sql } = await import('drizzle-orm');
		await db.execute(sql`SELECT 1`);
		services.postgres = { status: 'connected' };
	} catch {
		services.postgres = { status: 'disconnected' };
	}

	return json({ services, timestamp: new Date().toISOString() });
};