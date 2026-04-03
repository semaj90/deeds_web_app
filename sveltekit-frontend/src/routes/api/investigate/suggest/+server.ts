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
import { ollamaFetch } from '$lib/server/ollama.js';

/** GBNF-constrained response schema for investigation suggestions */
const suggestResponseSchema = z.array(z.object({
	query: z.string(),
	confidence: z.number(),
	reason: z.string(),
}));
const suggestResponseJsonSchema = z.toJSONSchema(suggestResponseSchema);

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
        glossaryMatches: null,
        ragChunks: [],
        kagNeighbors: [],
        chatHistory: [],
        entities: { statutes: [], cases: [], persons: [], organizations: [], dates: [] },
        practiceTemplate: null,
        queryTags: [],
        webSearchContext: null,
        persona: 'investigator',
        evidenceMetadata: null,
        evidenceConnections: null,
        userAnalyticsContext: null,
        codebaseContext: null,
        kbChunks: [],
        caseChunks: [],
      },
      backend: 'ollama',
    });

		// 2. Generate correction prompt if quality is low
		const correctionPrompt = generateCorrectionPrompt(evaluation, query, answer);

		// 3. Generate follow-up investigation suggestions with confidence ranking via Ollama
		let suggestedQueries: Array<{ query: string; confidence: number; reason: string }> = [];
		try {
			const res = await ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/generate`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					model: 'gemma3-legal:latest',
					prompt: `Given this investigation query and result, suggest 4 follow-up investigation queries that would deepen the analysis. For each, rate your confidence (0.0-1.0) that this follow-up will yield useful results, and explain briefly why.

Investigation Query: ${query.slice(0, 300)}

Investigation Result: ${answer.slice(0, 800)}

Return ONLY a JSON array:
[{"query": "follow-up query", "confidence": 0.85, "reason": "why this is useful"}]`,
					stream: false,
					format: suggestResponseJsonSchema,
					options: { temperature: 0.5, num_predict: 512 }
				}),
				signal: AbortSignal.timeout(15000)
			});

			if (res.ok) {
				const data = await res.json();
				const text = String(data.response ?? '');
				const arrMatch = text.match(/\[[\s\S]*\]/);
				if (arrMatch) {
					const arr = JSON.parse(arrMatch[0]);
					if (Array.isArray(arr)) {
						suggestedQueries = arr
							.filter((q: Record<string, unknown>) => typeof q?.query === 'string')
							.slice(0, 5)
							.map((q: Record<string, unknown>) => ({
								query: String(q.query),
								confidence: typeof q.confidence === 'number' ? Math.round(Math.min(1, Math.max(0, q.confidence)) * 100) / 100 : 0.5,
								reason: typeof q.reason === 'string' ? q.reason : ''
							}))
							.sort((a: { confidence: number }, b: { confidence: number }) => b.confidence - a.confidence);
					}
				}
			}
		} catch {
			suggestedQueries = [];
		}

		// 3b. Fetch related recommendations with real confidence scores (non-blocking)
		let relatedRecommendations: Array<{ documentId: string; title: string; confidence: number; signals: string[] }> = [];
		try {
			const { generateEmbeddings } = await import('$lib/server/grpc/embedding-client.js');
			const { qdrant } = await import('$lib/server/vector/qdrant-manager.js');
			const embResult = await generateEmbeddings([query]);
			if (embResult.vectors[0]?.length) {
				const searchResult = await qdrant.hybridSearch({
					query,
					queryEmbedding: embResult.vectors[0],
					collection: 'documents',
					limit: 5,
					scoreThreshold: 0.5
				});
				relatedRecommendations = searchResult.results.map((r: Record<string, any>) => ({
					documentId: String(r.id),
					title: r.payload?.title || r.payload?.filename || 'Untitled',
					confidence: Math.round(r.score * 100) / 100,
					signals: [
						r.score > 0.8 ? `High similarity (${(r.score * 100).toFixed(0)}%)` : `Moderate similarity (${(r.score * 100).toFixed(0)}%)`,
						...(r.payload?.metadata?.tags ? [`Tags: ${(r.payload.metadata.tags as string[]).slice(0, 3).join(', ')}`] : [])
					]
				}));
			}
		} catch {
			// Non-fatal
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
			relatedRecommendations,
			correctionPrompt
		});
	} catch (e) {
		console.error('[api/investigate/suggest] Failed:', e);
		return json(
			{ error: 'Suggestion generation failed' },
			{ status: 500 }
		);
	}
};