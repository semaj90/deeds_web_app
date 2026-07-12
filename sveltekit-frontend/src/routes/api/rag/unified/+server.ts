import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';

/** GET /api/rag/unified — RAG service health check */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	const services: Record<string, { status: string; latency?: number }> = {};

	// Check Ollama
	try {
		const { ollamaFetch } = await import('$lib/server/ollama.js');
		const { ENV } = await import('$lib/server/env.server.js');
		const start = Date.now();
		const res = await ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/tags`, {
			signal: AbortSignal.timeout(3000)
		});
		services.ollama = { status: res.ok ? 'healthy' : 'degraded', latency: Date.now() - start };
	} catch {
		services.ollama = { status: 'down' };
	}

	// Check Qdrant
	try {
		const { getQdrantClient } = await import('$lib/server/vector/qdrant-singleton.js');
		const client = getQdrantClient();
		const start = Date.now();
		await client.getCollections();
		services.qdrant = { status: 'healthy', latency: Date.now() - start };
	} catch {
		services.qdrant = { status: 'down' };
	}

	// Check Redis
	try {
		const { getRedis } = await import('$lib/server/redis.js');
		const redis = getRedis();
		const start = Date.now();
		await redis.ping();
		services.redis = { status: 'healthy', latency: Date.now() - start };
	} catch {
		services.redis = { status: 'down' };
	}

	// Check PostgreSQL
	try {
		const { db } = await import('$lib/server/db/client');
		const { sql } = await import('drizzle-orm');
		const start = Date.now();
		await db.execute(sql`SELECT 1`);
		services.postgres = { status: 'healthy', latency: Date.now() - start };
	} catch {
		services.postgres = { status: 'down' };
	}

	const allHealthy = Object.values(services).every((s) => s.status === 'healthy');

	return json({
		status: allHealthy ? 'healthy' : 'degraded',
		services,
		timestamp: new Date().toISOString()
	});
};
