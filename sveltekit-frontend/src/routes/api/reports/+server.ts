import { db } from '$lib/server/db/client';
import { reports } from '$lib/server/db/schema';
import { error, json } from '@sveltejs/kit';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { auditReportAction } from '$lib/server/reports/audit';
import { invalidateReportCache, invalidateCaseCache } from '$lib/server/cache/invalidation.js';

/**
 * GET /api/reports
 * Fetch reports with optional case filtering
 * Query params: caseId, ids (comma-separated), limit, offset
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) {
		throw error(401, 'Unauthorized');
	}

	const caseId = url.searchParams.get('caseId');
	const idsParam = url.searchParams.get('ids');
	const limit = Number(url.searchParams.get('limit')) || 20;
	const offset = Number(url.searchParams.get('offset')) || 0;

	try {
		// Filter by specific IDs if provided
		if (idsParam) {
			const ids = idsParam.split(',').filter(Boolean);
			const userReports = await db.select().from(reports)
				.where(and(
					inArray(reports.id, ids),
					eq(reports.createdBy, locals.user.id)
				))
				.orderBy(desc(reports.createdAt));

			return json({ success: true, data: userReports });
		}

		// Filter by case ID if provided
		if (caseId) {
			const userReports = await db.select().from(reports)
				.where(eq(reports.caseId, caseId))
				.orderBy(desc(reports.createdAt))
				.limit(limit)
				.offset(offset)
				.$withCache({ config: { ex: 600 } });

			return json({ success: true, data: userReports });
		}

		// Otherwise return all user's reports
		const userReports = await db.select().from(reports)
			.where(eq(reports.createdBy, locals.user.id))
			.orderBy(desc(reports.createdAt))
			.limit(limit)
			.offset(offset)
			.$withCache({ config: { ex: 600 } });

		return json({ success: true, data: userReports });
	} catch (err) {
		console.error('Error fetching reports:', err);
		console.error('Error type:', typeof err);
		console.error('Error constructor:', err?.constructor?.name);
		if (err && typeof err === 'object') {
			console.error('Error keys:', Object.keys(err));
			console.error('Error cause:', (err as any).cause);
		}
		const errorMessage = err instanceof Error ? err.message : 'Unknown error';
		const errorStack = err instanceof Error ? err.stack : '';
		console.error('Full error:', errorMessage, errorStack);
		throw error(500, `Failed to fetch reports: ${errorMessage}`);
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

		if (!body?.caseId) {
			throw error(400, 'Missing required field: caseId');
		}

		const newReport = await db.insert(reports)
			.values({
				caseId: body.caseId,
				content: body.contentHtml || '<p>Start writing...</p>',
				title: body?.title ?? 'Untitled Report',
				status: body?.status ?? 'draft',
				createdBy: locals.user.id,
				metadata: body?.metadata ?? null,
			})
			.returning();

		// Audit log: report created
		await auditReportAction({
			reportId: newReport[0].id,
			userId: locals.user.id,
			action: 'created',
			changes: { caseId: body.caseId, title: newReport[0].title, status: newReport[0].status },
			request,
		});

		// Invalidate report list and case cache
		await Promise.all([
			invalidateReportCache(newReport[0].id, 'report_create', locals.user.id),
			invalidateCaseCache(body.caseId, 'report_create', locals.user.id)
		]).catch(err => console.warn('[Reports] Cache invalidation failed:', err));

		return json(
			{ success: true, data: newReport[0], message: 'Report created successfully' },
			{ status: 201 }
		);
	} catch (err) {
		console.error('Error creating report:', err);
		if (err instanceof Error && 'status' in err) throw err;
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

		if (!body?.ids || !Array.isArray(body.ids) || body.ids.length === 0) {
			throw error(400, 'Missing required field: ids (array)');
		}

		const updates: any = { updatedAt: new Date() };
		if (body.contentHtml) updates.content = body.contentHtml;
		if (body.title) updates.title = body.title;
		if (body.status) updates.status = body.status;

		const updated = await db.update(reports)
			.set(updates)
			.where(
				and(
					eq(reports.createdBy, locals.user.id),
					inArray(reports.id, body.ids)
				)
			)
			.returning();

		// Audit log: report updated (for each updated report)
		await Promise.all(
			updated.map(report =>
				auditReportAction({
					reportId: report.id,
					userId: locals.user.id,
					action: 'updated',
					changes: updates,
					request,
				})
			)
		);

		// Invalidate cache for all updated reports
		await Promise.all(
			updated.map(report => invalidateReportCache(report.id, 'report_update', locals.user.id))
		).catch(err => console.warn('[Reports] Cache invalidation failed:', err));

		return json({
			success: true,
			data: updated.length,
			message: `Updated ${updated.length} reports`
		});
	} catch (err) {
		console.error('Error updating reports:', err);
		if (err instanceof Error && 'status' in err) throw err;
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

		if (!body?.ids || !Array.isArray(body.ids) || body.ids.length === 0) {
			throw error(400, 'Missing required field: ids (array)');
		}

		const deleted = await db.delete(reports)
			.where(
				and(
					eq(reports.createdBy, locals.user.id),
					inArray(reports.id, body.ids)
				)
			)
			.returning();

		// Audit log: report deleted (for each deleted report)
		await Promise.all(
			deleted.map(report =>
				auditReportAction({
					reportId: report.id,
					userId: locals.user.id,
					action: 'deleted',
					changes: { title: report.title, status: report.status },
					request,
				})
			)
		);

		// Invalidate cache for all deleted reports
		await Promise.all(
			deleted.map(report => invalidateReportCache(report.id, 'report_delete', locals.user.id))
		).catch(err => console.warn('[Reports] Cache invalidation failed:', err));

		return json({
			success: true,
			count: deleted.length,
			message: `Deleted ${deleted.length} reports`
		});
	} catch (err) {
		console.error('Error deleting reports:', err);
		if (err instanceof Error && 'status' in err) throw err;
		throw error(500, 'Failed to delete reports');
	}
};
