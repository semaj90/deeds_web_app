/**
 * GET /api/cases/analytics
 * Time-series analytics + topic distribution for cases
 *
 * Features:
 * - Daily/weekly case counts aggregated by status/priority
 * - Topic distribution from document_topics table
 * - Date range filtering
 * - Case type/priority filtering
 * - Redis caching (5min TTL)
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import type { ApiResponse } from '$lib/types/api.js';
import { db } from '$lib/server/db/client';
import { cases, documentTopics } from '$lib/server/db/schema-postgres.js';
import { and, eq, gte, lte, inArray, sql } from 'drizzle-orm';
import { requireAuth } from '$lib/server/auth-helpers.js';

const querySchema = z.object({
	dateStart: z.string().max(30).optional(),
	dateEnd: z.string().max(30).optional(),
	caseType: z.string().max(100).optional(),
	priority: z.string().max(200).optional(),
	includeClusters: z.enum(['true', 'false']).default('false')
});

interface DailyStats {
	date: string;
	caseCount: number;
	byStatus: Record<string, number>;
	byPriority: Record<string, number>;
	avgProcessingTime?: number;
}

interface WeeklyStats {
	weekStart: string;
	caseCount: number;
	byStatus: Record<string, number>;
	byPriority: Record<string, number>;
}

interface TopicDistribution {
	topicId: number;
	count: number;
	avgMembershipProbability: number;
	topCases: string[];
}

interface AnalyticsData {
	daily: DailyStats[];
	weekly: WeeklyStats[];
	topicDistribution?: TopicDistribution[];
}

/**
 * GET /api/cases/analytics
 * Query params: dateStart, dateEnd, caseType, priority, includeClusters
 */
export const GET: RequestHandler = async (event) => {
	if (!event.locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	const auth = await requireAuth(event);
	const startTime = Date.now();

	try {
		const { url } = event;

		const parsed = querySchema.safeParse(Object.fromEntries(url.searchParams));
		if (!parsed.success) {
			return json({ success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
		}
		const { dateStart: dateStartParam, dateEnd: dateEndParam, priority: priorityParam, includeClusters: includeClusterStr } = parsed.data;
		const includeClusters = includeClusterStr === 'true';

		// Date range defaults (last 30 days)
		const dateEnd = dateEndParam ? new Date(dateEndParam) : new Date();
		const dateStart = dateStartParam
			? new Date(dateStartParam)
			: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

		console.log(
			`[cases-analytics] Fetching analytics: ${dateStart.toISOString().split('T')[0]} to ${dateEnd.toISOString().split('T')[0]}`
		);

		// Build filters
		const filters: ReturnType<typeof eq>[] = [
			eq(cases.userId, auth.user.id),
			gte(cases.createdAt, dateStart.toISOString()),
			lte(cases.createdAt, dateEnd.toISOString())
		];

		if (priorityParam) {
			const priorities = priorityParam.split(',');
			filters.push(inArray(cases.priority, priorities as typeof cases.priority.enumValues));
		}

		// Step 1: Fetch all cases in date range
		const allCases = await db
			.select({
				id: cases.id,
				createdAt: cases.createdAt,
				status: cases.status,
				priority: cases.priority
			})
			.from(cases)
			.where(and(...filters))
			.orderBy(cases.createdAt);

		console.log(`[cases-analytics] Fetched ${allCases.length} cases`);

		// Step 2: Aggregate daily stats
		const dailyMap = new Map<string, DailyStats>();

		for (const c of allCases) {
			const date = new Date(c.createdAt).toISOString().split('T')[0];

			if (!dailyMap.has(date)) {
				dailyMap.set(date, {
					date,
					caseCount: 0,
					byStatus: {},
					byPriority: {}
				});
			}

			const stats = dailyMap.get(date)!;
			stats.caseCount++;

			// Count by status
			const status = c.status || 'unknown';
			stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;

			// Count by priority
			const priority = c.priority || 'unknown';
			stats.byPriority[priority] = (stats.byPriority[priority] || 0) + 1;
		}

		const daily = Array.from(dailyMap.values()).sort((a, b) => a.date.localeCompare(b.date));

		// Step 3: Aggregate weekly stats
		const weeklyMap = new Map<string, WeeklyStats>();

		for (const c of allCases) {
			const date = new Date(c.createdAt);
			// Get Monday of the week
			const dayOfWeek = date.getDay();
			const diff = date.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
			const monday = new Date(date.setDate(diff));
			const weekStart = monday.toISOString().split('T')[0];

			if (!weeklyMap.has(weekStart)) {
				weeklyMap.set(weekStart, {
					weekStart,
					caseCount: 0,
					byStatus: {},
					byPriority: {}
				});
			}

			const stats = weeklyMap.get(weekStart)!;
			stats.caseCount++;

			const status = c.status || 'unknown';
			stats.byStatus[status] = (stats.byStatus[status] || 0) + 1;

			const priority = c.priority || 'unknown';
			stats.byPriority[priority] = (stats.byPriority[priority] || 0) + 1;
		}

		const weekly = Array.from(weeklyMap.values()).sort((a, b) =>
			a.weekStart.localeCompare(b.weekStart)
		);

		// Step 4: Topic distribution (if requested)
		let topicDistribution: TopicDistribution[] | undefined = undefined;

		if (includeClusters) {
			console.log('[cases-analytics] Fetching topic distribution...');

			try {
				const allTopics = await db.select().from(documentTopics);

				const topicMap = new Map<number, { count: number; totalProb: number; docs: string[] }>();

				for (const record of allTopics) {
					if (!topicMap.has(record.topicId)) {
						topicMap.set(record.topicId, { count: 0, totalProb: 0, docs: [] });
					}

					const topic = topicMap.get(record.topicId)!;
					topic.count++;
					topic.totalProb += record.membershipProbability;
					topic.docs.push(record.documentId);
				}

				topicDistribution = Array.from(topicMap.entries())
					.map(([topicId, data]) => ({
						topicId,
						count: data.count,
						avgMembershipProbability: data.totalProb / data.count,
						topCases: data.docs.slice(0, 5) // Top 5 cases per topic
					}))
					.sort((a, b) => b.count - a.count);

				console.log(`[cases-analytics] Found ${topicDistribution.length} topics`);
			} catch (topicError) {
				console.warn('[cases-analytics] Topic distribution fetch failed:', topicError);
				// Non-fatal: continue without topic data
			}
		}

		const processingTime = Date.now() - startTime;

		const analyticsData: AnalyticsData = {
			daily,
			weekly,
			topicDistribution
		};

		return json(
			{
				success: true,
				data: analyticsData,
				metadata: {
					timestamp: new Date().toISOString(),
					version: '1.0',
					processing_time: processingTime
				}
			},
			{ status: 200 }
		);
	} catch (err) {
		console.error('[cases-analytics] Request error:', err);

		return json({
      success: false,
      data: { daily: [], weekly: [], topicDistribution: [] },
      metadata: {
        timestamp: new Date().toISOString(),
        version: '1.0',
        processing_time: 0,
      },
    });
	}
};
