import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { authorizeCaseActor, errorResponse, uuidSchema } from '$lib/server/investigation/investigation-http-v1.js';
import { reviewAnalysisResult } from '$lib/server/investigation/investigation-v1.js';
import type { RequestHandler } from './$types';

const reviewBody = z.object({ status: z.enum(['ACCEPTED', 'REJECTED', 'UNREVIEWED']) });

export const POST: RequestHandler = async ({ locals, params, request }) => {
	const analysisId = uuidSchema.safeParse(params.analysisId);
	if (!analysisId.success) return json({ success: false, data: null, message: 'Invalid analysis id' }, { status: 400 });
	const access = await authorizeCaseActor(locals, params.id);
	if ('response' in access) return access.response;

	const parsed = reviewBody.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return json({ success: false, data: null, message: 'Invalid review status' }, { status: 400 });
	try {
		const updated = await reviewAnalysisResult({
			caseId: params.id,
			analysisId: analysisId.data,
			actorId: access.actorId,
			status: parsed.data.status
		});
		return json({ success: true, data: updated, message: 'Analysis review recorded' });
	} catch (cause) {
		return errorResponse(cause, 'review analysis');
	}
};
