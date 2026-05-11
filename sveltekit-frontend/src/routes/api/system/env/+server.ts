import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ENV } from '$lib/server/env.server.js';

/**
 * GET /api/system/env
 * Sanitized environment check (presence flags only, no secrets)
 * No side effects
 */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

	const env = {
		timestamp: new Date().toISOString(),
		has: { REDIS_URL: !!process.env.REDIS_URL,
			DATABASE_URL: !!process.env.DATABASE_URL,
			QDRANT_URL: !!process.env.QDRANT_URL,
			OLLAMA_URL: !!process.env.OLLAMA_URL,
			MINIO_ENDPOINT: !!process.env.MINIO_ENDPOINT,
			MINIO_ACCESS_KEY: !!process.env.MINIO_ACCESS_KEY,
			MINIO_SECRET_KEY: !!process.env.MINIO_SECRET_KEY,
			AUTH_COOKIE_NAME: !!process.env.AUTH_COOKIE_NAME,
			JWT_SECRET: !!process.env.JWT_SECRET,
		},
		environment: process.env?.NODE_ENV ?? 'development',
		nodeVersion: process.version,
	};

	return json(env);
}
