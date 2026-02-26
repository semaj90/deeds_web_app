/**
 * POST /api/nlp/sentiment
 *
 * Analyze sentiment of legal text via Ollama structured output.
 * Body: { text: string }
 */
import { json, type RequestEvent } from '@sveltejs/kit';
import { analyzeSentiment } from '$lib/server/nlp/analyzer.js';

export async function POST({ request }: RequestEvent) {
	const { text } = await request.json();
	if (!text || typeof text !== 'string') {
		return json({ error: 'text is required' }, { status: 400 });
	}
	try {
		const result = await analyzeSentiment(text.slice(0, 5000));
		return json(result);
	} catch (err) {
		return json({ error: err instanceof Error ? err.message : 'Analysis failed' }, { status: 500 });
	}
}
