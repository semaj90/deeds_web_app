import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { authorizeCaseActor, errorResponse, uuidSchema } from '$lib/server/investigation/investigation-http-v1.js';
import { linkEvidence } from '$lib/server/investigation/investigation-v1.js';
import type { RequestHandler } from './$types';

const linkBody = z.object({
	evidenceId: uuidSchema,
	relevance: z.number().min(0).max(1).optional(),
	note: z.string().trim().max(500).nullable().optional()
});

export const POST: RequestHandler = async ({ locals, params, request }) => {
	const facetId = uuidSchema.safeParse(params.facetId);
	if (!facetId.success) {
		return json({ success: false, data: null, message: 'Invalid facet id' }, { status: 400 });
	}
	const access = await authorizeCaseActor(locals, params.id);
	if ('response' in access) return access.response;

	const parsed = linkBody.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		return json({ success: false, data: null, message: 'Invalid link payload' }, { status: 400 });
	}
	try {
		const row = await linkEvidence({
			caseId: params.id,
			facetId: facetId.data,
			evidenceId: parsed.data.evidenceId,
			actorId: access.actorId,
			relevance: parsed.data.relevance ?? 1,
			note: parsed.data.note ?? null
		});
		return json({ success: true, data: row, message: 'Evidence linked' }, { status: 201 });
	} catch (cause) {
		return errorResponse(cause, 'link evidence');
	}
};
