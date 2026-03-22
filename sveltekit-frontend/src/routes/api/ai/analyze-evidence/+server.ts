import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { ENV } from '$lib/server/env.server.js';
import { z } from 'zod';
import { ollamaFetch } from '$lib/server/ollama.js';

const analyzeEvidenceSchema = z.object({
	evidenceId: z.string().max(500).optional().default(''),
	text: z.string().trim().min(1, 'No evidence text provided').max(100000),
	metadata: z.any().optional().default({})
});

/** GBNF-constrained response schema for evidence analysis */
const evidenceResponseSchema = z.object({
	summary: z.string(),
	keyTerms: z.array(z.string()),
	sentiment: z.number(),
	importance: z.number(),
	confidence: z.number(),
	legalRelevance: z.string(),
	suggestedTags: z.array(z.string()),
});
const evidenceResponseJsonSchema = z.toJSONSchema(evidenceResponseSchema);

/** POST /api/ai/analyze-evidence — Analyze evidence text and return structured insights */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const raw = await request.json();
		const parsed = analyzeEvidenceSchema.safeParse(raw);
		if (!parsed.success) {
			return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
		}
		const { evidenceId, text, metadata } = parsed.data;

		const systemPrompt = `You are a legal evidence analyst. Analyze the provided evidence text and return structured analysis.
Respond in JSON format:
{
  "summary": "2-3 sentence summary of the evidence",
  "keyTerms": ["important legal terms or entities found"],
  "sentiment": 0.5,
  "importance": 0.7,
  "confidence": 0.85,
  "legalRelevance": "brief note on legal significance",
  "suggestedTags": ["tag1", "tag2"]
}
Where sentiment is -1 (negative) to 1 (positive), importance is 0-1, confidence is 0-1.`;

		const userPrompt = `Evidence ID: ${evidenceId}
${metadata.mimeType ? `Type: ${metadata.mimeType}` : ''}

Text (first 4000 chars):
${text.slice(0, 4000)}`;

		const res = await ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/chat`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: 'gemma3-legal:latest',
				messages: [
					{ role: 'system', content: systemPrompt },
					{ role: 'user', content: userPrompt }
				],
				stream: false,
				format: evidenceResponseJsonSchema,
				options: { temperature: 0.3 }
			}),
			signal: AbortSignal.timeout(60_000)
		});

		if (!res.ok) return json({ error: `Ollama error: ${res.status}` }, { status: 502 });

		const data = await res.json();
		let analysis: Record<string, unknown>;
		try {
			analysis = JSON.parse(data.message?.content || data.response || '{}');
		} catch {
			analysis = {
				summary: data.message?.content || data.response || '',
				keyTerms: [],
				sentiment: 0,
				importance: 0.5,
				confidence: 0.3
			};
		}

		return json({
			summary: analysis.summary || '',
			keyTerms: Array.isArray(analysis.keyTerms) ? analysis.keyTerms : [],
			sentiment: Number(analysis.sentiment) || 0,
			importance: Math.min(Math.max(Number(analysis.importance) || 0.5, 0), 1),
			confidence: Math.min(Math.max(Number(analysis.confidence) || 0.5, 0), 1),
			legalRelevance: analysis.legalRelevance || '',
			suggestedTags: Array.isArray(analysis.suggestedTags) ? analysis.suggestedTags : [],
			evidenceId,
			model: 'gemma3-legal:latest'
		});
	} catch (err) {
		console.error('[ai/analyze-evidence] Error:', err);
		return json({ error: 'AI service unavailable' }, { status: 503 });
	}
};