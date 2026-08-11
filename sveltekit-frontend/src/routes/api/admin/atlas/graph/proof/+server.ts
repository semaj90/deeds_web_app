import { json, type RequestHandler } from '@sveltejs/kit';
import { pool } from '$lib/server/db/client.js';
import { buildGraphDispatcherProofSnapshot } from '$lib/server/graph/graph-dispatcher-proof.js';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const snapshot = await buildGraphDispatcherProofSnapshot(pool);
	return json(snapshot);
};
