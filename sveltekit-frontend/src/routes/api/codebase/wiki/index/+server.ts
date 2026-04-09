/**
 * Codebase Indexing API
 * Triggers MapReduce CUDA analysis for semantic wiki
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { createCodebaseEmbeddingJob, processEmbeddingJob, getJobStatus } from '$lib/server/gpu/mapreduce-cuda-analyzer';

// POST /api/codebase/wiki/index - Start indexing job
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const { patterns, config } = await request.json();

		// Default patterns if not provided
		const filePatterns = patterns || [
			'sveltekit-frontend/src/lib/**/*.ts',
			'sveltekit-frontend/src/lib/**/*.svelte',
			'sveltekit-frontend/src/routes/**/*.ts',
			'sveltekit-frontend/src/routes/**/*.svelte'
		];

		// Create job
		const jobId = await createCodebaseEmbeddingJob(filePatterns, config);

		// Start processing in background
		processEmbeddingJob(jobId, (progress) => {
			console.log(`Indexing progress: ${progress.toFixed(1)}%`);
		}).catch(error => {
			console.error('Background indexing error:', error);
		});

		return json({
			success: true,
			jobId,
			message: 'Indexing started'
		});

	} catch (error: any) {
		console.error('Indexing error:', error);
		return json({
			success: false,
			error: error.message
		}, { status: 500 });
	}
};

// GET /api/codebase/wiki/index?jobId=xxx - Check job status
export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const jobId = url.searchParams.get('jobId');

		if (!jobId) {
			return json({ error: 'Missing jobId' }, { status: 400 });
		}

		const status = await getJobStatus(jobId);

		if (!status) {
			return json({ error: 'Job not found' }, { status: 404 });
		}

		return json({ success: true, job: status });

	} catch (error: any) {
		console.error('Status check error:', error);
		return json({
			success: false,
			error: error.message
		}, { status: 500 });
	}
};
