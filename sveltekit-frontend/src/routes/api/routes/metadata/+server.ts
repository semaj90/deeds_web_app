import type { RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import {
	getAllRouteEndpoints,
	getActiveAPIEndpoints,
	getArchivedEndpoints,
	getRoutesByCategory,
	getRouteStats,
	getAPICrossReferences,
	getDeadRouteRefs
} from '$lib/server/api-metadata-extractor';
import { getRedis } from '$lib/server/redis.js';
import { fastJsonParse } from '$lib/server/gpu/simdjson-bridge.js';

const querySchema = z.object({
	includeArchived: z.enum(['true', 'false']).default('false')
});

const VALKEY_TTL_SECONDS = 300; // 5m active cache in Redis/Valkey
let memoryCache: { key: string; ts: number; data: Record<string, unknown> } | null = null;

/** GET /api/routes/metadata — Comprehensive route metadata for /all-routes UI (Valkey L1 -> IDB L2) */
export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	try {
		const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
		const includeArchived = parsed.success ? parsed.data.includeArchived === 'true' : false;
		const cacheKey = `bitfrost:routes:metadata:v1:${includeArchived ? 'all' : 'active'}`;

		// 1. Check L0 in-memory cache (60s)
		if (memoryCache && memoryCache.key === cacheKey && Date.now() - memoryCache.ts < 60_000) {
			return json({
				success: true,
				cacheSource: 'memory-l0',
				data: memoryCache.data,
			});
		}

		// 2. Check L1 Redis/Valkey cache (300s) with 250ms timeout guard
		try {
			const redis = getRedis();
			const cachedRaw = await Promise.race([
				redis.get(cacheKey),
				new Promise<null>((resolve) => setTimeout(() => resolve(null), 250)),
			]);
			if (cachedRaw) {
				const parsedCache = fastJsonParse<Record<string, unknown>>(cachedRaw);
				memoryCache = { key: cacheKey, ts: Date.now(), data: parsedCache };
				return json({
					success: true,
					cacheSource: 'valkey-l1',
					data: parsedCache,
				});
			}
		} catch {
			// Non-fatal: fall through to filesystem extraction
		}

		// 3. Single scan — pass precomputed list to avoid repeated filesystem walks
		const allEndpoints = getAllRouteEndpoints(includeArchived);
		const activeAPI = getActiveAPIEndpoints(allEndpoints);
		const archived = includeArchived ? getArchivedEndpoints(allEndpoints) : [];
		const categories = getRoutesByCategory(includeArchived, allEndpoints);
		const stats = getRouteStats(allEndpoints);

		const crossRefs = getAPICrossReferences(allEndpoints);
		const deadRoutes = getDeadRouteRefs(allEndpoints);

		const payload = {
			allEndpoints,
			activeAPI,
			archived,
			categories,
			stats,
			crossRefs,
			deadRoutes,
		};

		memoryCache = { key: cacheKey, ts: Date.now(), data: payload };

		try {
			const redis = getRedis();
			await Promise.race([
				redis.set(cacheKey, JSON.stringify(payload), 'EX', VALKEY_TTL_SECONDS),
				new Promise((resolve) => setTimeout(resolve, 250)),
			]);
		} catch {
			// Non-fatal cache write
		}

		return json({
			success: true,
			cacheSource: 'filesystem',
			data: payload,
		});
	} catch (err) {
		console.error('[/api/routes/metadata]', err);
		return json({
			success: false,
			cacheSource: 'error-fallback',
			error: 'Failed to extract route metadata',
			data: {
				allEndpoints: [],
				activeAPI: [],
				archived: [],
				categories: [],
				stats: {
					totalRoutes: 0,
					activeRoutes: 0,
					archivedRoutes: 0,
					apiEndpoints: 0,
					pageServers: 0,
					pages: 0,
					categories: 0,
					methodCounts: { GET: 0, POST: 0, PUT: 0, DELETE: 0, PATCH: 0, load: 0, actions: 0 },
					groupCounts: { app: 0, dev: 0, admin: 0, api: 0, system: 0, other: 0, archived: 0 },
					authRequired: 0,
					sse: 0
				},
				crossRefs: [],
				deadRoutes: []
			}
		});
	}
};

