/**
 * POST /api/nlp/classify
 *
 * Classify legal document by type and practice area via Ollama.
 * Body: { text: string }
 */
import { json, type RequestEvent } from '@sveltejs/kit';
import { classifyDocument } from '$lib/server/nlp/analyzer.js';

export async function POST({ request }: RequestEvent) {
	const { text } = await request.json();
	if (!text || typeof text !== 'string') {
		return json({ error: 'text is required' }, { status: 400 });
	}
	try {
		const result = await classifyDocument(text.slice(0, 5000));
		return json(result);
	} catch (err) {
		return json({ error: err instanceof Error ? err.message : 'Classification failed' }, { status: 500 });
	}
}
