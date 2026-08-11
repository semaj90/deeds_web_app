import { json, type RequestHandler } from '@sveltejs/kit';
import { getRetrievalRrfProofSnapshot } from '$lib/server/retrieval/rrf-proof.js';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	return json(getRetrievalRrfProofSnapshot());
};
