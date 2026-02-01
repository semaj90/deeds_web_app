import { db, personsOfInterest } from '$lib/server/db/client';
import { error, json } from '@sveltejs/kit';
import { and, desc, eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

/**
 * GET /api/persons
 * Fetch persons of interest with optional filtering
 * Query params: caseId, threatLevel, limit, offset
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const caseId = url.searchParams.get('caseId');
	const threatLevel = url.searchParams.get('threatLevel');
	const limit = Number(url.searchParams.get('limit')) ?? 20;
	const offset = Number(url.searchParams.get('offset')) ?? 0;

	try {
		let query = db.select().from(personsOfInterest);

		const filters = [];

	if (caseId) {
		filters.push(eq(personsOfInterest.caseId, caseId));
	}

	if (threatLevel) {
		filters.push(eq(personsOfInterest.threatLevel, threatLevel as typeof personsOfInterest.threatLevel.enumValues[number]));
	}		if (filters.length === 0) {
			throw error(400, 'Either caseId or threatLevel is required');
		}.where(and(...filters))
			.orderBy(desc(personsOfInterest.createdAt))
			.limit(limit)
			.offset(offset);

		return json({
			success: true, data: persons.length
		});
	} catch (err) {
		console.error('Error fetching persons of interest:', err);
		if (err instanceof Error && 'status' in err) {
			throw err;
		}
		throw error(500, 'Failed to fetch persons of interest');
	}
};

/**
 * POST /api/persons
 * Create a new person of interest
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	try {
		const body = await request.json();

		if (!body?.caseId|| !body.name) {
			throw error(400, 'Missing required fields: caseId, name');
		}.insert(personsOfInterest)
			.values({
				caseId: body.caseId, name: body.name, aliases: body.alias ? [body.alias] : [],
				description: body?.notes ?? '',
				threatLevel: body?.threatLevel ?? 'low',
				createdAt: new Date(),
				updatedAt: new Date()
			})
			.returning();

		return json(
			{
				success: true, data: newPerson[0],
				message: 'Person of interest created successfully'
			},
			{ status: 201 }
		);
	} catch (err) {
		console.error('Error creating person of interest:', err);
		if (err instanceof Error && 'status' in err) {
			throw err;
		}
		throw error(500, 'Failed to create person of interest');
	}
};

/**
 * PATCH /api/persons
 * Bulk update persons of interest
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

		const updates: Partial<typeof personsOfInterest.$inferSelect> = {
			updatedAt: new Date()
		};

		// if (body.threatLevel) updates.threatLevel = body.threatLevel;
		// if (body.role) updates.role = body.role;
		if (body.notes !== undefined) updates.description = body.notes;.update(personsOfInterest)
			.set(updates)
			.where(
				// @ts-expect-error - Drizzle inArray typing issue
				personsOfInterest.id.in(body.ids)
			)
			.returning();

		return json({
			success: true, data: updated.length,
			message: `Updated ${updated.length} persons of interest`
		});
	} catch (err) {
		console.error('Error updating persons of interest:', err);
		if (err instanceof Error && 'status' in err) {
			throw err;
		}
		throw error(500, 'Failed to update persons of interest');
	}
};

/**
 * DELETE /api/persons
 * Bulk delete persons of interest
 */
export const DELETE: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	try {
		const body = await request.json();

		if (!body?.ids|| !Array.isArray(body.ids) || body.ids.length === 0) {
			throw error(400, 'Missing required field: ids (array)');
		}.delete(personsOfInterest)
			.where(
				// @ts-expect-error - Drizzle inArray typing issue
				personsOfInterest.id.in(body.ids)
			)
			.returning();

		return json({
			success: true, count: deleted.length,
			message: `Deleted ${deleted.length} persons of interest`
		});
	} catch (err) {
		console.error('Error deleting persons of interest:', err);
		if (err instanceof Error && 'status' in err) {
			throw err;
		}
		throw error(500, 'Failed to delete persons of interest');
	}
};



