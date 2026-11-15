import { json } from '@sveltejs/kit';
import { authorizeCaseActor, errorResponse, uuidSchema } from '$lib/server/investigation/investigation-http-v1.js';
import { unlinkEvidence } from '$lib/server/investigation/investigation-v1.js';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = async ({ locals, params }) => {
	const facetId = uuidSchema.safeParse(params.facetId);
	const evidenceId = uuidSchema.safeParse(params.evidenceId);
	if (!facetId.success || !evidenceId.success) {
		return json({ success: false, data: null, message: 'Invalid identifiers' }, { status: 400 });
	}
	const access = await authorizeCaseActor(locals, params.id);
	if ('response' in access) return access.response;
	try {
		const removed = await unlinkEvidence({ caseId: params.id, facetId: facetId.data, evidenceId: evidenceId.data });
		if (!removed) {
			return json({ success: false, data: null, message: 'Link not found' }, { status: 404 });
		}
		return json({ success: true, data: { removed: true }, message: 'Evidence unlinked' });
	} catch (cause) {
		return errorResponse(cause, 'unlink evidence');
	}
};
