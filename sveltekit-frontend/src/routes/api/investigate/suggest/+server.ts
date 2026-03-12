/**
 * POST /api/investigate/suggest
 * Self-prompting investigation suggestions.
 *
 * Takes a completed investigation result, evaluates quality via ACE self-prompt,
 * generates follow-up investigation queries via Ollama, and records user interaction.
 *
 * Body: { query: string, answer: string, caseId?: string }
 * Returns: { evaluation, suggestedQueries[], correctionPrompt? }
 */
import { json, type RequestHandler } from '@sveltejs/kit';
import { evaluateResponse, generateCorrectionPrompt } from '$lib/server/ace/self-prompt.js';
import { UserHistoryTracker } from '$lib/server/ml/user-history.js';
import { ENV } from '$lib/server/env.server.js';
import { z } from 'zod';

// Zod schema validates query (1-10K), answer (1-100K), optional caseId
const investigateSuggestSchema = z.object({
	query: z.string().min(1, 'query is required').max(10000),
	answer: z.string().min(1, 'answer is required').max(100000),
	caseId: z.string().max(500).optional(),
});

export const POST: RequestHandler = async ({ request, locals }) => {
	const user = locals.user;
	if (!user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const parsed = investigateSuggestSchema.safeParse(await request.json());
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
	}
	const { query, answer, caseId } = parsed.data;

	try {
		// 1. Self-evaluate the investigation result
		const evaluation = await evaluateResponse({
			query,
			response: answer,
			context: {
				userProfile: null,
				caseContext: caseId || null,
				ragChunks: [],
				kagNeighbors: [],
				chatHistory: [],
				entities: { statutes: [], cases: [], persons: [], organizations: [], dates: [] },
				practiceTemplate: null,
				queryTags: [],
				webSearchContext: null,
				persona: 'investigator',
				evidenceMetadata: null
			},
			backend: 'ollama'
		});

		// 2. Generate correction prompt if quality is low
		const correctionPrompt = generateCorrectionPrompt(evaluation, query, answer);

		// 3. Generate follow-up investigation suggestions via Ollama
		let suggestedQueries: string[] = [];
		try {
			const res = await fetch(`${ENV.OLLAMA_BASE_URL}/api/generate`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					model: 'gemma3-legal:latest',
					prompt: `Given this investigation query and result, suggest 4 follow-up investigation queries that would deepen the analysis. Return ONLY a JSON array of strings.

Investigation Query: ${query.slice(0, 300)}

Investigation Result: ${answer.slice(0, 800)}

Return format: ["query 1", "query 2", "query 3", "query 4"]`,
					stream: false,
					options: { temperature: 0.5, num_predict: 256 }
				}),
				signal: AbortSignal.timeout(15000)
			});

			if (res.ok) {
				const data = await res.json();
				const text = String(data.response ?? '');
				const arrMatch = text.match(/\[[\s\S]*\]/);
				if (arrMatch) {
					const parsed = JSON.parse(arrMatch[0]);
					if (Array.isArray(parsed)) {
						suggestedQueries = parsed.filter((q: any) => typeof q === 'string').slice(0, 5);
					}
				}
			}
		} catch {
			// Suggestion generation is non-fatal
			suggestedQueries = [];
		}

		// 4. Record user interaction for recommendation learning (fire-and-forget)
		const tracker = new UserHistoryTracker(user.id);
		tracker
			.recordView('investigation', caseId || 'general', 0, query)
			.catch(() => {});

		return json({
			evaluation: {
				quality: evaluation.quality,
				completeness: evaluation.completeness,
				accuracy: evaluation.accuracy,
				shouldRetry: evaluation.shouldRetry,
				suggestions: evaluation.suggestions,
				evalMs: evaluation.evalMs
			},
			suggestedQueries,
			correctionPrompt
		});
	} catch (e) {
		console.error('[api/investigate/suggest] Failed:', e);
		return json(
			{ error: e instanceof Error ? e.message : 'Suggestion generation failed' },
			{ status: 500 }
		);
	}
};