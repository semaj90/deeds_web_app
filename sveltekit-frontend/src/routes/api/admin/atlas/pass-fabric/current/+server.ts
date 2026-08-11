import { json, type RequestHandler } from '@sveltejs/kit';
import { buildAnalysisPassCurrentProofSnapshot } from '../../../../../../lib/server/analysis/analysis-pass-current.js';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	return json(await buildAnalysisPassCurrentProofSnapshot(10));
};
