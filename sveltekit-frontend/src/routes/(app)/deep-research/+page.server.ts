import type { PageServerLoad, Actions } from './$types';
import { error, redirect } from '@sveltejs/kit';
import { db } from '$lib/server/db/client.js';
import { deepResearchReports } from '$lib/server/db/schema-postgres.js';
import { eq, desc } from 'drizzle-orm';
import { z } from 'zod';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user?.id) {
		throw redirect(303, '/login?redirect=/deep-research');
	}

	const userId = Number(locals.user.id);

	try {
		const reports = await db
			.select()
			.from(deepResearchReports)
			.where(eq(deepResearchReports.userId, userId))
			.orderBy(desc(deepResearchReports.createdAt))
			.limit(50);

		return {
			reports,
			userId
		};
	} catch (err) {
		console.error('[deep-research] Failed to load reports:', err);
		return {
			reports: [],
			userId,
			error: 'Failed to load research reports'
		};
	}
};

const deleteSchema = z.object({
	reportId: z.string().uuid()
});

export const actions: Actions = {
	delete: async ({ request, locals }) => {
		if (!locals.user?.id) {
			throw error(401, 'Unauthorized');
		}

		const data = await request.formData();
		const parsed = deleteSchema.safeParse({
			reportId: data.get('reportId')
		});

		if (!parsed.success) {
			throw error(400, 'Invalid report ID');
		}

		const userId = Number(locals.user.id);

		try {
			const report = await db
				.select()
				.from(deepResearchReports)
				.where(eq(deepResearchReports.id, parsed.data.reportId))
				.limit(1);

			if (!report[0] || report[0].userId !== userId) {
				throw error(403, 'You do not own this report');
			}

			await db
				.delete(deepResearchReports)
				.where(eq(deepResearchReports.id, parsed.data.reportId));

			return { success: true };
		} catch (err) {
			console.error('[deep-research] Delete failed:', err);
			if (err instanceof Error && 'status' in err) throw err;
			throw error(500, 'Failed to delete report');
		}
	}
};
