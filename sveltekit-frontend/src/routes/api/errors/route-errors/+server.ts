/**
 * Route Error Query Endpoint
 *
 * GET /api/errors/route-errors?route=/cases/[id]&limit=20&hours=24
 *
 * Returns recent error_events for a specific route path,
 * used by the Analysis Panel to show runtime issues on the current page.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './';
import { cacheControl, checkETag, notModified } from '$lib/server/middleware/cache-headers.js';
import { db } from '$lib/server/db/client';
import { errorEvents, errorClusters } from '$lib/server/db/schema-postgres.js';
import { eq, desc, sql, gte, and } from 'drizzle-orm';
import { z } from 'zod';

const routeErrorsSchema = z.object({
	route: z.string().min(1, 'route query parameter is required').max(200),
	limit: z.coerce.number().int().min(1).max(100).default(20),
	hours: z.coerce.number().int().min(1).max(168).default(24),
});

export const GET: RequestHandler = async ({ url, locals, request }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const parsed = routeErrorsSchema.safeParse({
    route: url.searchParams.get('route'),
    limit: url.searchParams.get('limit') ?? undefined,
    hours: url.searchParams.get('hours') ?? undefined,
  });

	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid params' }, { status: 400 });
	}

	const { route, limit, hours } = parsed.data;
	const since = new Date(Date.now() - hours * 60 * 60 * 1000);

	try {
		// Fetch recent errors for this route
		const errors = await db
			.select({
				id: errorEvents.id,
				kind: errorEvents.kind,
				severity: errorEvents.severity,
				message: errorEvents.message,
				stack: errorEvents.stack,
				lineNumber: errorEvents.lineNumber,
				columnNumber: errorEvents.columnNumber,
				file: errorEvents.file,
				clusterId: errorEvents.clusterId,
				collectedAt: errorEvents.collectedAt,
			})
			.from(errorEvents)
			.where(
				and(
					eq(errorEvents.routePath, route),
					gte(errorEvents.collectedAt, since),
				),
			)
			.orderBy(desc(errorEvents.collectedAt))
			.limit(limit);

		// Get aggregate counts by severity
		const aggregateResult = await db
			.select({
				severity: errorEvents.severity,
				count: sql<number>`count(*)::int`,
			})
			.from(errorEvents)
			.where(
				and(
					eq(errorEvents.routePath, route),
					gte(errorEvents.collectedAt, since),
				),
			)
			.groupBy(errorEvents.severity);

		const counts: Record<string, number> = {};
		for (const row of aggregateResult) {
			counts[row.severity] = row.count;
		}

		// Check for error clusters that affect this route
		let clusters: { id: string; pattern: string; severity: string; errorCount: number }[] = [];
		try {
			const clusterRows = await db
				.select({
					id: errorClusters.id,
					pattern: errorClusters.pattern,
					severity: errorClusters.severity,
					errorCount: errorClusters.errorCount,
				})
				.from(errorClusters)
				.where(sql`${errorClusters.routePaths} @> ARRAY[${route}]::text[]`)
				.orderBy(desc(errorClusters.errorCount))
				.limit(5);
			clusters = clusterRows;
		} catch {
			// routePaths array query may fail if column doesn't exist yet
		}

		const responseData = {
			route,
			errors,
			counts,
			clusters,
			total: errors.length,
			since: since.toISOString(),
		};

		const { etag, isMatch } = checkETag(responseData, request.headers);
		if (isMatch) return notModified(etag);

		return json(responseData, {
			headers: { ...cacheControl.short, ETag: etag }
		});
	} catch (err) {
		console.error('[route-errors] Query error:', err);
		const fallbackData = { route, errors: [], counts: {}, clusters: [], total: 0, since: since.toISOString() };
		return json(fallbackData, {
			headers: cacheControl.short
		});
	}
};
