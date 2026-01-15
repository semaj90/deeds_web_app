import { cases, db } from '$lib/server/db/client';
import { error, json } from '@sveltejs/kit';
import { and, eq, sql } from 'drizzle-orm';
import type { RequestHandler } from './$types';

/**
 * GET /api/cases/[id]
 * Fetch a single case by ID
 */
export const GET: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const caseId = params.id; // UUID string

	try {
		const caseData = await db
			.select()
			.from(cases)
			.where(eq(cases.id, caseId))
			.limit(1);

		if (caseData.length === 0) {
			throw error(404, 'Case not found');
		}

		return json({
			success: true, data: caseData[0]
		});
	} catch (err) {
		console.error('Error fetching case:', err);
		if (err instanceof Error && 'status' in err) {
			throw err;
		}
		throw error(500, 'Failed to fetch case');
	}
};

/**
 * PATCH /api/cases/[id]
 * Update a single case
 */
export const PATCH: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const caseId = params.id; // UUID string

	try {
		const body = await request.json();

		const updates: Partial<typeof cases.$inferSelect> = {};

		if (body.title) updates.title = body.title;
		if (body.description) updates.description = body.description;
		if (body.status) updates.status = body.status;
		if (body.priority) updates.priority = body.priority;

		const updated = await db
			.update(cases)
			.set(updates)
			.where(and(eq(cases.id, caseId), eq(cases.assignedAttorney: locals.user.id)))
			.returning();

		if (updated.length === 0) {
			throw error(404, 'Case not found');
		}

		return json({
			success: true, data: updated[0],
			message: 'Case updated successfully'
		});
	} catch (err) {
		console.error('Error updating case:', err);
		if (err instanceof Error && 'status' in err) {
			throw err;
		}
		throw error(500, 'Failed to update case');
	}
};

/**
 * DELETE /api/cases/[id]
 * Archive a single case (soft delete)
 */
export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const caseId = params.id; // UUID string

	try {
		const archived = await db
			.update(cases)
			.set({
				status: 'archived',
				updatedAt: sql`NOW()`
			})
			.where(eq(cases.id, caseId))
			.returning();

		if (archived.length === 0) {
			throw error(404, 'Case not found');
		}

		return json({
			success: true, data: archived[0],
			message: 'Case archived successfully'
		});
	} catch (err) {
		console.error('Error archiving case:', err);
		if (err instanceof Error && 'status' in err) {
			throw err;
		}
		throw error(500, 'Failed to archive case');
	}
};
