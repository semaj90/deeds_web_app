/**
 * Legal document summarization via Ollama (gemma3-legal).
 * Generates a concise summary for each uploaded evidence document.
 * Ported from evidence-service/src/services/summarizer.ts
 */

import { ENV } from '$lib/server/env.server.js';

const MODEL = 'gemma3-legal:latest';

export async function summarizeDocument(text: string, maxWords: number = 150): Promise<string> {
	if (!text || text.trim().length < 100) return '';

	// Truncate input to ~8000 chars to stay within context window
	const input = text.slice(0, 8000);

	try {
		const res = await fetch(`${ENV.OLLAMA_BASE_URL}/api/generate`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: MODEL,
				prompt: `Summarize the following legal document in ${maxWords} words or less. Focus on key facts, dates, parties involved, and legal issues:\n\n${input}`,
				stream: false,
				options: { temperature: 0.3, top_p: 0.9 },
			}),
			signal: AbortSignal.timeout(60_000),
		});

		if (!res.ok) return text.slice(0, 500) + '...';

		const data = await res.json();
		return data.response || text.slice(0, 500) + '...';
	} catch (err) {
		console.warn('[Summarizer] Ollama unavailable, using truncation fallback:', err);
		return text.slice(0, 500) + '...';
	}
}
