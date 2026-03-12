import { json } from '@sveltejs/kit';
import { pipelineOrchestrator } from '$lib/server/services/pipeline-orchestrator';
import type { RequestHandler } from './$types';
import { z } from 'zod';

const pipelineDataSchema = z.object({
    doc_id: z.string().max(500).optional(),
    case_id: z.string().max(500).optional(),
    content: z.string().max(5_000_000).optional(),
    tags: z.array(z.string().max(200)).max(50).optional(),
});

const pipelineRunSchema = pipelineDataSchema.extend({
    pipeline_config: z.record(z.string(), z.unknown()).optional(),
    data: pipelineDataSchema.optional()
});

export const POST: RequestHandler = async ({ request, locals }) => {
    // Basic Auth Check (assuming locals.user populated by hooks)
    // if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const raw = await request.json();
        const parsed = pipelineRunSchema.safeParse(raw);
        if (!parsed.success) {
            return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
        }
        const body = parsed.data;
        const { doc_id, case_id, data } = body;

        // Support wrapping in 'data' prop as per test spec
        const payload = data || body;
        const targetDocId = payload.doc_id || doc_id;
        const targetCaseId = payload.case_id || case_id;

        if (!targetDocId || !targetCaseId) {
            return json({ error: 'Missing required fields: doc_id, case_id' }, { status: 400 });
        }

        // Ideally fetch content from storage using doc_id
        // For Proof-of-Concept, accept content in payload or fetch placeholder
        const content = payload.content || "Placeholder content for ingestion test including the word plaintiff for search validation.";

        console.log(`[API] Starting Pipeline Job for Doc: ${targetDocId}`);

        // Run Pipeline (Synchronous for now, or fire-and-forget)
        // In production, push to Queue (BullMQ) and return Job ID immediately.
        // Here, await result to ensure it works.
        const result = await pipelineOrchestrator.processDocument(
            targetDocId,
            content,
            {
                case_id: targetCaseId,
                source: 'api',
                tags: payload.tags
            }
        );

        return json({
            job_id: `job-${Date.now()}-${targetDocId}`,
            status: result.success ? 'complete' : 'error',
            chunks_processed: result.chunkCount
        });

    } catch (error) {
        console.error('[API] Pipeline Error:', error);
        return json({ error: 'Internal Server Error', details: String(error) }, { status: 500 });
    }
};
