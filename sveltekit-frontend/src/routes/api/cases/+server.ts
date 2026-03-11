import { cases, db } from '$lib/server/db/client';
import { json } from '@sveltejs/kit';
import { and, desc, eq, like, inArray } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { apiResponses, validateRequest } from '$lib/server/api/response-helper.js';
import { requireAuth } from '$lib/server/auth-helpers.js';
import { invalidateCaseCache } from '$lib/server/cache/invalidation.js';
import { z } from 'zod';

const CASE_STATUS = ['open', 'in_progress', 'pending_review', 'closed', 'archived'] as const;
const CASE_PRIORITY = ['low', 'medium', 'high', 'urgent'] as const;

const caseCreateSchema = z.object({
	title: z.string().min(1, 'Title is required').max(500),
	description: z.string().min(1, 'Description is required').max(10000),
	status: z.enum(CASE_STATUS).optional(),
	priority: z.enum(CASE_PRIORITY).optional()
});

const caseBulkSchema = z.object({
	ids: z.array(z.string().uuid()).min(1, 'Select at least one case'),
	status: z.enum(CASE_STATUS).optional(),
	priority: z.enum(CASE_PRIORITY).optional()
});

/**
 * GET /api/cases
 * Fetch cases for authenticated user with optional filtering
 * Query params: limit, offset, status, priority, search
 */
export const GET: RequestHandler = async (event) => {
	const auth = await requireAuth(event);

	const { url } = event;
	const limit = Number(url.searchParams.get('limit')) || 10;
	const offset = Number(url.searchParams.get('offset')) || 0;
	const status = url.searchParams.get('status');
	const priority = url.searchParams.get('priority');
	const search = url.searchParams.get('search');

	try {
		const filters = [];
		filters.push(eq(cases.userId, auth.user.id));

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

		return apiResponses.ok({
			cases: userCases,
			pagination: { limit, offset, hasMore: userCases.length === limit }
		});
	} catch (err) {
		console.error('Error fetching cases:', err);
		return apiResponses.serverError('Failed to fetch cases');
	}
};

/**
 * POST /api/cases
 * Create a new case
 */
export const POST: RequestHandler = async (event) => {
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
				userId: auth.user.id,
				status: (body.status ?? 'open') as any,
				priority: (body.priority ?? 'medium') as any,
				updatedAt: new Date().toISOString()
			})
			.returning();

		// Invalidate case list cache
		await invalidateCaseCache(newCase[0].id, 'case_update', auth.user.id)
			.catch(err => console.warn('[Cases] Cache invalidation failed:', err));

		// Track analytics event (non-blocking)
		import('$lib/server/queue/rabbitmq-manager-fixed.js').then(({ rabbitmq }) =>
			rabbitmq.publishAnalyticsEvent({ eventType: 'case_create', payload: { caseId: newCase[0].id, userId: auth.user.id } })
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
	const auth = await requireAuth(event);

	try {
		const raw = await event.request.json();
		const parsed = caseBulkSchema.safeParse(raw);
		if (!parsed.success) {
			return apiResponses.badRequest(parsed.error.issues[0]?.message ?? 'Invalid input');
		}
		const body = parsed.data;

		const updates: Partial<typeof cases.$inferSelect> = {
			updatedAt: new Date().toISOString()
		};

		if (body.status) updates.status = body.status;
		if (body.priority) updates.priority = body.priority;

		const updated = await db
			.update(cases)
			.set(updates)
			.where(
				and(
					eq(cases.assignedAttorney, auth.user.id),
					inArray(cases.id, body.ids)
				)
			)
			.returning();

		// Invalidate cache for all updated cases
		await Promise.all(
			updated.map(c => invalidateCaseCache(c.id, 'case_update', auth.user.id))
		).catch(err => console.warn('[Cases] Cache invalidation failed:', err));

		return apiResponses.ok({
			updated: updated.length,
			message: `Updated ${updated.length} cases`
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
				updatedAt: new Date().toISOString()
			})
			.where(
				and(
					eq(cases.assignedAttorney, auth.user.id),
					inArray(cases.id, body.ids)
				)
			)
			.returning();

		// Invalidate cache for all archived cases
		await Promise.all(
			archived.map(c => invalidateCaseCache(c.id, 'case_update', auth.user.id))
		).catch(err => console.warn('[Cases] Cache invalidation failed:', err));

		return apiResponses.ok({
			archived: archived.length,
			message: `Archived ${archived.length} cases`
		});
	} catch (err) {
		console.error('Error archiving cases:', err);
		return apiResponses.serverError('Failed to archive cases');
	}
};
