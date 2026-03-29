import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { evidence } from '$lib/server/db/schema-postgres.js';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { isUuid } from '$lib/server/validation.js';

const approveSchema = z.object({
	evidenceId: z.string().uuid(),
	approvedText: z.string().min(1).max(10000).optional(),
});

/**
 * POST /api/evidence/summary/[id]/approve
 * Approve a suggested summary and write it to the evidence record
 */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	if (!isUuid(params.id)) return json({ error: 'Invalid summary ID' }, { status: 400 });
	const summaryId = params.id;

	try {
		const body = await request.json().catch(() => ({}));
		const parsed = approveSchema.safeParse(body);
		if (!parsed.success) {
			return json({ error: 'Invalid request body' }, { status: 400 });
		}

		const evidenceId = parsed.data.evidenceId;
		const approvedText = parsed.data.approvedText;

		if (!evidenceId) {
			return json({ error: 'evidenceId is required' }, { status: 400 });
		}

		const updateData: Record<string, unknown> = { updatedAt: sql`now()` };
		if (approvedText) updateData.summary = approvedText;

		const [updated] = await db
			.update(evidence)
			.set(updateData)
			.where(eq(evidence.id, evidenceId))
			.returning({ id: evidence.id, summary: evidence.summary });

		if (!updated) {
			return json({ error: 'Evidence not found' }, { status: 404 });
		}

		return json({
			success: true,
			summaryId,
			evidenceId: updated.id,
			summary: updated.summary,
			approvedAt: new Date().toISOString(),
		});
	} catch (err) {
		console.error(`[evidence/summary/${summaryId}/approve] error:`, err);
		return json({ error: 'Failed to approve summary' }, { status: 500 });
	}
};
