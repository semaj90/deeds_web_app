import { db } from '$lib/server/db/client';
import { reports } from '$lib/server/db/schema';
import { error, json } from '@sveltejs/kit';
import { eq, and } from 'drizzle-orm';
import type { RequestHandler } from './$types';

/**
 * POST /api/reports/[id]/publish
 * Mark report as published
 */
export const POST: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const reportId = params.id;

	try {
		// Update report - set isPublished = true, publishedAt = now
		const updated = await db
			.update(reports)
			.set({
				// Update status to 'published' and updatedAt timestamp
				status: 'published',
				updatedAt: new Date()
			})
			.where(
				and(
					eq(reports.id, reportId),
					eq(reports.createdBy, locals.user.id)
				)
			)
			.returning();

		if (updated.length === 0) {
			throw error(404, 'Report not found or you do not have permission');
		}

		return json({
			success: true,
			report: {
				...updated[0],
				isPublished: true, // Frontend flag
				publishedAt: new Date().toISOString()
			},
			message: 'Report published successfully'
		});
	} catch (err) {
		console.error('Publish error:', err);
		if (err instanceof Error && 'status' in err) throw err;
		throw error(500, 'Failed to publish report');
	}
};

/**
 * DELETE /api/reports/[id]/publish
 * Unpublish report
 */
export const DELETE: RequestHandler = async ({ locals, params }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const reportId = params.id;

	try {
		const updated = await db
			.update(reports)
			.set({
				status: 'draft',
				updatedAt: new Date()
			})
			.where(
				and(
					eq(reports.id, reportId),
					eq(reports.createdBy, locals.user.id)
				)
			)
			.returning();

		if (updated.length === 0) {
			throw error(404, 'Report not found or you do not have permission');
		}

		return json({
			success: true,
			report: updated[0],
			message: 'Report unpublished successfully'
		});
	} catch (err) {
		console.error('Unpublish error:', err);
		if (err instanceof Error && 'status' in err) throw err;
		throw error(500, 'Failed to unpublish report');
	}
};
