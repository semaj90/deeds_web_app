import { json } from '@sveltejs/kit';
import os from 'os';
import { db } from '$lib/server/db/client';
import { sql } from 'drizzle-orm';
import type { RequestHandler } from './$types.js';
import { ENV } from '$lib/server/env.server.js';
import { ollamaFetch } from '$lib/server/ollama.js';
import { getQuicEmbeddingHealth } from '$lib/server/grpc/embedding-client.js';
import { TURBOQUANT_BASE_URL } from '$lib/ai/model-ids.js';

// ── Service probe helper ──────────────────────────────────────────────────

type ServiceResult = { status: 'ok' | 'error'; detail?: string };

async function checkService(
	name: string,
	fn: () => Promise<string | void>,
): Promise<ServiceResult> {
	try {
		const detail = await fn();
		return { status: 'ok', ...(detail ? { detail } : {}) };
	} catch (err) {
		return { status: 'error', detail: err instanceof Error ? err.message : String(err) };
	}
}

// ── GET /api/system/health ────────────────────────────────────────────────

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) return json({ status: 'degraded', error: 'Unauthorized' }, { status: 401 });
	const [
		database, redis, ollama, qdrant,
		turboQuant, semanticSearch, redisKvCache, grpcServices,
	] = await Promise.all([
		// ── Core infrastructure ────────────────────────────────────────
		checkService('database', async () => {
			await db.execute(sql`SELECT 1`);
		}),
		checkService('redis', async () => {
			const { getRedis } = await import('$lib/server/redis.js');
			const r = getRedis();
			const pong = await r.ping();
			if (pong !== 'PONG') throw new Error('No PONG');
			return 'PONG';
		}),
		checkService('ollama', async () => {
			const res = await ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/tags`, { signal: AbortSignal.timeout(3000) });
			if (!res.ok) throw new Error(`Ollama ${res.status}`);
			const data = await res.json() as { models?: Array<{ name: string }> };
			const models = data.models?.map(m => m.name) ?? [];
			return `${models.length} models loaded`;
		}),
		checkService('qdrant', async () => {
			const res = await fetch(`${ENV.QDRANT_URL}/healthz`, { signal: AbortSignal.timeout(3000) });
			if (!res.ok) throw new Error(`Qdrant ${res.status}`);
		}),

		// ── TurboQuant / llama-server (optional — never fails overall health) ──
		checkService('turboQuant', async () => {
			// Try /health first, fall back to /props, then /slots
			const endpoints = ['/health', '/props', '/slots'];
			for (const ep of endpoints) {
				try {
					const res = await fetch(`${TURBOQUANT_BASE_URL}${ep}`, {
						signal: AbortSignal.timeout(2000),
					});
					if (res.ok) {
						const data = await res.json().catch(() => null) as Record<string, unknown> | null;
						const model = (data?.default_generation_settings as Record<string, unknown>)?.model ?? null;
						const slots = data?.total_slots ?? null;
						const parts = [`via=${ep}`];
						if (model) parts.push(`model=${model}`);
						if (slots) parts.push(`slots=${slots}`);
						return parts.join(', ');
					}
				} catch { /* try next endpoint */ }
			}
			// All endpoints failed — mark optional-offline, do NOT throw
			return 'optional-offline';
		}),

		// ── Semantic search (codebase_chunks_768 collection) ──────────
		checkService('semanticSearch', async () => {
			const res = await fetch(
				`${ENV.QDRANT_URL}/collections/codebase_chunks_768`,
				{ signal: AbortSignal.timeout(3000) },
			);
			if (!res.ok) throw new Error(`Collection probe ${res.status}`);
			const data = await res.json() as { result?: { points_count?: number; vectors_count?: number; status?: string } };
			const pts = data.result?.points_count ?? 0;
			const vecs = data.result?.vectors_count ?? 0;
			const status = data.result?.status ?? 'unknown';
			if (pts === 0) throw new Error('Collection empty — no indexed chunks');
			return `${pts} points, ${vecs} vectors, status=${status}`;
		}),

		// ── Redis KV cache (TurboQuant warm prefixes) ─────────────────
		checkService('redisKvCache', async () => {
			const { getRedis } = await import('$lib/server/redis.js');
			const r = getRedis();
			// Count warm prefix keys
			const warmKeys = await r.keys('turbo:warm:*');
			const prefixKeys = await r.keys('turbo:prefix:*');
			const dymKeys = await r.keys('turbo:dym:*');
			return `warm=${warmKeys.length}, prefixes=${prefixKeys.length}, dym=${dymKeys.length}`;
		}),

		// ── gRPC services (embedding + tool-calling) ──────────────────
		checkService('grpcServices', async () => {
			const quicHealth = getQuicEmbeddingHealth();
			const parts = [`embedding=${quicHealth.status}`];
			// Probe tool-calling gRPC client if available (dynamic — export may not exist)
			try {
				const tcModule = await import('$lib/server/grpc/tool-calling-client.js') as Record<string, unknown>;
				if (typeof tcModule.getToolCallingHealth === 'function') {
					const tcHealth = (tcModule.getToolCallingHealth as () => { status?: string })();
					parts.push(`toolCalling=${tcHealth.status ?? 'unknown'}`);
				} else {
					parts.push('toolCalling=no-health-export');
				}
			} catch {
				parts.push('toolCalling=not-loaded');
			}
			return parts.join(', ');
		}),
	]);

	const embeddingQuic = getQuicEmbeddingHealth();

	// ── Overall status: degrade only if core services are down ────────────
	// TurboQuant is optional experimental acceleration — never degrades overall
	const coreOk = database.status === 'ok'
		&& redis.status === 'ok'
		&& ollama.status === 'ok'
		&& qdrant.status === 'ok';
	const overallStatus = coreOk ? 'ok' : 'degraded';

	const health = {
		status: overallStatus,
		timestamp: new Date().toISOString(),
		system: {
			uptime: os.uptime(),
			loadavg: os.loadavg(),
			memory: { total: os.totalmem(), free: os.freemem() },
		},
		services: {
			database,
			redis,
			ollama,
			qdrant,
			turboQuant,
			semanticSearch,
			redisKvCache,
			grpcServices,
		},
		embeddings: {
			quic: embeddingQuic,
		},
		inference: {
			turboQuantUrl: TURBOQUANT_BASE_URL,
			ollamaUrl: ENV.OLLAMA_BASE_URL,
		},
	};

	return json(health);
};
