import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { authorizeCaseActor, errorResponse, uuidSchema } from '$lib/server/investigation/investigation-http-v1.js';
import { reviewSummaryExport } from '$lib/server/investigation/investigation-v1.js';
import type { RequestHandler } from './$types';

const reviewBody = z.object({
	decision: z.enum(['APPROVED', 'REJECTED']),
	note: z.string().trim().max(1000).nullable().optional()
});

/** Appends a review. The export's status becomes this decision; earlier reviews remain in the ledger. */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	const exportId = uuidSchema.safeParse(params.exportId);
	if (!exportId.success) return json({ success: false, data: null, message: 'Invalid export id' }, { status: 400 });
	const access = await authorizeCaseActor(locals, params.id);
	if ('response' in access) return access.response;

	const parsed = reviewBody.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return json({ success: false, data: null, message: 'Invalid review payload' }, { status: 400 });
	try {
		const review = await reviewSummaryExport({
			caseId: params.id,
			exportId: exportId.data,
			actorId: access.actorId,
			decision: parsed.data.decision,
			note: parsed.data.note ?? null
		});
		return json({ success: true, data: review, message: `Summary ${parsed.data.decision.toLowerCase()}` }, { status: 201 });
	} catch (cause) {
		return errorResponse(cause, 'review summary');
	}
};
