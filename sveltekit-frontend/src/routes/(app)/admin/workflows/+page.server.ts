import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { listPdfOcrWorkflowRuns } from '$lib/server/workflows/pdf-ocr-workflow.js';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user?.role !== 'admin') {
		throw error(403, 'Forbidden');
	}

	return {
		runs: listPdfOcrWorkflowRuns(),
	};
};
