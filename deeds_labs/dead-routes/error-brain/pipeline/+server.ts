/**
 * GET /api/error-brain/pipeline  — Decision engine stats + thresholds
 * POST /api/error-brain/pipeline — Run full decision engine pipeline
 *
 * Routes through: DecisionEngine → FixSynthesizer → ExperienceRecorder.
 * Confidence-based routing: auto-apply / validate / escalate / invoke tools.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { getDecisionEngine } from '$lib/services/error-analysis/DecisionEngine.js';
import type { ErrorReport, ErrorContext, FixStrategy } from '$lib/services/error-analysis/types.js';

const pipelineSchema = z.object({
	errorMessage: z.string().min(1, 'Missing errorMessage').max(50000),
	filePath: z.string().min(1, 'Missing filePath').max(1000),
	errorCode: z.string().max(100).optional().default(''),
	line: z.number().int().min(0).optional().default(0),
	column: z.number().int().min(0).optional().default(0),
	severity: z.enum(['error', 'warning', 'hint']).optional().default('error'),
	confidence: z.number().min(0).max(1).optional().default(0.5),
	suggestedFix: z.string().max(500000).optional().default(''),
});

export const GET: RequestHandler = async () => {
	try {
		const engine = getDecisionEngine();
		return json({
			stats: engine.getStats(),
			thresholds: engine.getThresholds(),
			ts: new Date().toISOString(),
		});
	} catch (e) {
		return json({ error: (e as Error).message }, { status: 503 });
	}
};

export const POST: RequestHandler = async ({ request }) => {
	const parsed = pipelineSchema.safeParse(await request.json());
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
	}

	const { errorMessage, filePath, errorCode, line, column, severity, confidence, suggestedFix } = parsed.data;

	try {
		const engine = getDecisionEngine();

		// Construct ErrorReport from input
		const errorReport: ErrorReport = {
			file: filePath,
			line,
			column,
			code: errorCode,
			message: errorMessage,
			severity,
			source: 'svelte-check',
		};

		// Construct a FixStrategy from the suggestion
		const strategy: FixStrategy = {
			id: crypto.randomUUID(),
			description: suggestedFix || errorMessage,
			code: suggestedFix,
			applicablePatterns: [],
			successRate: 0,
			confidence,
			validationRules: [],
			appliedCount: 0,
			lastApplied: new Date(),
			createdAt: new Date(),
		};

		// Construct ErrorContext
		const context: ErrorContext = {
			text: errorMessage,
			fileContent: '',
		};

		// Run through the decision engine
		const result = await engine.processError(errorReport, strategy, context);

		return json({
			success: result.success,
			action: result.action,
			confidence: result.confidence,
			fixApplied: result.fixApplied,
			experienceId: result.experienceId ?? null,
			error: result.error ?? null,
			stats: engine.getStats(),
			ts: new Date().toISOString(),
		});
	} catch (e) {
		return json({
			success: false,
			error: (e as Error).message,
			ts: new Date().toISOString(),
		}, { status: 500 });
	}
};
