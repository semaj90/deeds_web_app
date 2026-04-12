import { db } from '$lib/server/db/client';
import { reports } from '$lib/server/db/schema';
import { json } from '@sveltejs/kit';
import { and, desc, eq, inArray } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { auditReportAction, createReportVersion } from '$lib/server/reports/audit';
import { invalidateReportCache, invalidateCaseCache } from '$lib/server/cache/invalidation.js';
import { cacheControl, checkETag, notModified } from '$lib/server/middleware/cache-headers.js';
import { z } from 'zod';

const reportCreateSchema = z.object({
  caseId: z.string().uuid('Invalid case ID'),
  type: z.string().max(100).optional(),
  contentHtml: z.string().max(1_000_000).optional(),
  title: z.string().max(500).optional(),
  status: z.enum(['draft', 'pending', 'completed', 'published']).optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

const reportBulkUpdateSchema = z.object({
  ids: z.array(z.string().uuid()).min(1, 'Select at least one report'),
  contentHtml: z.string().max(1_000_000).optional(),
  title: z.string().max(500).optional(),
  status: z.enum(['draft', 'pending', 'completed', 'published']).optional(),
});

const reportBulkDeleteSchema = z.object({
  ids: z.array(z.string().uuid()).min(1, 'Select at least one report'),
});

function getReportType(
  type: string | undefined,
  metadata: Record<string, unknown> | undefined
): string {
  if (typeof type === 'string' && type.trim()) {
    return type.trim();
  }

  const metadataType = metadata?.reportType;
  if (typeof metadataType === 'string' && metadataType.trim()) {
    return metadataType.trim();
  }

  return 'custom';
}

const reportListSchema = z.object({
  caseId: z.string().max(100).nullish(),
  ids: z.string().max(5000).nullish(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

/**
 * GET /api/reports
 * Fetch reports with optional case filtering
 * Query params: caseId, ids (comma-separated), limit, offset
 */
export const GET: RequestHandler = async ({ locals, url, request }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const parsed = reportListSchema.safeParse({
    caseId: url.searchParams.get('caseId'),
    ids: url.searchParams.get('ids'),
    limit: url.searchParams.get('limit') ?? undefined,
    offset: url.searchParams.get('offset') ?? undefined,
  });
  if (!parsed.success) return json({ error: parsed.error.issues[0]?.message ?? 'Invalid query' }, { status: 400 });
  const { caseId, ids: idsParam, limit, offset } = parsed.data;

  try {
    let userReports;

    // Filter by specific IDs if provided
    if (idsParam) {
      const ids = idsParam.split(',').filter(Boolean);
      userReports = await db
        .select()
        .from(reports)
        .where(and(inArray(reports.id, ids), eq(reports.createdBy, locals.user.id)))
        .orderBy(desc(reports.createdAt))
        .$withCache({ config: { ex: 60 } });
    }
    // Filter by case ID if provided
    else if (caseId) {
      userReports = await db
        .select()
        .from(reports)
        .where(and(eq(reports.caseId, caseId), eq(reports.createdBy, locals.user.id)))
        .orderBy(desc(reports.createdAt))
        .limit(limit)
        .offset(offset)
        .$withCache({ config: { ex: 600 } });
    }
    // Otherwise return all user's reports
    else {
      userReports = await db
        .select()
        .from(reports)
        .where(eq(reports.createdBy, locals.user.id))
        .orderBy(desc(reports.createdAt))
        .limit(limit)
        .offset(offset)
        .$withCache({ config: { ex: 600 } });
    }

    const responseData = { success: true, data: userReports };

    // ETag check for 304 response (user reports are private data)
    const { etag, isMatch } = checkETag(responseData, request.headers);
    if (isMatch) return notModified(etag);

    return json(responseData, {
      headers: { ...cacheControl.private, ETag: etag }
    });
  } catch (err) {
    console.error('Error fetching reports:', err);
    return json(
      { success: false, data: [] },
      { headers: cacheControl.private }
    );
  }
};

/**
 * POST /api/reports
 * Create a new report
 */
export const POST: RequestHandler = async ({ locals, request }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  const raw = await request.json();
  const parsed = reportCreateSchema.safeParse(raw);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
  }
  const body = parsed.data;

  try {
    const reportType = getReportType(body.type, body.metadata);

    const newReport = await db
      .insert(reports)
      .values({
        caseId: body.caseId,
        content: body.contentHtml || '<p>Start writing...</p>',
        title: body.title ?? 'Untitled Report',
        type: reportType,
        status: body.status ?? 'draft',
        createdBy: locals.user.id,
        metadata: body.metadata ?? null,
      })
      .returning();

    // Audit log: report created
    await auditReportAction({
      reportId: newReport[0].id,
      userId: locals.user.id,
      action: 'created',
      changes: {
        caseId: body.caseId,
        title: newReport[0].title,
        type: reportType,
        status: newReport[0].status,
      },
      request,
    });

    // Invalidate report list and case cache
    await Promise.all([
      invalidateReportCache(newReport[0].id, 'report_create', locals.user.id),
      invalidateCaseCache(body.caseId, 'report_create', locals.user.id),
    ]).catch((err) => console.warn('[Reports] Cache invalidation failed:', err));

    // Track analytics event (non-blocking)
    import('$lib/server/queue/dispatch-inline.js')
      .then(({ dispatchOrExecuteInline }) =>
        dispatchOrExecuteInline('analytics.track', {
          eventType: 'report_create',
          payload: { reportId: newReport[0].id, caseId: body.caseId, userId: locals.user.id },
        })
      )
      .catch(() => {});

    return json(
      { success: true, data: newReport[0], message: 'Report created successfully' },
      { status: 201 }
    );
  } catch (err) {
    console.error('Error creating report:', err);
    return json({ error: 'Failed to create report' }, { status: 500 });
  }
};

/**
 * PATCH /api/reports
 * Bulk update reports
 */
export const PATCH: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const rawPatch = await request.json();
	const parsedPatch = reportBulkUpdateSchema.safeParse(rawPatch);
	if (!parsedPatch.success) {
		return json({ error: parsedPatch.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
	}
	const body = parsedPatch.data;

	try {

		const updates: Record<string, unknown> = { updatedAt: new Date() };
		if (body.contentHtml) updates.content = body.contentHtml;
		if (body.title) updates.title = body.title;
		if (body.status) updates.status = body.status;

		// Snapshot current state before update (non-fatal)
		await Promise.all(
			body.ids.map(id => createReportVersion(id, { changedBy: locals.user.id, changeReason: 'bulk_update' }))
		).catch(err => console.warn('[Reports] Version snapshot failed:', err));

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
		return json({ error: 'Failed to update reports' }, { status: 500 });
	}
};

/**
 * DELETE /api/reports
 * Bulk delete reports
 */
export const DELETE: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const rawDel = await request.json();
	const parsedDel = reportBulkDeleteSchema.safeParse(rawDel);
	if (!parsedDel.success) {
		return json({ error: parsedDel.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
	}

	try {
		const body = parsedDel.data;

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
		return json({ error: 'Failed to delete reports' }, { status: 500 });
	}
};
