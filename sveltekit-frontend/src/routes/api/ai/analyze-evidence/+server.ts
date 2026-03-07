import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { ENV } from '$lib/server/env.server.js';

/** POST /api/ai/analyze-evidence — Analyze evidence text and return structured insights */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const evidenceId = body.evidenceId || '';
		const text = body.text || '';
		const metadata = body.metadata || {};

		if (!text.trim()) {
			return json({ error: 'No evidence text provided' }, { status: 400 });
		}

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

		const res = await fetch(`${ENV.OLLAMA_BASE_URL}/api/chat`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: 'gemma3-legal:latest',
				messages: [
					{ role: 'system', content: systemPrompt },
					{ role: 'user', content: userPrompt }
				],
				stream: false,
				format: 'json',
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