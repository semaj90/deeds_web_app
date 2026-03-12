/**
 * POST /api/nlp/sentiment
 *
 * Analyze sentiment of legal text via Ollama structured output.
 */
import { json, type RequestEvent } from '@sveltejs/kit';
import { analyzeSentiment } from '$lib/server/nlp/analyzer.js';
import { z } from 'zod';

const sentimentSchema = z.object({
	text: z.string().min(1, 'text is required').max(50000)
});

export async function POST({ request }: RequestEvent) {
	const raw = await request.json();
	const parsed = sentimentSchema.safeParse(raw);
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
	}

	try {
		const result = await analyzeSentiment(parsed.data.text.slice(0, 5000));
		return json(result);
	} catch (err) {
		return json({ error: err instanceof Error ? err.message : 'Analysis failed' }, { status: 500 });
	}
}