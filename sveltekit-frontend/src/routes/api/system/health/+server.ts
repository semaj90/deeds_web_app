import { json } from '@sveltejs/kit';
import os from 'os';
import { db } from '$lib/server/db/client';
import { sql } from 'drizzle-orm';
import type { RequestHandler } from './$types.js';
import { ENV } from '$lib/server/env.server.js';

async function checkService(name: string, fn: () => Promise<void>): Promise<'ok' | 'error'> {
	try {
		await fn();
		return 'ok';
	} catch {
		return 'error';
	}
}

export const GET: RequestHandler = async () => {
	const [database, redis, ollama, qdrant] = await Promise.all([
		checkService('database', async () => {
			await db.execute(sql`SELECT 1`);
		}),
		checkService('redis', async () => {
			const { getRedis } = await import('$lib/server/redis.js');
			const r = getRedis();
			const pong = await r.ping();
			if (pong !== 'PONG') throw new Error('No PONG');
		}),
		checkService('ollama', async () => {
			const res = await fetch(`${ENV.OLLAMA_BASE_URL}/api/tags`, { signal: AbortSignal.timeout(3000) });
			if (!res.ok) throw new Error(`Ollama ${res.status}`);
		}),
		checkService('qdrant', async () => {
			const res = await fetch(`${ENV.QDRANT_URL}/healthz`, { signal: AbortSignal.timeout(3000) });
			if (!res.ok) throw new Error(`Qdrant ${res.status}`);
		}),
	]);

	const allOk = database === 'ok' && redis === 'ok' && ollama === 'ok' && qdrant === 'ok';

	const health = {
		status: allOk ? 'ok' : 'degraded',
		timestamp: new Date().toISOString(),
		system: {
			uptime: os.uptime(),
			loadavg: os.loadavg(),
			memory: { total: os.totalmem(), free: os.freemem() },
		},
		services: { database, redis, ollama, qdrant },
	};

	return json(health);
};
