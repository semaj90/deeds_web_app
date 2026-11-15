import { json } from '@sveltejs/kit';
import { authorizeCaseActor, errorResponse, uuidSchema } from '$lib/server/investigation/investigation-http-v1.js';
import { unlinkCaseNote } from '$lib/server/investigation/investigation-v1.js';
import type { RequestHandler } from './$types';

export const DELETE: RequestHandler = async ({ locals, params }) => {
	const facetId = uuidSchema.safeParse(params.facetId);
	const noteId = uuidSchema.safeParse(params.noteId);
	if (!facetId.success || !noteId.success) {
		return json({ success: false, data: null, message: 'Invalid identifiers' }, { status: 400 });
	}
	const access = await authorizeCaseActor(locals, params.id);
	if ('response' in access) return access.response;
	try {
		const removed = await unlinkCaseNote({ caseId: params.id, facetId: facetId.data, caseNoteId: noteId.data });
		if (!removed) return json({ success: false, data: null, message: 'Link not found' }, { status: 404 });
		return json({ success: true, data: { removed: true }, message: 'Note unlinked' });
	} catch (cause) {
		return errorResponse(cause, 'unlink note');
	}
};
