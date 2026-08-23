/**
 * Legal document summarization via the ACE-aware bifrostChat() cascade
 * (Bifrost L1/L2 cache → TurboQuant → llama-server :8090).
 * Generates a concise summary for each uploaded evidence document.
 *
 * Converted 2026-08-22 from a hand-rolled direct-:8090 SSE client (see
 * openspec/changes/inference-wiring-deep-audit-aug22/) — this was one of
 * several independent reimplementations of the same streaming/delta-assembly
 * logic bifrostChat() already provides, and bypassed its L1/L2 cache.
 *
 * Model id is resolved live via getLlamaSessionDescriptor() (GET /v1/models,
 * cached) rather than trusted from the static ROTORQUANT_MODEL_PATH-derived
 * constant — this confirms what llama-server :8090 actually has loaded
 * (e.g. "hforf.gguf") at call time instead of assuming the env config still
 * matches the running process.
 */

import { traceLLM } from '$lib/server/observability/langfuse.js';
import { bifrostChat } from '$lib/server/ollama.js';
import { getLlamaSessionDescriptor } from '$lib/server/ai/local-llama-provider.js';

/**
 * Fetch a summary via bifrostChat(). Returns accumulated content, or ''
 * on failure (caller falls back to truncation).
 */
async function fetchGemma4Summary(systemPrompt: string, userPrompt: string, timeoutMs: number = 90_000): Promise<string> {
	try {
		const session = await getLlamaSessionDescriptor();
		const summary = await bifrostChat(
			[
				{ role: 'system', content: systemPrompt },
				{ role: 'user', content: userPrompt },
			],
			session.modelId,
			{ temperature: 0.3, maxTokens: 1024, timeoutMs }
		);
		return summary.trim();
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
		const session = await getLlamaSessionDescriptor();
		return await traceLLM('summarize-document', { model: session.modelId, prompt: input.slice(0, 500) }, async (gen) => {
			const systemPrompt = `You are a legal document summarizer. Provide concise, factual summaries focusing on key parties, dates, legal issues, and outcomes.`;

			const userPrompt = `Summarize the following legal document in ${maxWords} words or less. Focus on key facts, dates, parties involved, and legal issues:\n\n${input}`;

			const summary = await fetchGemma4Summary(systemPrompt, userPrompt);

			if (summary) {
				gen.end({ output: summary.slice(0, 1000), level: 'DEFAULT' });
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
