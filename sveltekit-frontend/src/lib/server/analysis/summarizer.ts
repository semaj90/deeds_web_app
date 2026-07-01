/**
 * Legal document summarization via Gemma4 RotorQuant at :8090.
 * Generates a concise summary for each uploaded evidence document.
 * Wired to use Gemma4 synthesis server with streaming support.
 */

import { ENV } from '$lib/server/env.server.js';
import { traceLLM } from '$lib/server/observability/langfuse.js';

const GEMMA4_URL = process.env.GEMMA4_URL || 'http://127.0.0.1:8090';
const MODEL = 'gemma4-legal-iq4xs-direct.gguf';

/**
 * Assemble summary by reading streaming response from Gemma4.
 * Returns accumulated content or truncation fallback on error.
 */
async function fetchGemma4Summary(systemPrompt: string, userPrompt: string, timeoutMs: number = 90_000): Promise<string> {
	try {
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

		const res = await fetch(`${GEMMA4_URL}/v1/chat/completions`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: MODEL,
				messages: [
					{ role: 'system', content: systemPrompt },
					{ role: 'user', content: userPrompt },
				],
				max_tokens: 1024,
				temperature: 0.3,
				stream: true, // REQUIRED for Gemma4 to avoid thinking block exhausting max_tokens
			}),
			signal: controller.signal,
		});

		clearTimeout(timeoutId);

		if (!res.ok) {
			console.warn(`[Summarizer] Gemma4 returned ${res.status}: ${res.statusText}`);
			return '';
		}

		// Parse streaming response (SSE format)
		let accumulated = '';
		const decoder = new TextDecoder();
		let buffer = '';

		if (!res.body) {
			console.warn('[Summarizer] No response body from Gemma4');
			return '';
		}

		for await (const chunk of res.body) {
			buffer += decoder.decode(chunk, { stream: true });
			const lines = buffer.split('\n');
			buffer = lines.pop() ?? '';

			for (const line of lines) {
				if (!line.trim().startsWith('data:')) continue;
				const payload = line.slice(5).trim();
				if (payload === '[DONE]') break;

				try {
					const parsed = JSON.parse(payload);
					const content = parsed.choices?.[0]?.delta?.content ?? '';
					accumulated += content;
				} catch {
					// Skip malformed JSON lines
				}
			}
		}

		return accumulated.trim();
	} catch (err: any) {
		if (err?.name === 'AbortError') {
			console.warn(`[Summarizer] Gemma4 timeout after ${timeoutMs}ms`);
		} else {
			console.warn('[Summarizer] Gemma4 fetch failed:', err?.message);
		}
		return '';
	}
}

export async function summarizeDocument(text: string, maxWords: number = 150): Promise<string> {
	if (!text || text.trim().length < 100) return '';

	// Truncate input to ~16000 chars for legal document context
	const input = text.slice(0, 16_000);

	try {
		return await traceLLM('summarize-document', { model: MODEL, prompt: input.slice(0, 500) }, async (gen) => {
			const systemPrompt = `You are a legal document summarizer. Provide concise, factual summaries focusing on key parties, dates, legal issues, and outcomes.`;

			const userPrompt = `Summarize the following legal document in ${maxWords} words or less. Focus on key facts, dates, parties involved, and legal issues:\n\n${input}`;

			const summary = await fetchGemma4Summary(systemPrompt, userPrompt);

			if (summary) {
				gen.end({ output: summary.slice(0, 1000), level: 'SUCCESS' });
				return summary;
			}

			// Fallback on Gemma4 failure
			gen.end({ output: 'gemma4-failed-truncation', level: 'WARNING' });
			return text.slice(0, 500) + '...';
		});
	} catch (err) {
		console.warn('[Summarizer] Trace error, using truncation fallback:', err);
		return text.slice(0, 500) + '...';
	}
}
