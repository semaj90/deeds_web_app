import { json } from '@sveltejs/kit';
import { SSE } from '$lib/server/sse';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request, locals }) => {
    if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
    const sse = new SSE();
    startValidationProcess(sse);
    return sse.toResponse();
};

/**
 * Simulates a long-running validation process
 */
async function startValidationProcess(sse: SSE) {
    const steps = [
        { name: 'Initial Analysis', duration: 500 },
        { name: 'Checking Threat Intelligence', duration: 1000 },
        { name: 'Verifying Compliance', duration: 800 },
        { name: 'Finalizing Score', duration: 300 }
    ];

    let currentStep = 0;

    try {
        for (const step of steps) {
            sse.sendProgress(step.name, Math.round((currentStep / steps.length) * 100));
            await new Promise(r => setTimeout(r, step.duration));
            currentStep++;
        }

        sse.sendProgress('Complete', 100);

        sse.complete({
            securityScore: 95,
            riskLevel: 'low',
            validationId: crypto.randomUUID(),
            timestamp: new Date().toISOString()
        });

    } catch (err: unknown) {
        sse.error('Validation failed');
        sse.close();
    }
}
