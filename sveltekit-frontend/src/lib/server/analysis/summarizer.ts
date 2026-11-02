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
	let reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
	const controller = new AbortController();
	const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
	try {
		const target = await resolveLlamaInferenceTarget();
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

		reader = res.body.getReader();
		let finished = false;
		try {
			while (!finished) {
				const { done, value } = await reader.read();
				if (done) break;
				buffer += decoder.decode(value, { stream: true });
				const lines = buffer.split('\n');
				buffer = lines.pop() ?? '';

				for (const line of lines) {
					if (!line.trim().startsWith('data:')) continue;
					const payload = line.slice(5).trim();
					if (payload === '[DONE]') {
						finished = true;
						break;
					}

					try {
						const parsed = JSON.parse(payload);
						const content = parsed.choices?.[0]?.delta?.content ?? '';
						accumulated += content;
					} catch {
						// Skip malformed JSON lines
					}
				}
			}
			buffer += decoder.decode();
			const finalLine = buffer.trim();
			if (finalLine.startsWith('data:')) {
				const payload = finalLine.slice(5).trim();
				if (payload && payload !== '[DONE]') {
					try {
						const parsed = JSON.parse(payload);
						accumulated += parsed.choices?.[0]?.delta?.content ?? '';
					} catch {
						console.warn('[Summarizer] Ignored malformed final SSE event');
					}
				}
			}
			return accumulated.trim();
		} finally {
			reader.releaseLock();
			reader = null;
		}
	} catch (err: unknown) {
		if (err instanceof Error && err.name === 'AbortError') {
			console.warn(`[Summarizer] llama-server timeout after ${timeoutMs}ms`);
		} else {
			console.warn('[Summarizer] llama-server fetch failed:', err instanceof Error ? err.message : String(err));
		}
		return '';
	} finally {
		clearTimeout(timeoutId);
		if (reader) {
			await reader.cancel().catch(() => {});
			reader.releaseLock();
		}
	}
}

function excerptFallback(text: string): string {
	const normalized = text.trim().replace(/\s+/g, ' ');
	if (normalized.length <= 500) return `[Excerpt only — model summary unavailable]\n${normalized}`;
	return `[Excerpt only — model summary unavailable]\n${normalized.slice(0, 360)} … ${normalized.slice(-120)}`;
}

function boundDocumentContext(text: string, maxChars = 16_000): string {
	if (text.length <= maxChars) return text;
	const headLength = Math.floor(maxChars * 0.75);
	const tailLength = maxChars - headLength;
	return `${text.slice(0, headLength)}\n\n[Middle of document omitted for context limits]\n\n${text.slice(-tailLength)}`;
}

function boundWordCount(text: string, maxWords: number): string {
	const words = text.trim().split(/\s+/).filter(Boolean);
	return words.length > maxWords ? `${words.slice(0, maxWords).join(' ')}…` : text.trim();
}

export async function summarizeDocument(text: string, maxWords: number = 150): Promise<string> {
	if (!text || text.trim().length < 100) return '';

	const wordLimit = Number.isFinite(maxWords) ? Math.min(500, Math.max(50, Math.floor(maxWords))) : 150;
	const input = boundDocumentContext(text.trim(), 16_000);

	try {
		return await traceLLM('summarize-document', { modelSource: 'llama-server-8090', prompt: input.slice(0, 500) }, async (gen) => {
			const systemPrompt = `You are a legal document summarizer. Provide concise, factual summaries focusing on key parties, dates, legal issues, and outcomes.`;

			const userPrompt = `Summarize the following legal document in no more than ${wordLimit} words. Use only stated facts; include key parties, dates, legal issues, and outcomes when present. Do not invent missing details. The supplied text may contain an omission marker.\n\n${input}`;

			const summary = await fetchLlamaSummary(systemPrompt, userPrompt);

			if (summary) {
				const boundedSummary = boundWordCount(summary, wordLimit);
				gen.end({ output: boundedSummary.slice(0, 1000), level: 'DEFAULT' });
				return boundedSummary;
			}

			// Safe bounded fallback when llama-server is unavailable.
			gen.end({ output: 'llama-server-failed-truncation', level: 'WARNING' });
			return excerptFallback(text);
		});
	} catch (err) {
		console.warn('[Summarizer] Trace error, using truncation fallback:', err);
		return excerptFallback(text);
	}
}
