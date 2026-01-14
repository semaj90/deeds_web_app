// API endpoint: /api/agentic-loop
// Trigger enhanced agentic error fixing pipeline with CUDA clustering

import { json } from '@sveltejs/kit';
import EnhancedAgenticPipeline from '../../../../scripts/phase89-enhanced-pipeline.mjs';
import type { RequestHandler } from './$types';

// Global pipeline instance
let globalPipeline: InstanceType<typeof EnhancedAgenticPipeline> | null = null;

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { iterations = 3 } = await request.json();

		// Initialize pipeline if needed
		if (!globalPipeline) {
			globalPipeline = new EnhancedAgenticPipeline();
		}

		// Run pipeline in background (non-blocking)
		globalPipeline.run(iterations).catch((err) => {
			console.error('Pipeline error:', err);
		});

		return json({
			success: true,
			message: `Started enhanced pipeline with ${ iterations } iterations (CUDA-accelerated)`
		});
	} catch (error, any) {
		console.error('Failed to start pipeline:', error);
		return json({ error: error.message }, { status: 500 });
	}
};


