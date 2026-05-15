import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import {
	getLatestPdfOcrWorkflowByEvidenceId,
	getPdfOcrWorkflowRun,
	listPdfOcrWorkflowRuns,
} from '$lib/server/workflows/pdf-ocr-workflow.js';

const querySchema = z.object({
	jobId: z.string().trim().min(1).optional(),
	evidenceId: z.string().trim().min(1).optional(),
});

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const parsed = querySchema.safeParse({
		jobId: url.searchParams.get('jobId') ?? undefined,
		evidenceId: url.searchParams.get('evidenceId') ?? undefined,
	});

	if (!parsed.success) {
		return json({ error: 'Invalid workflow query' }, { status: 400 });
	}

	const { jobId, evidenceId } = parsed.data;
	const runs = listPdfOcrWorkflowRuns();
	const run = jobId
		? getPdfOcrWorkflowRun(jobId)
		: evidenceId
			? getLatestPdfOcrWorkflowByEvidenceId(evidenceId)
			: runs[0] ?? null;

	return json({
		run,
		runs,
		total: runs.length,
	});
};
