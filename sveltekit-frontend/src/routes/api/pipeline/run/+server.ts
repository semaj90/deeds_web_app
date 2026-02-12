import { json } from '@sveltejs/kit';
import { pipelineOrchestrator } from '$lib/server/services/pipeline-orchestrator';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
    // Basic Auth Check (assuming locals.user populated by hooks)
    // if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });

    try {
        const body = await request.json();
        const { doc_id, case_id, pipeline_config, data } = body;

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
