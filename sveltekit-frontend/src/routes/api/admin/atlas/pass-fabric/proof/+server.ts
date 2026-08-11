import { json, type RequestHandler } from '@sveltejs/kit';
import { getParentAtlasPassFabricProofSnapshot } from '../../../../../../lib/server/atlas/pass-fabric-proof.js';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	return json(getParentAtlasPassFabricProofSnapshot());
};
