/**
 * Legal document summarization via Ollama (gemma4-legal).
 * Generates a concise summary for each uploaded evidence document.
 * Ported from evidence-service/src/services/summarizer.ts
 */

import { ENV } from '$lib/server/env.server.js';
import { traceLLM } from '$lib/server/observability/langfuse.js';
import { ollamaFetch } from '$lib/server/ollama.js';

const MODEL = ENV.OLLAMA_CHAT_MODEL;

export async function summarizeDocument(text: string, maxWords: number = 150): Promise<string> {
	if (!text || text.trim().length < 100) return '';

	// Truncate input to ~8000 chars to stay within context window
	const input = text.slice(0, 8000);

	try {
		return await traceLLM('summarize-document', { model: MODEL, prompt: input.slice(0, 500) }, async (gen) => {
			const res = await ollamaFetch(`${ENV.OLLAMA_BASE_URL}/api/generate`, {
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

			if (!res.ok) {
				gen.end({ output: 'fallback-truncation', level: 'WARNING' });
				return text.slice(0, 500) + '...';
			}

			const data = await res.json();
			const result = data.response || text.slice(0, 500) + '...';
			gen.end({ output: result.slice(0, 1000) });
			return result;
		});
	} catch (err) {
		console.warn('[Summarizer] Ollama unavailable, using truncation fallback:', err);
		return text.slice(0, 500) + '...';
	}
}
