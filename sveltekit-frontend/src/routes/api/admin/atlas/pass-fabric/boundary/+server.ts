import { json, type RequestHandler } from '@sveltejs/kit';
import { buildAnalysisPassBoundaryProofSnapshot } from '../../../../../../lib/server/analysis/analysis-pass-boundary.js';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	return json(await buildAnalysisPassBoundaryProofSnapshot());
};
