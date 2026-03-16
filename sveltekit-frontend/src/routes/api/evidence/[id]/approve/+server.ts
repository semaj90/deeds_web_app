import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { evidence } from '$lib/server/db/schema-postgres.js';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';

const approveRejectSchema = z.object({
	action: z.enum(['approve', 'reject']).default('approve'),
	rejectionReason: z.string().max(2000).optional(),
	reviewedBy: z.string().max(255).optional(),
});

/**
 * POST /api/evidence/[id]/approve
 * Approve or reject an evidence item (updates metadata with review status)
 */
export const POST: RequestHandler = async ({ params, request }) => {
	const evidenceId = params.id;

	try {
		const body = await request.json().catch(() => ({}));
		const parsed = approveRejectSchema.safeParse(body);
		if (!parsed.success) {
			return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
		}

		const { action, rejectionReason, reviewedBy } = parsed.data;

		const [item] = await db
			.select({ id: evidence.id, metadata: evidence.metadata })
			.from(evidence)
			.where(eq(evidence.id, evidenceId))
			.limit(1);

		if (!item) {
			return json({ error: 'Evidence not found' }, { status: 404 });
		}

		const existingMeta = (item.metadata as Record<string, unknown>) ?? {};
		const reviewMeta = {
			...existingMeta,
			reviewStatus: action === 'approve' ? 'approved' : 'rejected',
			reviewedAt: new Date().toISOString(),
			reviewedBy: reviewedBy ?? null,
			rejectionReason: action === 'reject' ? (rejectionReason ?? null) : null,
		};

		const [updated] = await db
			.update(evidence)
			.set({ metadata: reviewMeta, updatedAt: sql`now()` })
			.where(eq(evidence.id, evidenceId))
			.returning({ id: evidence.id, metadata: evidence.metadata });

		return json({
			success: true,
			evidenceId: updated.id,
			action,
			reviewStatus: action === 'approve' ? 'approved' : 'rejected',
			updatedAt: new Date().toISOString(),
		});
	} catch (err) {
		console.error(`[evidence/${evidenceId}/approve] error:`, err);
		return json({ error: 'Failed to process review' }, { status: 500 });
	}
};