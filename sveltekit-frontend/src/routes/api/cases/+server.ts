import { cases, db } from '$lib/server/db/client';
import { json } from '@sveltejs/kit';
import { and, desc, eq, like, inArray } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { apiResponses, validateRequest } from '$lib/server/api/response-helper.js';
import { requireAuth } from '$lib/server/auth-helpers.js';
import { invalidateCaseCache } from '$lib/server/cache/invalidation.js';

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
			.offset(offset);

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
		const body = await event.request.json();

		const missing = validateRequest(body, ['title', 'description']);
		if (missing) {
			return apiResponses.badRequest(missing);
		}

		const newCase = await db
			.insert(cases)
			.values({
				title: body.title,
				description: body.description,
				userId: auth.user.id,
				status: (body?.status ?? 'open') as any,
				priority: (body?.priority ?? 'medium') as any,
				updatedAt: new Date().toISOString()
			})
			.returning();

		// Invalidate case list cache
		await invalidateCaseCache(newCase[0].id, 'case_update', auth.user.id)
			.catch(err => console.warn('[Cases] Cache invalidation failed:', err));

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
		const body = await event.request.json();

		if (!body?.ids || !Array.isArray(body.ids) || body.ids.length === 0) {
			return apiResponses.badRequest('Missing required field: ids (array)');
		}

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
		const body = await event.request.json();

		if (!body?.ids || !Array.isArray(body.ids) || body.ids.length === 0) {
			return apiResponses.badRequest('Missing required field: ids (array)');
		}

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
