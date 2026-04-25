/**
 * GET /api/error-brain/experience  — View experience groups + strategy rankings
 * POST /api/error-brain/experience — Record a new experience outcome
 *
 * Exposes ExperienceRecorder + GRPOPolicy from error-analysis services.
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { getExperienceRecorder } from '$lib/services/error-analysis/ExperienceRecorder.js';
import type { ErrorReport, ErrorContext, FixStrategy } from '$lib/services/error-analysis/types.js';

const recordSchema = z.object({
	errorMessage: z.string().min(1).max(50000),
	filePath: z.string().max(1000).optional().default(''),
	errorCode: z.string().max(100).optional().default(''),
	strategy: z.string().max(500),
	strategyCode: z.string().max(500000).optional().default(''),
	outcome: z.enum(['success', 'failure']),
	confidence: z.number().min(0).max(1).optional().default(0.5),
	humanIntervention: z.boolean().optional().default(false),
	feedback: z.string().max(10000).optional(),
});

export const GET: RequestHandler = async ({ url }) => {
	try {
		const recorder = getExperienceRecorder();
		const outcome = url.searchParams.get('outcome') as 'success' | 'failure' | null;

		const groups = recorder.getAllGroups();
		const experiences = outcome
			? recorder.getExperiencesByOutcome(outcome)
			: [];

		return json({
			groupCount: groups.length,
			groups: groups.slice(0, 20),
			experiences: experiences.slice(0, 50),
			ts: new Date().toISOString(),
		});
	} catch (e) {
		return json({
			groupCount: 0,
			groups: [],
			experiences: [],
			error: (e as Error).message,
		}, { status: 503 });
	}
};

export const POST: RequestHandler = async ({ request }) => {
	const parsed = recordSchema.safeParse(await request.json());
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
	}

	const { errorMessage, filePath, errorCode, strategy, strategyCode, outcome, confidence, humanIntervention, feedback } = parsed.data;

	try {
		const recorder = getExperienceRecorder();

		const errorReport: ErrorReport = {
			file: filePath,
			line: 0,
			column: 0,
			code: errorCode,
			message: errorMessage,
			severity: 'error',
			source: 'svelte-check',
		};

		const fixStrategy: FixStrategy = {
			id: crypto.randomUUID(),
			description: strategy,
			code: strategyCode,
			applicablePatterns: [],
			successRate: outcome === 'success' ? 1 : 0,
			confidence,
			validationRules: [],
			appliedCount: 0,
			lastApplied: new Date(),
			createdAt: new Date(),
		};

		const context: ErrorContext = {
			text: errorMessage,
			fileContent: '',
		};

		const result = await recorder.recordExperience(
			errorReport,
			fixStrategy,
			outcome,
			context,
			[],
			humanIntervention,
			feedback,
		);

		return json({
			recorded: true,
			experienceId: result.experienceId,
			groupId: result.groupId,
			ts: new Date().toISOString(),
		}, { status: 201 });
	} catch (e) {
		return json({ error: (e as Error).message }, { status: 500 });
	}
};