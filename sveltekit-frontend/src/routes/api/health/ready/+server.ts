/**
 * GET /api/health/ready
 * Readiness probe for container orchestration (Docker healthcheck, K8s).
 * Returns 200 if core services (DB + Redis) are reachable, 503 otherwise.
 * Ollama is optional — degraded mode is acceptable.
 */
import { json } from '@sveltejs/kit';
import { db } from '$lib/server/db/client';
import { sql } from 'drizzle-orm';
import { redis } from '$lib/server/redis.js';
import { ENV } from '$lib/server/env.server.js';
import type { RequestHandler } from '@sveltejs/kit';
import { ollamaFetch } from '$lib/server/ollama.js';

const PROBE_TIMEOUT = 3000;

async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
	return Promise.race([
		p,
		new Promise<T>((resolve) => setTimeout(() => resolve(fallback), PROBE_TIMEOUT)),
	]);
}

export const GET: RequestHandler = async () => {
	const [dbOk, redisOk, ollamaOk] = await Promise.all([
		safe(db.execute(sql`SELECT 1`).then(() => true), false),
		safe(redis.ping().then(() => true), false),
		safe(
			ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/tags`, { signal: AbortSignal.timeout(PROBE_TIMEOUT) })
				.then((r) => r.ok),
			false,
		),
	]);

	const ready = dbOk && redisOk; // Ollama optional — degraded mode ok

	return json(
		{ ready, checks: { db: dbOk, redis: redisOk, ollama: ollamaOk }, time: new Date().toISOString() },
		{ status: ready ? 200 : 503 },
	);
};
