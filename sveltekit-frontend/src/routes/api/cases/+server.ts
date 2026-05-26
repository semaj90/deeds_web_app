import { cases, db } from '$lib/server/db/client';
import { json } from '@sveltejs/kit';
import { and, desc, eq, like, inArray } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { apiResponses, validateRequest } from '$lib/server/api/response-helper.js';
import { requireAuth } from '$lib/server/auth-helpers.js';
import { invalidateCaseCache } from '$lib/server/cache/invalidation.js';
import { cacheControl, checkETag, notModified } from '$lib/server/middleware/cache-headers.js';
import { z } from 'zod';
import { syncCaseToGraph } from '$lib/server/graph/pg-neo4j-sync.js';
import { insertCaseSchema } from '$lib/server/db/zod-schemas.js';

const CASE_STATUS = ['open', 'in_progress', 'pending_review', 'closed', 'archived'] as const;
const CASE_PRIORITY = ['low', 'medium', 'high', 'critical', 'urgent'] as const;

const caseCreateSchema = z.object({
	title: insertCaseSchema.shape.title,
	description: z.string().min(1, 'Description is required').max(10000),
	status: insertCaseSchema.shape.status,
	priority: insertCaseSchema.shape.priority
});

const caseBulkSchema = z.object({
	ids: z.array(z.string().uuid()).min(1, 'Select at least one case'),
	status: insertCaseSchema.shape.status,
	priority: insertCaseSchema.shape.priority
});

const caseListQuerySchema = z.object({
	limit: z.coerce.number().int().min(1).max(100).default(10),
	offset: z.coerce.number().int().min(0).default(0),
	status: z.enum([...CASE_STATUS, 'active']).nullish(),
	priority: z.enum(CASE_PRIORITY).nullish(),
	search: z.string().max(500).nullish(),
});

/**
 * GET /api/cases
 * Fetch cases for authenticated user with optional filtering
 * Query params: limit, offset, status, priority, search
 */
export const GET: RequestHandler = async (event) => {
	if (!event.locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	const auth = await requireAuth(event);

	const { url } = event;
	const parsed = caseListQuerySchema.safeParse({
		limit: url.searchParams.get('limit') ?? undefined,
		offset: url.searchParams.get('offset') ?? undefined,
		status: url.searchParams.get('status'),
		priority: url.searchParams.get('priority'),
		search: url.searchParams.get('search'),
	});
	if (!parsed.success) return apiResponses.badRequest(parsed.error.issues[0]?.message ?? 'Invalid query');
	const { limit, offset, status, priority, search } = parsed.data;

	try {
		const filters = [];
		filters.push(eq(cases.userId, Number(auth.user.id)));

		if (status) {
			const statusValue = status === 'active' ? 'open' : status;
			filters.push(eq(cases.status, statusValue as typeof cases.status.enumValues[number]));
		}
		if (priority) {
			filters.push(eq(cases.priority, priority as typeof cases.priority.enumValues[number]));
		}
		if (search) {
			filters.push(like(cases.title, `%${search}%`));
		}

		const userCases = await db
			.select()
			.from(cases)
			.where(and(...filters))
			.orderBy(desc(cases.updatedAt))
			.limit(limit)
			.offset(offset)
			.$withCache({ config: { ex: 30 } });

		const responseData = {
			cases: userCases,
			pagination: { limit, offset, hasMore: userCases.length === limit }
		};

		// ETag check for 304 response
		const { etag, isMatch } = checkETag(responseData, event.request.headers);
		if (isMatch) return notModified(etag);

		return json(
			{ success: true, data: responseData, timestamp: Date.now() },
			{ headers: { ...cacheControl.private, ETag: etag } }
		);
	} catch (err) {
		console.error('Error fetching cases:', err);
		return json(
      {
        success: false,
        data: { cases: [], pagination: { limit, offset, hasMore: false } },
        timestamp: Date.now(),
        degraded: true,
      },
      { headers: cacheControl.private }
    );
	}
};

/**
 * POST /api/cases
 * Create a new case
 */
export const POST: RequestHandler = async (event) => {
	if (!event.locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	const auth = await requireAuth(event);

	try {
		const raw = await event.request.json();
		const parsed = caseCreateSchema.safeParse(raw);
		if (!parsed.success) {
			return apiResponses.badRequest(parsed.error.issues[0]?.message ?? 'Invalid input');
		}
		const body = parsed.data;

		const newCase = await db
			.insert(cases)
			.values({
				title: body.title,
				description: body.description,
				userId: Number(auth.user.id), // cases.user_id is integer (DB migrated 2026-05-10)
				status: (body.status ?? 'open') as typeof cases.status.enumValues[number],
				priority: (body.priority ?? 'medium') as typeof cases.priority.enumValues[number],
				updatedAt: new Date().toISOString()
			})
			.returning();

		// Invalidate case list cache
		await invalidateCaseCache(newCase[0].id, 'case_update', auth.user.id)
			.catch(err => console.warn('[Cases] Cache invalidation failed:', err));

		// Sync new case to Neo4j graph (non-blocking)
		syncCaseToGraph(newCase[0].id).catch(err => console.warn('[neo4j-sync] case create:', err));

		// Track analytics event (non-blocking)
		import('$lib/server/queue/dispatch-inline.js').then(({ dispatchOrExecuteInline }) =>
			dispatchOrExecuteInline('analytics.track', { eventType: 'case_create', payload: { caseId: newCase[0].id, userId: auth.user.id } })
		).catch(() => {});

		return apiResponses.created({
			case: newCase[0],
			message: 'Case created successfully'
		});
	} catch (err) {
		console.error('Error creating case:', err);
		return apiResponses.serverError('Failed to create case');
	}
};

/**
 * PATCH /api/cases
 * Bulk update multiple cases
 */
export const PATCH: RequestHandler = async (event) => {
  if (!event.locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
  const auth = await requireAuth(event);

  try {
    const raw = await event.request.json();
    const parsed = caseBulkSchema.safeParse(raw);
    if (!parsed.success) {
      return apiResponses.badRequest(parsed.error.issues[0]?.message ?? 'Invalid input');
    }
    const body = parsed.data;

    const updates: Partial<typeof cases.$inferSelect> = {
      updatedAt: new Date().toISOString(),
    };

    if (body.status) updates.status = body.status;
    if (body.priority) updates.priority = body.priority;

    const updated = await db
      .update(cases)
      .set(updates)
      .where(and(eq(cases.userId, Number(auth.user.id)), inArray(cases.id, body.ids)))
      .returning();

    // Invalidate cache for all updated cases
    await Promise.all(
      updated.map((c) => invalidateCaseCache(c.id, 'case_update', auth.user.id))
    ).catch((err) => console.warn('[Cases] Cache invalidation failed:', err));

    // Sync updated cases to Neo4j graph (non-blocking)
    for (const c of updated) {
      syncCaseToGraph(c.id).catch(err => console.warn('[neo4j-sync] case update:', err));
    }

    return apiResponses.ok({
      updated: updated.length,
      message: `Updated ${updated.length} cases`,
    });
  } catch (err) {
    console.error('Error updating cases:', err);
    return apiResponses.serverError('Failed to update cases');
  }
};

/**
 * DELETE /api/cases
 * Bulk delete cases (soft delete by setting status to 'archived')
 */
export const DELETE: RequestHandler = async (event) => {
  if (!event.locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
  const auth = await requireAuth(event);

  try {
    const raw = await event.request.json();
    const parsed = caseBulkSchema.safeParse(raw);
    if (!parsed.success) {
      return apiResponses.badRequest(parsed.error.issues[0]?.message ?? 'Invalid input');
    }
    const body = parsed.data;

    const archived = await db
      .update(cases)
      .set({
        status: 'archived',
        updatedAt: new Date().toISOString(),
      })
      .where(and(eq(cases.userId, Number(auth.user.id)), inArray(cases.id, body.ids)))
      .returning();

    // Invalidate cache for all archived cases
    await Promise.all(
      archived.map((c) => invalidateCaseCache(c.id, 'case_update', auth.user.id))
    ).catch((err) => console.warn('[Cases] Cache invalidation failed:', err));

    // Sync archived status to Neo4j graph (non-blocking)
    for (const c of archived) {
      syncCaseToGraph(c.id).catch(err => console.warn('[neo4j-sync] case archive:', err));
    }

    return apiResponses.ok({
      archived: archived.length,
      message: `Archived ${archived.length} cases`,
    });
  } catch (err) {
    console.error('Error archiving cases:', err);
    return apiResponses.serverError('Failed to archive cases');
  }
};
