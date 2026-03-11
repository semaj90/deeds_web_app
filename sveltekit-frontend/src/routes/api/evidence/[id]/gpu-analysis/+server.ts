/**
 * GET /api/evidence/[id]/gpu-analysis
 * Returns GPU-computed analysis results: similar evidence, cluster assignment, case embedding status.
 * Data is populated by background-analyzer.ts after evidence upload.
 *
 * POST /api/evidence/[id]/gpu-analysis
 * Triggers a fresh GPU analysis for this evidence item.
 */
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import db from '$lib/server/db';
import { evidence } from '$lib/server/db/schema-postgres.js';
import { eq } from 'drizzle-orm';

export const GET: RequestHandler = async ({ params }) => {
	const { id } = params;

	const rows = await db
		.select({ metadata: evidence.metadata, caseId: evidence.caseId })
		.from(evidence)
		.where(eq(evidence.id, id))
		.limit(1);

	if (!rows[0]) {
		throw error(404, 'Evidence not found');
	}

	const meta = rows[0].metadata as Record<string, unknown> | null;
	const gpuAnalysis = meta?.gpuAnalysis as Record<string, unknown> | null;

	return json({
		evidenceId: id,
		caseId: rows[0].caseId,
		gpuAnalysis: gpuAnalysis ?? null,
		hasAnalysis: !!gpuAnalysis,
	});
};

export const POST: RequestHandler = async ({ params }) => {
	const { id } = params;

	const rows = await db
		.select({ caseId: evidence.caseId })
		.from(evidence)
		.where(eq(evidence.id, id))
		.limit(1);

	if (!rows[0]) {
		throw error(404, 'Evidence not found');
	}

	const caseId = rows[0].caseId;
	if (!caseId) {
		return json({ error: 'Evidence has no case assignment — GPU analysis requires a case context' }, { status: 400 });
	}

	// Fire-and-forget GPU analysis
	const { triggerEvidenceGpuAnalysis } = await import('$lib/server/gpu/cuda-bridge.js');
	triggerEvidenceGpuAnalysis(id, caseId);

	return json({ triggered: true, evidenceId: id, caseId });
};
