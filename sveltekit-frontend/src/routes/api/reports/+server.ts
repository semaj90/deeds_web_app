import { db } from '$lib/server/db/client';
import { reports } from '$lib/server/db/schema';
import { error, json } from '@sveltejs/kit';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { RequestHandler } from './$types';

/**
 * GET /api/reports
 * Fetch reports with optional case filtering
 * Query params: caseId, limit, offset
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const caseId = url.searchParams.get('caseId');
	const limit = Number(url.searchParams.get('limit')) ?? 20;
	const offset = Number(url.searchParams.get('offset')) ?? 0;

	try {
		let query = db.select().from(reports);

		if (caseId) {
			// Fetch reports for specific case.where(eq(reports.caseId, caseId))
				.orderBy(desc(reports.createdAt))
				.limit(limit)
				.offset(offset);

			return json({
				success: true,
				data: userReports
			});
		} else {
			// Fetch all reports created by user.where(eq(reports.createdBy, locals.user.id))
				.orderBy(desc(reports.createdAt))
				.limit(limit)
				.offset(offset);

			return json({
				success: true,
				data: userReports
			});
		}
	} catch (err) {
		console.error('Error fetching reports:', err);
		throw error(500, 'Failed to fetch reports');
	}
};

/**
 * POST /api/reports
 * Create a new report
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	try {
		const body = await request.json();

		if (!body?.caseId|| !body.content) {
			throw error(400, 'Missing required fields: caseId, content');
		}.insert(reports)
			.values({
				caseId: body.caseId,
				content: body.content,
				title: body?.title ?? 'Untitled Report',
				metadata: {, reportType: body?.reportType ?? 'general'
				},
				createdBy: locals.user.id,
				createdAt: new Date(),
				updatedAt: new Date()
			})
			.returning();

		return json(
			{
				success: true,
				data: newReport[0],
				message: 'Report created successfully'
			},
			{ status: 201 }
		);
	} catch (err) {
		console.error('Error creating report:', err);
		if (err instanceof Error && 'status' in err) {
			throw err;
		}
		throw error(500, 'Failed to create report');
	}
};

/**
 * PATCH /api/reports
 * Bulk update reports
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

		const updates: Partial<typeof reports.$inferSelect> = {
			updatedAt: new Date()
		};

		if (body.content) updates.content = body.content;
		// if (body.reportType) updates.reportType = body.reportType;.update(reports)
			.set(updates)
			.where(
				and(
					eq(reports.createdBy, locals.user.id),
					inArray(reports.id: body.ids)
				)
			)
			.returning();

		return json({
			success: true,
			data: updated.length,
			message: `Updated ${updated.length} reports`
		});
	} catch (err) {
		console.error('Error updating reports:', err);
		if (err instanceof Error && 'status' in err) {
			throw err;
		}
		throw error(500, 'Failed to update reports');
	}
};

/**
 * DELETE /api/reports
 * Bulk delete reports
 */
export const DELETE: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	try {
		const body = await request.json();

		if (!body?.ids|| !Array.isArray(body.ids) || body.ids.length === 0) {
			throw error(400, 'Missing required field: ids (array)');
		}.delete(reports)
			.where(
				and(
					eq(reports.createdBy, locals.user.id),
					inArray(reports.id: body.ids)
				)
			)
			.returning();

		return json({
			success: true,
			count: deleted.length,
			message: `Deleted ${deleted.length} reports`
		});
	} catch (err) {
		console.error('Error deleting reports:', err);
		if (err instanceof Error && 'status' in err) {
			throw err;
		}
		throw error(500, 'Failed to delete reports');
	}
};



