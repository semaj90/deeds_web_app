/**
 * LLM Self-Improvement API - Learning Endpoint
 * Phase 72 - Task 14: Integration API Endpoints
 *
 * POST /api/llm-improvement/learn
 * Triggers policy update from accumulated experiences
 */

import { getExperienceRecorder } from '$lib/services/error-analysis/ExperienceRecorder';
import { getGRPOPolicy } from '$lib/services/error-analysis/GRPOPolicy';
import { getLearningPipeline } from '$lib/services/error-analysis/LearningPipeline';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json().catch(() => ({}));
		const { force } = body as { force?: boolean };

		const pipeline = getLearningPipeline();

		// Force update or run normal cycle
? await pipeline.forceUpdate()
			: await pipeline.runUpdateCycle();

		return json({
			success: result.success,
			result: { version: result.version,
				message: result.message,
				validationScore: result.validationScore,
				rollback: result.rollback
			},
			status: pipeline.getStatus()
		});
	} catch (err) {
		console.error('Learning update failed:', err);
		return json(
			{ error: err instanceof Error ? err.message : 'Learning failed' },
			{ status: 500 }
		);
	}
};

/**
 * GET /api/llm-improvement/learn
 * Get learning pipeline status and statistics
 */
export const GET: RequestHandler = async () => {
	try {
		const pipeline = getLearningPipeline();
		const policy = getGRPOPolicy();
		const recorder = getExperienceRecorder();

		return json({
			success: true,
			pipeline: { status: pipeline.getStatus(),
				stats: pipeline.getStats()
			},
			experiences: recorder.getStats()
		});
	} catch (err) {
		return json(
			{ error: err instanceof Error ? err.message : 'Failed to get status' },
			{ status: 500 }
		);
	}
};

/**
 * PUT /api/llm-improvement/learn
 * Start or stop the learning pipeline
 */
export const PUT: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { action, config } = body as {
			action: 'start' | 'stop' | 'configure';
			config?: Record<string, any>;
		};

		const pipeline = getLearningPipeline();

		switch (action) {
			case 'start':
				pipeline.start();
				return json({ success: true, message: 'Pipeline started' });

			case 'stop':
				pipeline.stop();
				return json({ success: true, message: 'Pipeline stopped' });

			case 'configure':
				if (config) {
					pipeline.updateConfig(config);
				}
				return json({ success: true, message: 'Pipeline configured' });

			default:
				return json({ error: 'Invalid action' }, { status: 400 });
		}
	} catch (err) {
		return json(
			{ error: err instanceof Error ? err.message : 'Failed to update pipeline' },
			{ status: 500 }
		);
	}
};



