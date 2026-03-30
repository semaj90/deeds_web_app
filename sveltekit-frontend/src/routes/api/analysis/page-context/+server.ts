/**
 * Page Context Bundle Orchestrator
 *
 * POST /api/analysis/page-context
 * Body: { route: string, includePlaywright?: boolean }
 *
 * Assembles a full page context bundle for the Analysis Panel:
 *   1. Route→component tree (via /api/codebase-index/route-components)
 *   2. AST subgraph (page-local dependency neighborhood)
 *   3. Runtime errors (from error_events table, last 24h)
 *   4. Network failures (from api_audit_log, matching page's API endpoints)
 *   5. Playwright snapshot (from latest report.json)
 *   6. Error clusters (affecting this route)
 *
 * Cached in Redis for 5 minutes.
 */
import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { db } from '$lib/server/db/client';
import { errorEvents, errorClusters, apiAuditLog } from '$lib/server/db/schema-postgres.js';
import { eq, desc, sql, gte, and, inArray } from 'drizzle-orm';
import { setCache, cognitiveCache } from '$lib/server/cache.js';

const bodySchema = z.object({
	route: z.string().min(1).max(500),
	includePlaywright: z.boolean().optional().default(false),
});

const PAGE_CONTEXT_CACHE_TTL_MS = 5 * 60 * 1000;

export const POST: RequestHandler = async ({ request, locals, url, fetch: skFetch }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
	}

	const { route, includePlaywright } = parsed.data;
	const startMs = Date.now();
	const timings: Record<string, number> = {};

	// Check cache
	const cacheKey = `analysis:page-context:${createHash('sha256').update(route).digest('hex').slice(0, 16)}`;
	const cached = await cognitiveCache.getJsonbDocument<Record<string, unknown>>(cacheKey);
	if (cached) {
		return json({ ...cached, cached: true });
	}

	// Run all data sources in parallel
	const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);

	const [componentsResult, errorsResult, clustersResult, playwrightResult] = await Promise.allSettled([
		// 1. Route→Component tree
		(async () => {
			const t = Date.now();
			try {
				const res = await skFetch(`/api/codebase-index/route-components?route=${encodeURIComponent(route)}`);
				timings.componentsMs = Date.now() - t;
				if (!res.ok) return null;
				return await res.json();
			} catch {
				timings.componentsMs = Date.now() - t;
				return null;
			}
		})(),

		// 2. Runtime errors (from error_events, last 24h)
		(async () => {
			const t = Date.now();
			try {
				const rows = await db
					.select({
						id: errorEvents.id,
						kind: errorEvents.kind,
						severity: errorEvents.severity,
						message: errorEvents.message,
						stack: errorEvents.stack,
						file: errorEvents.file,
						lineNumber: errorEvents.lineNumber,
						clusterId: errorEvents.clusterId,
						collectedAt: errorEvents.collectedAt,
					})
					.from(errorEvents)
					.where(
						and(
							eq(errorEvents.routePath, route),
							gte(errorEvents.collectedAt, since24h),
						),
					)
					.orderBy(desc(errorEvents.collectedAt))
					.limit(20);
				timings.errorsMs = Date.now() - t;
				return rows;
			} catch {
				timings.errorsMs = Date.now() - t;
				return [];
			}
		})(),

		// 3. Error clusters affecting this route
		(async () => {
			const t = Date.now();
			try {
				const rows = await db
					.select({
						id: errorClusters.id,
						pattern: errorClusters.pattern,
						severity: errorClusters.severity,
						errorCount: errorClusters.errorCount,
						lastUpdated: errorClusters.lastUpdated,
					})
					.from(errorClusters)
					.where(sql`${errorClusters.routePaths} @> ARRAY[${route}]::text[]`)
					.orderBy(desc(errorClusters.errorCount))
					.limit(5);
				timings.clustersMs = Date.now() - t;
				return rows;
			} catch {
				timings.clustersMs = Date.now() - t;
				return [];
			}
		})(),

		// 4. Playwright snapshot (from latest report.json)
		(async () => {
			if (!includePlaywright) return null;
			const t = Date.now();
			try {
				const reportPath = resolve(process.cwd(), '..', 'scripts', 'tests', 'screenshots', 'latest', 'report.json');
				const raw = readFileSync(reportPath, 'utf-8');
				const report = JSON.parse(raw) as {
					timestamp: string;
					results: {
						path: string;
						status: number;
						ok: boolean;
						consoleErrors: string[];
						consoleWarnings: string[];
						failedRequests: string[];
						loadTimeMs: number;
						domElements: number;
					}[];
				};

				// Find matching route in Playwright results
				const match = report.results.find((r) => {
					const normalizedPath = r.path.replace(/^\//, '');
					const normalizedRoute = route.replace(/^\//, '');
					return normalizedPath === normalizedRoute || r.path === route;
				});

				timings.playwrightMs = Date.now() - t;
				if (!match) return null;

				return {
					timestamp: report.timestamp,
					status: match.status,
					ok: match.ok,
					consoleErrors: match.consoleErrors || [],
					consoleWarnings: (match.consoleWarnings || []).slice(0, 5),
					failedRequests: match.failedRequests || [],
					loadTimeMs: match.loadTimeMs,
					domElements: match.domElements,
				};
			} catch {
				timings.playwrightMs = Date.now() - t;
				return null;
			}
		})(),
	]);

	// Extract component data for network failure lookup
	const components = componentsResult.status === 'fulfilled' ? componentsResult.value : null;
	const runtimeErrors = errorsResult.status === 'fulfilled' ? errorsResult.value : [];
	const clusters = clustersResult.status === 'fulfilled' ? clustersResult.value : [];
	const playwrightSnapshot = playwrightResult.status === 'fulfilled' ? playwrightResult.value : null;

	// 5. Network failures — query api_audit_log for failed requests to this page's API endpoints
	let networkFailures: { path: string; statusCode: number; count: number; lastSeen: string }[] = [];
	if (components?.files?.apiEndpoints?.length > 0) {
		const t = Date.now();
		try {
			const endpoints: string[] = components.files.apiEndpoints.slice(0, 20);
			const rows = await db
				.select({
					path: apiAuditLog.path,
					statusCode: apiAuditLog.statusCode,
					count: sql<number>`count(*)::int`,
					lastSeen: sql<string>`max(${apiAuditLog.createdAt})::text`,
				})
				.from(apiAuditLog)
				.where(
					and(
						gte(apiAuditLog.statusCode, 400),
						gte(apiAuditLog.createdAt, since24h),
						inArray(apiAuditLog.path, endpoints),
					),
				)
				.groupBy(apiAuditLog.path, apiAuditLog.statusCode)
				.orderBy(desc(sql`count(*)`))
				.limit(20);
			networkFailures = rows;
		} catch {
			// api_audit_log may not have data yet
		}
		timings.networkMs = Date.now() - t;
	}

	// Assemble the page context bundle
	const result = {
		route,
		components: components?.files ?? null,
		totalFiles: components?.totalFiles ?? 0,
		runtimeErrors,
		networkFailures,
		clusters,
		playwrightSnapshot,
		timing: {
			totalMs: Date.now() - startMs,
			...timings,
		},
	};

	// Cache for 5 minutes under both keys
	await setCache(cacheKey, result, PAGE_CONTEXT_CACHE_TTL_MS);
	// Also cache under ast:pagectx: key for hot-cache lookups from diagnosis pipeline
	const routeHash = createHash('sha256').update(route).digest('hex').slice(0, 16);
	await setCache(`ast:pagectx:${routeHash}`, result, PAGE_CONTEXT_CACHE_TTL_MS).catch(() => {});

	return json(result);
};
