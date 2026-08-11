import { json, type RequestHandler } from '@sveltejs/kit';
import { buildAnalysisPassLedgerProofSnapshot } from '../../../../../../lib/server/analysis/analysis-pass-results.js';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const snapshot = await buildAnalysisPassLedgerProofSnapshot();

	if (!snapshot) {
		return json({
			status: 'unavailable',
			generatedAt: new Date(0).toISOString(),
			totalRows: 0,
			duplicateGroupCount: 0,
			classificationCounts: {
				identical_retry: 0,
				stochastic_history: 0,
				revision_mixed: 0,
				ambiguous: 0,
			},
			duplicateGroups: [],
		});
	}

	return json({
		status: 'available',
		...snapshot,
	});
};
