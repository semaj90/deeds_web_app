import { getRedisClient } from '$lib/server/cache/redis';
import { db } from '$lib/server/db/client';
import { json } from '@sveltejs/kit';
import { sql } from 'drizzle-orm';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

/**
 * GET /api/system/phase13
 * Health check - verifies core services are reachable
 * No side effects
 */
export async function GET() {
	const health: any = {
		timestamp: new Date().toISOString(),
		services: {},
	};

	try {
		// Check Redis
		const redis = await getRedisClient();
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
			health.services.postgres = {
				ok: result.rows.length > 0,
				version: (result.rows[0] as any)?.version?.substring(0, 40) ?? 'unknown',
				database: (result.rows[0] as any)?.current_database ?? 'unknown',
			};
		} catch (e) {
			health.services.postgres = { ok: false, message: (e as Error).message };
		}

		// Check Qdrant (if configured)
		if (process.env.QDRANT_URL) {
			try {
				const resp = await fetch(`${process.env.QDRANT_URL}/health`);
				health.services.qdrant = { ok: resp.ok, status: resp.status };
			} catch (e) {
				health.services.qdrant = { ok: false, message: (e as Error).message };
			}
		}

		// Check Ollama (if configured)
		if (process.env.OLLAMA_URL) {
			try {
				const resp = await fetch(`${process.env.OLLAMA_URL}/api/tags`);
				const data = await resp.json();
				health.services.ollama = {
					ok: resp.ok,
					modelCount: data.models?.length ?? 0,
				};
			} catch (e) {
				health.services.ollama = { ok: false, message: (e as Error).message };
			}
		}

		// Check MinIO (if configured)
		if (process.env.MINIO_ENDPOINT) {
			health.services.minio = {
				ok: true,
				endpoint: process.env.MINIO_ENDPOINT,
			};
		}

		return json(health);
	} catch (e) {
		return json({ error: (e as any).message }, { status: 500 });
	}
}


