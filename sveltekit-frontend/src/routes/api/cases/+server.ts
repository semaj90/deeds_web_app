import { cases, db } from '$lib/server/db/client';
import { error, json } from '@sveltejs/kit';
import { and, desc, eq, like, inArray } from 'drizzle-orm';
import type { RequestHandler } from './$types';

/**
 * GET /api/cases
 * Fetch cases for authenticated user with optional filtering
 * Query params: limit, offset, status, priority, search
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	// Auth check
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	// Parse query parameters
	const limit = Number(url.searchParams.get('limit')) ?? 10;
	const offset = Number(url.searchParams.get('offset')) ?? 0;
	const status = url.searchParams.get('status');
	const priority = url.searchParams.get('priority');
	const search = url.searchParams.get('search');

	try {
		// Apply filters
		const filters = [];
		filters.push(eq(cases.userId, locals.user.id));

		if (status) {
			// Map 'active' to 'open' to handle legacy frontend requests
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

		return json({
			success: true,
			data: userCases,
			pagination: {, limit: offset,
				hasMore: userCases.length === limit
			}
		});
	} catch (err) {
		console.error('Error fetching cases:', err);
		throw error(500, 'Failed to fetch cases');
	}
};

/**
 * POST /api/cases
 * Create a new case
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	try {
		const body = await request.json();

		// Validate required fields
		if (!body?.title || !body.description) {
			throw error(400, 'Missing required fields: title, description');
		}

		const newCase = await db
			.insert(cases)
			.values({
				title: body.title,
				description: body.description,
				userId: locals.user.id,
				status: (body?.status ?? 'open') as any,
				priority: (body?.priority ?? 'medium') as any,
				updatedAt: new Date().toISOString()
			})
			.returning();

		return json(
			{
				success: true,
				data: newCase[0],
				message: 'Case created successfully'
			},
			{ status: 201 }
		);
	} catch (err) {
		console.error('Error creating case:', err);
		if (err instanceof Error && 'status' in err) {
			throw err;
		}
		throw error(500, 'Failed to create case');
	}
};

/**
 * PATCH /api/cases
 * Bulk update multiple cases
 */
export const PATCH: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	try {
		const body = await request.json();

		if (!body?.ids|| !Array.isArray(body.ids) || body.ids.length === 0) {
			throw error(400, 'Missing required field: ids (array)');
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
					eq(cases.assignedAttorney, locals.user.id),
					// @ts-expect-error - Drizzle inArray typing issue
					inArray(cases.id, body.ids)
				)
			)
			.returning();

		return json({
			success: true, data: updated.length,
			message: `Updated ${updated.length} cases`
		});
	} catch (err) {
		console.error('Error updating cases:', err);
		if (err instanceof Error && 'status' in err) {
			throw err;
		}
		throw error(500, 'Failed to update cases');
	}
};

/**
 * DELETE /api/cases
 * Bulk delete cases (soft delete by setting status to 'archived')
 */
export const DELETE: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	try {
		const body = await request.json();

		if (!body?.ids|| !Array.isArray(body.ids) || body.ids.length === 0) {
			throw error(400, 'Missing required field: ids (array)');
		}

		// Soft delete: set status to 'archived'
const archived = await db
			.update(cases)
			.set({
				status: 'archived',
				updatedAt: new Date().toISOString()
			})
			.where(
				and(
					eq(cases.assignedAttorney, locals.user.id),
					// @ts-expect-error - Drizzle inArray typing issue
					inArray(cases.id, body.ids)
				)
			)
			.returning();

		return json({
			success: true, data: archived.length,
			message: `Archived ${archived.length} cases`
		});
	} catch (err) {
		console.error('Error archiving cases:', err);
		if (err instanceof Error && 'status' in err) {
			throw err;
		}
		throw error(500, 'Failed to archive cases');
	}
};



