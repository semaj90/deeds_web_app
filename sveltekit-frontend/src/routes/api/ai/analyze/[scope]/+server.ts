import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { ENV } from '$lib/server/env.server.js';
import { ollamaFetch } from '$lib/server/ollama.js';
import { TIMEOUTS } from '$lib/server/timeouts.js';

const VALID_SCOPES = ['case', 'evidence', 'poi', 'timeline'] as const;

const analyzeSchema = z.object({
	context: z.record(z.string(), z.unknown()).optional().default({})
});

const SCOPE_PROMPTS: Record<string, string> = {
	case: 'Analyze this legal case. Identify key issues, strengths, weaknesses, and recommended next steps. Provide a structured legal analysis.',
	evidence: 'Analyze the evidence in this case. Assess relevance, admissibility concerns, chain of custody, and evidentiary weight. Flag any gaps.',
	poi: 'Analyze the persons of interest. Identify relationships, motives, and potential connections between individuals. Note any risk factors.',
	timeline: 'Analyze the timeline of events. Identify patterns, gaps, inconsistencies, and critical inflection points. Suggest areas needing investigation.'
};

/** POST /api/ai/analyze/[scope] — AI-powered analysis for case/evidence/poi/timeline */
export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	const scope = params.scope;

	if (!VALID_SCOPES.includes(scope as (typeof VALID_SCOPES)[number])) {
		return json(
			{ message: `Invalid scope: ${scope}. Valid: ${VALID_SCOPES.join(', ')}` },
			{ status: 400 }
		);
	}

	try {
		const raw = await request.json();
		const parsed = analyzeSchema.safeParse(raw);
		if (!parsed.success) {
			return json({ message: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
		}

		const contextStr = Object.keys(parsed.data.context).length > 0
			? `\n\nContext:\n${JSON.stringify(parsed.data.context, null, 2)}`
			: '';

		const systemPrompt = SCOPE_PROMPTS[scope] || SCOPE_PROMPTS.case;
		const userMessage = `Perform a ${scope} analysis.${contextStr}`;

		const res = await ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/chat`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: 'gemma3-legal:latest',
				messages: [
					{ role: 'system', content: systemPrompt },
					{ role: 'user', content: userMessage }
				],
				stream: false,
				options: { temperature: 0.4 }
			}),
			signal: AbortSignal.timeout(TIMEOUTS.USER_FACING)
		});

		if (!res.ok) {
			return json({ analysis: null, error: 'AI service unavailable' }, { status: 503 });
		}

		const data = await res.json();
		const content = data.message?.content || '';

		return json({
			analysis: content,
			scope,
			model: data.model || 'gemma3-legal:latest',
			performance: {
				total_duration: data.total_duration,
				eval_count: data.eval_count
			}
		});
	} catch (err) {
		console.error(`[/api/ai/analyze/${scope}] error:`, err);
		return json({ analysis: null, error: 'Analysis failed' }, { status: 503 });
	}
};