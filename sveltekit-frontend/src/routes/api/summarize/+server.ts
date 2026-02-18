import { json } from '@sveltejs/kit';
import { getOllamaUrl } from '$lib/config/env.server.js';
import type { RequestHandler } from './$types';

const OLLAMA_URL = getOllamaUrl();

/**
 * POST /api/summarize
 * Generate a 1-2 sentence legal summary of selected text via Ollama.
 * Body: { text: string }
 * Returns: { summary, confidence, model }
 */
export const POST: RequestHandler = async ({ request }) => {
	try {
		const body = await request.json();
		const text = body?.text?.trim();

		if (!text || text.length < 10) {
			return json({ error: 'Text too short to summarize' }, { status: 400 });
		}

		const res = await fetch(`${OLLAMA_URL}/api/generate`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: 'gemma3-legal:latest',
				prompt: `Provide a concise 1-2 sentence legal summary of the following text. Focus on the key legal point or holding.\n\nText: "${text.slice(0, 2000)}"\n\nSummary:`,
				stream: false
			}),
			signal: AbortSignal.timeout(15000)
		});

		if (!res.ok) {
			console.error('[summarize] Ollama error:', res.status);
			return json({ error: 'Summarization service unavailable' }, { status: 502 });
		}

		const data = await res.json();
		const summary = data.response?.trim() ?? '';

		// Confidence heuristic: longer input + longer output = more confident
		const confidence = Math.min(
			0.95,
			0.5 + (text.length > 100 ? 0.2 : 0) + (summary.length > 20 ? 0.15 : 0) + (summary.length > 80 ? 0.1 : 0)
		);

		return json({ summary, confidence, model: 'gemma3-legal:latest' });
	} catch (err) {
		console.error('[summarize] Error:', err);
		return json({ error: 'Summarization failed' }, { status: 500 });
	}
};
