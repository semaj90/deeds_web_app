import { db } from '$lib/server/db/client';
import { reports } from '$lib/server/db/schema';
import { json, type RequestHandler } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';

export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const { reportId, title, contentHtml, contentJson } = await request.json();

		if (!reportId) {
			return json({ error: 'Report ID is required' }, { status: 400 });
		}

		// Update existing report
		const [updated] = await db
			.update(reports)
			.set({
				title: title || 'Untitled Report',
				contentHtml,
				contentJson,
				updatedAt: new Date()
			})
			.where(eq(reports.id, reportId))
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
			{
				error: 'Failed to save report',
				details: error instanceof Error ? error.message : 'Unknown error'
			},
			{ status: 500 }
		);
	}
};
