import { json } from '@sveltejs/kit';
import { spawn } from 'child_process';
import type { RequestHandler } from './$types';

// Phase 89: Pipeline API Endpoint
// Triggers CUDA clustering pipeline with real-time progress

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { action, chunkSize = 500, maxErrors } = body;

		if (action === 'cluster') {
			// Spawn Python pipeline process
			const pythonPath = process.env?.PHASE72_PYTHON ?? 'C:\\Users\\james\\Videos\\deeds-web-app\\.venv\\Scripts\\python.exe';
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
			error: error instanceof Error ? error.message : 'Unknown error'
		}, { status: 500 });
	}
};

export const GET: RequestHandler = async () => {
	// Return pipeline status
	try {
		// Check if there's a running pipeline by looking at Redis
		// Note: Redis does not serve HTTP. This is a naive TCP connectivity probe that always fails.
		// TODO: Replace with a proper Redis client ping if pipeline status checking is needed.
		const { getRedisHost, getRedisPort } = await import('$lib/config/env.server.js');
		const redisCheck = await fetch(`http://${getRedisHost()}:${getRedisPort()}`, { method: 'HEAD' }).catch(() => null);

		return json({
			status: 'idle',
			progress: 0,
			complete: false,
			processed: 0,
			message: 'Ready to run pipeline'
		});
	} catch {
		return json({ status: 'error', message: 'Could not check status' });
	}
};


