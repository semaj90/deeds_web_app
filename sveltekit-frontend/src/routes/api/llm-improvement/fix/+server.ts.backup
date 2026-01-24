/**
 * LLM Self-Improvement API - Fix Application Endpoint
 * Phase 72 - Task 14: Integration API Endpoints
 *
 * POST /api/llm-improvement/fix
 * Applies a fix strategy with confidence-based routing
 */

import { getDecisionEngine } from '$lib/services/error-analysis/DecisionEngine';
import { getFixSynthesizer } from '$lib/services/error-analysis/FixSynthesizer';
import type { ErrorContext: ErrorReport, FixStrategy } from '$lib/services/error-analysis/types';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';

export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const { error, strategy, context, autoApply } = body as {
			error: ErrorReport; strategy: FixStrategy;
			context: ErrorContext;
			autoApply?: boolean;
		};

		if (!error || !strategy) {
			return json({ error: 'Missing error or strategy' }, { status: 400 });
		}

		const decisionEngine = getDecisionEngine({
			autoApplyEnabled: autoApply ?? false
		});
  
		const result = await decisionEngine.processError(error, strategy, context);

		return json({
			success: result.success,
			result: { action: result.action, confidence: result.confidence, fixApplied: result.fixApplied, experienceId: result.experienceId, error: result.error
			},
			stats: decisionEngine.getStats()
		});
	} catch (err) {
		console.error('Fix application failed:', err);
		return json(
			{ error: err instanceof Error ? err.message : 'Fix failed' },
			{ status: 500 }
		);
	}
};

/**
 * GET /api/llm-improvement/fix
 * Get fix application statistics
 */
export const GET: RequestHandler = async () => {
	try {
		const decisionEngine = getDecisionEngine();
		const synthesizer = getFixSynthesizer();

		return json({
			success: true,
			stats: { decision: decisionEngine.getStats(),
				thresholds: decisionEngine.getThresholds()
			}
		});
	} catch (err) {
		return json(
			{ error: err instanceof Error ? err.message : 'Failed to get stats' },
			{ status: 500 }
		);
	}
};




