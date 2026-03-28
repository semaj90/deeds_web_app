/**
 * POST /api/graph/recommendations
 * Generate case investigation recommendations using vector search + LLM.
 *
 * Body: { query: string, caseId?: string }
 * Returns: { success, summary, recommendations, didYouMean, predictiveSignals }
 */
import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { getOllamaUrl } from '$lib/config/env.server.js';
import { embedText } from '$lib/server/embedding/embed.js';
import { qdrant } from '$lib/server/vector/qdrant-manager.js';
import { ollamaFetch } from '$lib/server/ollama.js';

/** GBNF-constrained response schema for recommendations */
const recommendationsResponseSchema = z.object({
	summary: z.string(),
	recommendations: z.array(z.object({
		title: z.string(),
		rationale: z.string(),
		confidence: z.string(),
	})),
	didYouMean: z.array(z.string()),
	predictiveSignals: z.array(z.string()),
});
const recommendationsJsonSchema = z.toJSONSchema(recommendationsResponseSchema);

const schema = z.object({
	query: z.string().min(1).max(2000),
	caseId: z.string().max(200).nullable().optional()
});

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	const parsed = schema.safeParse(await request.json().catch(() => ({})));
	if (!parsed.success) {
		return json({ success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
	}

	const { query, caseId } = parsed.data;

	try {
		// 1. Embed query and search for relevant evidence
		const queryEmbedding = await embedText(query);
		const embedding = Array.from(queryEmbedding);

		const searchResults = await qdrant.hybridSearch({
			query,
			queryEmbedding: embedding,
			collection: 'evidence',
			filters: caseId ? { case_id: caseId } : undefined,
			limit: 8,
			scoreThreshold: 0.3
		}).catch(() => ({ results: [] }));

		const evidenceContext = searchResults.results
			.slice(0, 5)
			.map((r: Record<string, any>, i: number) => {
				const p = r.payload ?? {};
				return `[${i + 1}] ${p.title ?? p.file_name ?? 'Evidence'}: ${(p.content_preview ?? p.content ?? '').slice(0, 300)}`;
			})
			.join('\n');

		// 2. Generate recommendations via Ollama
		const OLLAMA_URL = getOllamaUrl();
		const MODEL = 'gemma3-legal:latest';

		const prompt = `You are a legal case analyst. Based on the query and evidence context below, provide investigation recommendations.

Query: ${query}
${caseId ? `Case ID: ${caseId}` : ''}
${evidenceContext ? `\nRelevant Evidence:\n${evidenceContext}` : ''}

Respond in valid JSON with this exact structure:
{
  "summary": "Brief predictive summary of the case direction (1-2 sentences)",
  "recommendations": [
    {"title": "Short title", "rationale": "Why this matters", "confidence": "high|medium|low"}
  ],
  "didYouMean": ["alternative search query 1", "alternative search query 2"],
  "predictiveSignals": ["signal 1", "signal 2"]
}

Provide 3-5 recommendations, 2-3 alternative queries, and 2-4 predictive signals. Return ONLY the JSON object.`;

		const ollamaRes = await ollamaFetch(`${OLLAMA_URL}/api/generate`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: MODEL,
				prompt,
				stream: false,
				format: recommendationsJsonSchema,
				options: { temperature: 0.4, num_predict: 1024 }
			}),
			signal: AbortSignal.timeout(30_000)
		});

		if (!ollamaRes.ok) {
			throw new Error(`Ollama returned ${ollamaRes.status}`);
		}

		const ollamaData = await ollamaRes.json();
		const responseText = ollamaData.response ?? '';

		// 3. Parse LLM JSON response
		let llmResult: Record<string, unknown>;
		try {
			llmResult = JSON.parse(responseText);
		} catch {
			// Fallback: extract JSON from markdown code blocks
			const jsonMatch = responseText.match(/```(?:json)?\s*([\s\S]*?)```/);
			if (jsonMatch) {
				llmResult = JSON.parse(jsonMatch[1].trim());
			} else {
				throw new Error('Failed to parse LLM response as JSON');
			}
		}

		return json({
			success: true,
			summary: llmResult.summary ?? '',
			recommendations: Array.isArray(llmResult.recommendations) ? llmResult.recommendations : [],
			didYouMean: Array.isArray(llmResult.didYouMean) ? llmResult.didYouMean : [],
			predictiveSignals: Array.isArray(llmResult.predictiveSignals) ? llmResult.predictiveSignals : [],
			evidenceUsed: searchResults.results.length
		});
	} catch (err) {
		console.error('[graph/recommendations] Error:', err);
		// Graceful fallback with static recommendations
		return json({
			success: true,
			summary: 'Unable to generate AI recommendations at this time. Review evidence manually.',
			recommendations: [
				{ title: 'Review Evidence Timeline', rationale: 'Establish chronological order of events', confidence: 'high' },
				{ title: 'Cross-Reference Witnesses', rationale: 'Identify corroborating or contradicting testimony', confidence: 'medium' },
				{ title: 'Analyze Legal Precedents', rationale: 'Find similar cases for strategy guidance', confidence: 'medium' }
			],
			didYouMean: [],
			predictiveSignals: ['Manual review recommended'],
			evidenceUsed: 0
		});
	}
};
