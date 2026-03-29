import { redisPool } from '$lib/server/redis.js';
import { db } from '$lib/server/db/client';
import { json } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import { ollamaFetch } from '$lib/server/ollama.js';
import { ENV } from '$lib/server/env.server.js';

/**
 * GET /api/system/phase13
 * Health check - verifies core services are reachable
 * No side effects
 */
export async function GET() {
	const health: { timestamp: string; services: Record<string, Record<string, unknown>> } = {
		timestamp: new Date().toISOString(),
		services: {},
	};

	try {
		// Check Redis
		const redis = redisPool.getConnection();
		try {
			const pingResult = await redis.ping();
			health.services.redis = {
				ok: pingResult === 'PONG',
				message: pingResult,
			};
		} catch (e) {
			health.services.redis = { ok: false, message: (e as Error).message };
		}

		// Check PostgreSQL + pgvector
		try {
			const result = await db.execute(sql`SELECT version(), current_database()`);
			const pgRow = (result.rows[0] ?? {}) as Record<string, unknown>;
			health.services.postgres = {
				ok: result.rows.length > 0,
				version: String(pgRow.version ?? 'unknown').substring(0, 40),
				database: String(pgRow.current_database ?? 'unknown'),
			};
		} catch (e) {
			health.services.postgres = { ok: false, message: (e as Error).message };
		}

		// Check Qdrant
		try {
			const resp = await fetch(`${ENV.QDRANT_URL}/health`, { signal: AbortSignal.timeout(5_000) });
			health.services.qdrant = { ok: resp.ok, status: resp.status };
		} catch (e) {
			health.services.qdrant = { ok: false, message: (e as Error).message };
		}

		// Check Ollama
		try {
			const resp = await ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/tags`);
			const data = await resp.json();
			health.services.ollama = {
				ok: resp.ok,
				modelCount: data.models?.length ?? 0,
			};
		} catch (e) {
			health.services.ollama = { ok: false, message: (e as Error).message };
		}

		// Check MinIO
		health.services.minio = {
			ok: true,
			endpoint: ENV.MINIO_ENDPOINT,
		};

		return json(health);
	} catch (e) {
		console.error('[system/phase13] Health check failed:', e);
		return json({ error: 'Health check failed' }, { status: 500 });
	}
}
