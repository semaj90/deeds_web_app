import { db } from '$lib/server/db/client';
import { reports } from '$lib/server/db/schema';
import { json } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { isUuid } from '$lib/server/validation.js';

const saveReportSchema = z.object({
	reportId: z.string().min(1, 'Report ID is required').max(500),
	title: z.string().max(1000).optional(),
	contentHtml: z.string().max(5_000_000).optional(),
});

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const parsed = saveReportSchema.safeParse(await request.json());
		if (!parsed.success) {
			return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
		}
		const { reportId, title, contentHtml } = parsed.data;

		if (!isUuid(reportId)) {
      return json({ error: 'Invalid report ID format' }, { status: 400 });
    }

		// Update existing report
		const [updated] = await db
      .update(reports)
      .set({
        title: title || 'Untitled Report',
        content: contentHtml || '',
        updatedAt: new Date(),
      })
      .where(and(eq(reports.id, reportId), eq(reports.createdBy, locals.user.id)))
      .returning();

		if (!updated) {
			return json({ error: 'Report not found' }, { status: 404 });
		}

		return json({
			success: true,
			report: updated
		});
	} catch (error) {
		console.error('Error saving report:', error);
		return json(
			{ error: 'Failed to save report' },
			{ status: 500 }
		);
	}
};
