/**
 * Diagnosis History API — Full CRUD + Redis-cached queries
 *
 * GET    /api/error-brain/diagnosis-history?route=...&mode=...&rootCause=...&limit=20
 *   → Returns recent diagnosis events with aggregate stats (cached 2 min)
 *
 * POST   /api/error-brain/diagnosis-history
 *   → Submit feedback on a diagnosis (accurate, helpful)
 *
 * PATCH  /api/error-brain/diagnosis-history
 *   → Update diagnosis metadata (notes, rootCause reclassification)
 *
 * DELETE /api/error-brain/diagnosis-history
 *   → Delete a diagnosis event by ID
 */
import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { createHash } from 'crypto';
import { db } from '$lib/server/db/client';
import { diagnosisEvents } from '$lib/server/db/schema-postgres.js';
import { eq, desc, and, sql } from 'drizzle-orm';
import { setCache, cognitiveCache } from '$lib/server/cache.js';

const HISTORY_CACHE_TTL_MS = 2 * 60 * 1000; // 2 min

const getSchema = z.object({
	route: z.string().max(255).optional(),
	mode: z.enum(['file', 'page', 'route', 'test', 'error-event']).optional(),
	rootCause: z.string().max(50).optional(),
	limit: z.coerce.number().int().min(1).max(100).default(20),
	skipCache: z.coerce.boolean().optional().default(false),
});

const feedbackSchema = z.object({
	diagnosisId: z.string().uuid(),
	accurate: z.boolean().optional(),
	helpful: z.boolean().optional(),
});

const patchSchema = z.object({
	diagnosisId: z.string().uuid(),
	probableRootCauseType: z.string().max(50).optional(),
	riskLevel: z.enum(['low', 'medium', 'high']).optional(),
	needsHumanReview: z.boolean().optional(),
	unsafeToAutoPatch: z.boolean().optional(),
});

const deleteSchema = z.object({
	diagnosisId: z.string().uuid(),
});

export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const parsed = getSchema.safeParse(Object.fromEntries(url.searchParams));
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid params' }, { status: 400 });
	}

	const { route, mode, rootCause, limit, skipCache } = parsed.data;

	// Redis cache key for this exact query combination
	const cacheInput = `history:${route || ''}:${mode || ''}:${rootCause || ''}:${limit}`;
	const cacheKey = `ast:diagnosis:history:${createHash('sha256').update(cacheInput).digest('hex').slice(0, 16)}`;

	if (!skipCache) {
		const cached = await cognitiveCache.getJsonbDocument<Record<string, unknown>>(cacheKey);
		if (cached) return json({ ...cached, cached: true });
	}

	try {
		const conditions = [];
		if (route) conditions.push(eq(diagnosisEvents.routePath, route));
		if (mode) conditions.push(eq(diagnosisEvents.mode, mode));
		if (rootCause) conditions.push(eq(diagnosisEvents.probableRootCauseType, rootCause));

		// Run query + stats in parallel
		const [rows, statsResult] = await Promise.all([
			db
				.select({
					id: diagnosisEvents.id,
					routePath: diagnosisEvents.routePath,
					filePath: diagnosisEvents.filePath,
					query: diagnosisEvents.query,
					mode: diagnosisEvents.mode,
					probableRootCauseType: diagnosisEvents.probableRootCauseType,
					riskLevel: diagnosisEvents.riskLevel,
					diagnosis: diagnosisEvents.diagnosis,
					likelyFiles: diagnosisEvents.likelyFiles,
					impactedFiles: diagnosisEvents.impactedFiles,
					fixPlan: diagnosisEvents.fixPlan,
					suggestedTests: diagnosisEvents.suggestedTests,
					totalMs: diagnosisEvents.totalMs,
					cached: diagnosisEvents.cached,
					needsHumanReview: diagnosisEvents.needsHumanReview,
					unsafeToAutoPatch: diagnosisEvents.unsafeToAutoPatch,
					feedbackAccurate: diagnosisEvents.feedbackAccurate,
					feedbackHelpful: diagnosisEvents.feedbackHelpful,
					createdAt: diagnosisEvents.createdAt,
				})
				.from(diagnosisEvents)
				.where(conditions.length > 0 ? and(...conditions) : undefined)
				.orderBy(desc(diagnosisEvents.createdAt))
				.limit(limit),
			db.execute(sql`
				SELECT
					COUNT(*) AS total,
					COUNT(DISTINCT route_path) AS unique_routes,
					AVG(total_ms)::int AS avg_ms,
					COUNT(*) FILTER (WHERE feedback_accurate = true) AS accurate_count,
					COUNT(*) FILTER (WHERE feedback_accurate = false) AS inaccurate_count,
					COUNT(DISTINCT probable_root_cause_type) AS root_cause_types,
					COUNT(*) FILTER (WHERE risk_level = 'high') AS high_risk_count
				FROM diagnosis_events
				${route ? sql`WHERE route_path = ${route}` : sql``}
			`).catch(() => ({ rows: [{}] })),
		]);

		const stats = (statsResult.rows[0] ?? {}) as Record<string, unknown>;

		const result = {
			events: rows,
			stats: {
				total: Number(stats.total ?? 0),
				uniqueRoutes: Number(stats.unique_routes ?? 0),
				avgMs: Number(stats.avg_ms ?? 0),
				accurateCount: Number(stats.accurate_count ?? 0),
				inaccurateCount: Number(stats.inaccurate_count ?? 0),
				rootCauseTypes: Number(stats.root_cause_types ?? 0),
				highRiskCount: Number(stats.high_risk_count ?? 0),
			},
		};

		// Cache the response for 2 min
		setCache(cacheKey, result, HISTORY_CACHE_TTL_MS).catch(() => {});

		return json(result);
	} catch (e) {
		console.warn('[diagnosis-history] Query error:', (e as Error).message);
		return json({ events: [], stats: { total: 0, uniqueRoutes: 0, avgMs: 0, accurateCount: 0, inaccurateCount: 0, rootCauseTypes: 0, highRiskCount: 0 } });
	}
};

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const parsed = feedbackSchema.safeParse(await request.json().catch(() => ({})));
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
	}

	const { diagnosisId, accurate, helpful } = parsed.data;

	try {
		const updates: Record<string, boolean> = {};
		if (accurate !== undefined) updates.feedbackAccurate = accurate;
		if (helpful !== undefined) updates.feedbackHelpful = helpful;

		if (Object.keys(updates).length === 0) {
			return json({ error: 'No feedback fields provided' }, { status: 400 });
		}

		await db
			.update(diagnosisEvents)
			.set(updates)
			.where(eq(diagnosisEvents.id, diagnosisId));

		return json({ ok: true, diagnosisId });
	} catch (e) {
		console.warn('[diagnosis-history] Feedback error:', (e as Error).message);
		return json({ error: 'Failed to save feedback' }, { status: 500 });
	}
};

export const PATCH: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const parsed = patchSchema.safeParse(await request.json().catch(() => ({})));
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
	}

	const { diagnosisId, ...fields } = parsed.data;
	const updates: Record<string, unknown> = {};
	if (fields.probableRootCauseType !== undefined) updates.probableRootCauseType = fields.probableRootCauseType;
	if (fields.riskLevel !== undefined) updates.riskLevel = fields.riskLevel;
	if (fields.needsHumanReview !== undefined) updates.needsHumanReview = fields.needsHumanReview;
	if (fields.unsafeToAutoPatch !== undefined) updates.unsafeToAutoPatch = fields.unsafeToAutoPatch;

	if (Object.keys(updates).length === 0) {
		return json({ error: 'No update fields provided' }, { status: 400 });
	}

	try {
		const [updated] = await db
			.update(diagnosisEvents)
			.set(updates)
			.where(eq(diagnosisEvents.id, diagnosisId))
			.returning({ id: diagnosisEvents.id, probableRootCauseType: diagnosisEvents.probableRootCauseType });

		if (!updated) return json({ error: 'Diagnosis not found' }, { status: 404 });

		return json({ ok: true, updated });
	} catch (e) {
		console.warn('[diagnosis-history] Patch error:', (e as Error).message);
		return json({ error: 'Failed to update diagnosis' }, { status: 500 });
	}
};

export const DELETE: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const parsed = deleteSchema.safeParse(await request.json().catch(() => ({})));
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
	}

	try {
		const [deleted] = await db
			.delete(diagnosisEvents)
			.where(eq(diagnosisEvents.id, parsed.data.diagnosisId))
			.returning({ id: diagnosisEvents.id });

		if (!deleted) return json({ error: 'Diagnosis not found' }, { status: 404 });

		return json({ ok: true, deletedId: deleted.id });
	} catch (e) {
		console.warn('[diagnosis-history] Delete error:', (e as Error).message);
		return json({ error: 'Failed to delete diagnosis' }, { status: 500 });
	}
};
