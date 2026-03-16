/**
 * POST /api/evidence/analyze → proxy to /api/evidence/analysis
 * Callers: EvidenceUploadModal, Gemma270MWebAssembly
 */
import { json, type RequestEvent } from '@sveltejs/kit';
import { z } from 'zod';
import { enqueueJob } from '$lib/server/analysis/analysis-jobs.js';

const analyzeSchema = z.object({
	evidenceId: z.string().min(1).max(500),
	type: z.string().max(100).optional(),
	caseId: z.string().max(500).optional(),
});

export async function POST({ request, locals }: RequestEvent) {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const parsed = analyzeSchema.safeParse(await request.json());
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
	}

	const { evidenceId, type, caseId } = parsed.data;

	try {
		// Map 'yolo' type to entity_extraction stage
		const stages: Array<'entity_extraction' | 'forensics' | 'summarization'> =
			type === 'yolo'
				? ['entity_extraction']
				: ['entity_extraction', 'forensics', 'summarization'];

		const jobId = await enqueueJob({
			evidenceId,
			caseId: caseId ?? null,
			stages,
		});

		return json({ success: true, jobId, evidenceId });
	} catch (err) {
		console.error('[evidence/analyze] Failed:', err);
		return json({ error: 'Analysis enqueue failed' }, { status: 500 });
	}
}
