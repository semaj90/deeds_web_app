import db from '$lib/server/db/drizzle.js';
import { errorClusterTable, errorSuggestionsTable, routeMetadata } from '$lib/server/db/schema/index.js';
import { error, json } from '@sveltejs/kit';
import { desc, eq, sql } from 'drizzle-orm';
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

	try {
		// 1. Get route health statistics.select({
				total: sql<number>`COUNT(*)::int`,
				healthy: sql<number>`COUNT(*) FILTER (WHERE status = 'healthy')::int`,
				degraded: sql<number>`COUNT(*) FILTER (WHERE status = 'degraded')::int`,
				critical: sql<number>`COUNT(*) FILTER (WHERE status = 'critical')::int`,
				maintenance: sql<number>`COUNT(*) FILTER (WHERE status = 'maintenance')::int`
			})
			.from(routeMetadata)
			.execute();

		// 2. Get critical routes (top 10 by priority).select({
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

		// 3. Get AI suggestions with their associated routes.select({
				id: errorSuggestionsTable.id,
				routePath: errorSuggestionsTable.routePath,
				summary: errorSuggestionsTable.summary,
				patch: errorSuggestionsTable.patch,
				riskLevel: errorSuggestionsTable.riskLevel,
				source: errorSuggestionsTable.source,
				applied: errorSuggestionsTable.applied,
				createdAt: errorSuggestionsTable.createdAt
			})
			.from(errorSuggestionsTable)
			.orderBy(desc(errorSuggestionsTable.createdAt))
			.limit(20);

		// 4. Get suggestion quality statistics.select({
				total: sql<number>`COUNT(*)::int`,
				complete: sql<number>`COUNT(*) FILTER (WHERE LENGTH(patch) >= 100 AND patch NOT LIKE '%See error messages%')::int`,
				incomplete: sql<number>`COUNT(*) FILTER (WHERE LENGTH(patch) < 100)::int`,
				generic: sql<number>`COUNT(*) FILTER (WHERE patch LIKE '%See error messages%')::int`,
				highRisk: sql<number>`COUNT(*) FILTER (WHERE risk_level = 'high')::int`,
				mediumRisk: sql<number>`COUNT(*) FILTER (WHERE risk_level = 'medium')::int`,
				lowRisk: sql<number>`COUNT(*) FILTER (WHERE risk_level = 'low')::int`,
				applied: sql<number>`COUNT(*) FILTER (WHERE applied = true)::int`
			})
			.from(errorSuggestionsTable)
			.execute();

		// 5. Get error cluster statistics.select({
				total: sql<number>`COUNT(*)::int`,
				active: sql<number>`COUNT(*) FILTER (WHERE resolved_at IS NULL)::int`,
				resolved: sql<number>`COUNT(*) FILTER (WHERE resolved_at IS NOT NULL)::int`
			})
			.from(errorClusterTable)
			.execute();

		return json({
			timestamp: new Date().toISOString(),
			status: 'active',
			routes: { stats: routeStats[0],
				critical: criticalRoutes
			},
			suggestions: { stats: suggestionStats[0],
				recent: suggestions
			},
			clusters: clusterStats[0],
			systemHealth: { database: 'connected',
				qdrant: 'unknown',
				ollama: 'unknown'
			}
		});
	} catch (err) {
		console.error('Phase 78 API Error:', err);
		return json({ status: 'error', message: 'Internal Server Error' }, { status: 500 });
	}
};



