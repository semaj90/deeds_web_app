/**
 * Legal document summarization via the active Ornith llama-server at :8090.
 * Generates a concise summary for each uploaded evidence document.
 * Wired to use llama-server /v1 with streaming support.
 */

import { traceLLM } from '$lib/server/observability/langfuse.js';
import { resolveLlamaInferenceTarget } from '$lib/server/llm/runtime-contract.js';


/**
 * Assemble summary by reading the llama-server streaming response.
 * Returns accumulated content or truncation fallback on error.
 */
async function fetchLlamaSummary(systemPrompt: string, userPrompt: string, timeoutMs: number = 90_000): Promise<string> {
	try {
		const target = await resolveLlamaInferenceTarget();
		const controller = new AbortController();
		const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

		const res = await fetch(`${target.baseUrl}/v1/chat/completions`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: target.model,
				messages: [
					{ role: 'system', content: systemPrompt },
					{ role: 'user', content: userPrompt },
				],
				max_tokens: 1024,
				temperature: 0.3,
				stream: true, // Keeps the local synthesis response bounded while streaming.
			}),
			signal: controller.signal,
		});

		clearTimeout(timeoutId);

		if (!res.ok) {
			console.warn(`[Summarizer] llama-server returned ${res.status}: ${res.statusText}`);
			return '';
		}

		// Parse streaming response (SSE format)
		let accumulated = '';
		const decoder = new TextDecoder();
		let buffer = '';

		if (!res.body) {
			console.warn('[Summarizer] No response body from llama-server');
			return '';
		}

		const reader = res.body.getReader();
		try {
			while (true) {
				const { done, value } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });
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
		} finally {
			reader.releaseLock();
		}

		return accumulated.trim();
	} catch (err: any) {
		if (err?.name === 'AbortError') {
			console.warn(`[Summarizer] llama-server timeout after ${timeoutMs}ms`);
		} else {
			console.warn('[Summarizer] llama-server fetch failed:', err?.message);
		}
		return '';
	}
}

export async function summarizeDocument(text: string, maxWords: number = 150): Promise<string> {
	if (!text || text.trim().length < 100) return '';

	// Truncate input to ~16000 chars for legal document context
	const input = text.slice(0, 16_000);

	try {
		return await traceLLM('summarize-document', { modelSource: 'llama-server-8090', prompt: input.slice(0, 500) }, async (gen) => {
			const systemPrompt = `You are a legal document summarizer. Provide concise, factual summaries focusing on key parties, dates, legal issues, and outcomes.`;

			const userPrompt = `Summarize the following legal document in ${maxWords} words or less. Focus on key facts, dates, parties involved, and legal issues:\n\n${input}`;

			const summary = await fetchLlamaSummary(systemPrompt, userPrompt);

			if (summary) {
				gen.end({ output: summary.slice(0, 1000), level: 'DEFAULT' });
				return summary;
			}

			// Safe bounded fallback when llama-server is unavailable.
			gen.end({ output: 'llama-server-failed-truncation', level: 'WARNING' });
			return text.slice(0, 500) + '...';
		});
	} catch (err) {
		console.warn('[Summarizer] Trace error, using truncation fallback:', err);
		return text.slice(0, 500) + '...';
	}
}
