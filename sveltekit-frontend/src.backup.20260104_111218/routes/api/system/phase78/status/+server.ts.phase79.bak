import db from '$lib/server/db/drizzle.js';
import { errorClusters, errorSuggestions, routeMetadata } from '$lib/server/db/schema/index.js';
import { error, json } from '@sveltejs/kit';
import { desc, eq, sql as sqlOp } from 'drizzle-orm';
import type { RequestHandler } from './$types.js';

/**
 * Phase 78 System Status API
 *
 * Returns:
 * - Critical/degraded routes
 * - AI-generated fix suggestions
 * - Error cluster statistics
 *
 * 🔒 Requires authentication
 */
export const GET: RequestHandler = async ({ locals }) => {
	// 🔒 Security: Only authenticated users can access system status
	if (!locals.user) {
		throw error(401, 'Unauthorized - Please log in');
	}

	// Optional: Restrict to admin role
	// if (locals.user.role !== 'admin') {
	//   throw error(403, 'Forbidden - Admin access required');
	// }

	try {
		// 1. Get route health statistics
		const routeStats = await db
			.select({
				total: sqlOp<number>`COUNT(*)::int`,
				healthy: sqlOp<number>`COUNT(*) FILTER (WHERE status = 'healthy')::int`,
				degraded: sqlOp<number>`COUNT(*) FILTER (WHERE status = 'degraded')::int`,
				critical: sqlOp<number>`COUNT(*) FILTER (WHERE status = 'critical')::int`,
				maintenance: sqlOp<number>`COUNT(*) FILTER (WHERE status = 'maintenance')::int`
			})
			.from(routeMetadata)
			.execute();

		// 2. Get critical routes (top 10 by priority)
		const criticalRoutes = await db
			.select({
				id: routeMetadata.id,
				path: routeMetadata.path,
				kind: routeMetadata.kind,
				status: routeMetadata.status,
				priority: routeMetadata.priority,
				group: routeMetadata.group
			})
			.from(routeMetadata)
			.where(eq(routeMetadata.status, 'critical'))
			.orderBy(desc(routeMetadata.priority))
			.limit(10);

		// 3. Get AI suggestions with their associated routes
		const suggestions = await db
			.select({
				id: errorSuggestions.id,
				routePath: errorSuggestions.routePath,
				summary: errorSuggestions.summary,
				patch: errorSuggestions.patch,
				riskLevel: errorSuggestions.riskLevel,
				source: errorSuggestions.source,
				applied: errorSuggestions.applied,
				createdAt: errorSuggestions.createdAt
			})
			.from(errorSuggestions)
			.orderBy(desc(errorSuggestions.createdAt))
			.limit(20);

		// 4. Get suggestion quality statistics
		const suggestionStats = await db
			.select({
				total: sqlOp<number>`COUNT(*)::int`,
				complete: sqlOp<number>`COUNT(*) FILTER (WHERE LENGTH(patch) >= 100 AND patch NOT LIKE '%See error messages%')::int`,
				incomplete: sqlOp<number>`COUNT(*) FILTER (WHERE LENGTH(patch) < 100)::int`,
				generic: sqlOp<number>`COUNT(*) FILTER (WHERE patch LIKE '%See error messages%')::int`,
				highRisk: sqlOp<number>`COUNT(*) FILTER (WHERE risk_level = 'high')::int`,
				mediumRisk: sqlOp<number>`COUNT(*) FILTER (WHERE risk_level = 'medium')::int`,
				lowRisk: sqlOp<number>`COUNT(*) FILTER (WHERE risk_level = 'low')::int`,
				applied: sqlOp<number>`COUNT(*) FILTER (WHERE applied = true)::int`
			})
			.from(errorSuggestions)
			.execute();

		// 5. Get error cluster statistics
		const clusterStats = await db
			.select({
				total: sqlOp<number>`COUNT(*)::int`,
				active: sqlOp<number>`COUNT(*) FILTER (WHERE resolved_at IS NULL)::int`,
				resolved: sqlOp<number>`COUNT(*) FILTER (WHERE resolved_at IS NOT NULL)::int`
			})
			.from(errorClusters)
			.execute();

		return json({
			timestamp: new Date().toISOString(),
			status: 'active',
			routes: {
				stats: routeStats[0],
				critical: criticalRoutes
			},
			suggestions: {
				stats: suggestionStats[0],
				recent: suggestions
			},
			clusters: clusterStats[0],
			systemHealth: {
				database: 'connected',
				qdrant: 'unknown', // Could add health check
				ollama: 'unknown'
			}
		});
	} catch (err) {
		console.error('Phase 78 API Error:', err);
		return json({
			message: 'Failed to fetch system status',
			details: err instanceof Error ? err.message : 'Unknown error'
		}, { status: 500 });
	}
};
