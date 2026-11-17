import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { authorizeCaseActor, errorResponse, uuidSchema } from '$lib/server/investigation/investigation-http-v1.js';
import { linkCaseNote } from '$lib/server/investigation/investigation-v1.js';
import type { RequestHandler } from './$types';

const linkNoteBody = z.object({ caseNoteId: uuidSchema });

export const POST: RequestHandler = async ({ locals, params, request }) => {
	const facetId = uuidSchema.safeParse(params.facetId);
	if (!facetId.success) return json({ success: false, data: null, message: 'Invalid facet id' }, { status: 400 });
	const access = await authorizeCaseActor(locals, params.id);
	if ('response' in access) return access.response;

	const parsed = linkNoteBody.safeParse(await request.json().catch(() => null));
	if (!parsed.success) return json({ success: false, data: null, message: 'caseNoteId must be a UUID' }, { status: 400 });
	try {
		const row = await linkCaseNote({
			caseId: params.id,
			facetId: facetId.data,
			caseNoteId: parsed.data.caseNoteId,
			actorId: access.actorId
		});
		return json({ success: true, data: row, message: 'Note linked' }, { status: 201 });
	} catch (cause) {
		return errorResponse(cause, 'link note');
	}
};
