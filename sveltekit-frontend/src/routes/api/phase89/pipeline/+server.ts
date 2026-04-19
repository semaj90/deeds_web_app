import { json } from '@sveltejs/kit';
import { spawn } from 'child_process';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { ENV } from '$lib/server/env.server.js';

// Phase 89: Pipeline API Endpoint
// Triggers CUDA clustering pipeline with real-time progress

const pipelineSchema = z.object({
	action: z.enum(['cluster'], { message: 'Unknown action' }),
	chunkSize: z.number().int().min(1).max(10000).optional().default(500),
	maxErrors: z.number().int().min(1).optional(),
});

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	try {
		const parsed = pipelineSchema.safeParse(await request.json());
		if (!parsed.success) {
			return json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
		}
		const { action, chunkSize, maxErrors } = parsed.data;

		if (action === 'cluster') {
			// Spawn Python pipeline process
			const pythonPath = ENV.PYTHON_PATH;
			const scriptPath = 'scripts/phase89-enhanced-cuda-pipeline.py';

			const args = ['--chunk-size', String(chunkSize)];
			if (maxErrors) {
				args.push('--max', String(maxErrors));
			}

			// Non-blocking spawn
			const proc = spawn(pythonPath, [scriptPath, ...args], {
				cwd: process.cwd(),
				detached: true,
				stdio: 'ignore'
			});

			proc.unref();

			return json({
				status: 'started',
				message: `Pipeline started with chunk size ${ chunkSize }`,
				pid: proc.pid
			});
		}

		return json({ error: 'Unknown action' }, { status: 400 });
	} catch (error) {
		console.error('Pipeline API error:', error);
		return json({
			error: 'Pipeline execution failed'
		}, { status: 500 });
	}
};

export const GET: RequestHandler = async () => {
	// Return pipeline status
	try {
		const { redis } = await import('$lib/server/redis.js');
    await redis.ping();

		return json({
			status: 'idle',
			progress: 0,
			complete: false,
			processed: 0,
			message: 'Ready to run pipeline'
		});
	} catch {
		return json({ status: 'error', progress: 0, complete: false, processed: 0, message: 'Could not check status' });
	}
};


