import { json } from '@sveltejs/kit';

/**
 * GET /api/pipeline/status/[jobId]
 * STUB: Always returns 'complete' for V2 pipeline proof-of-concept.
 * In production, query Redis/Queue status.
 */
export async function GET({ params }) {
    const { jobId } = params;
    return json({
        jobId,
        status: 'complete',
        progress: 100,
        message: 'Job completed (stub)'
    });
}
