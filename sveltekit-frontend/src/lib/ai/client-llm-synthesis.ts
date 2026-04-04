/**
 * Client-Side LLM Synthesis — Cache-aware generation orchestrator.
 *
 * Flow:
 *   1. Hash query + RAG context → check IndexedDB synthesis cache
 *   2. If cache hit → return instantly (source: 'cache-hit')
 *   3. If miss → run E2B generation (or fall back to 270M ONNX)
 *   4. Store result in synthesis cache (1hr TTL)
 *
 * Used by ChatSession to serve cached RAG/KAG/DAG responses before
 * triggering any model inference on the client side.
 */

import { clientCache } from './client-cache.js';
import { isE2BReady, generateE2B, type E2BGenerateOptions } from './gemma4-e2b-client.js';

// ── Types ────────────────────────────────────────────────────────────────

export interface SynthesisResult {
	text: string;
	source: 'cache-hit' | 'local-e2b' | 'local-onnx';
	durationMs: number;
	cached: boolean;
}

// ── Hash utility ─────────────────────────────────────────────────────────

function synthesisHash(query: string, ragContext?: string): string {
	const combined = `${query}::${ragContext ?? ''}`;
	let hash = 0;
	for (let i = 0; i < combined.length; i++) {
		const char = combined.charCodeAt(i);
		hash = ((hash << 5) - hash) + char;
		hash |= 0;
	}
	return `synth_${hash.toString(36)}`;
}

// ── Public API ───────────────────────────────────────────────────────────

/**
 * Generate or retrieve a cached LLM synthesis response.
 *
 * @param query — User query text
 * @param ragContext — Optional RAG/KAG/DAG retrieved context to include in prompt
 * @param options — E2B generation options (used if cache miss)
 * @returns SynthesisResult with text, source attribution, and timing
 */
export async function synthesize(
	query: string,
	ragContext?: string,
	options?: E2BGenerateOptions
): Promise<SynthesisResult> {
	const startMs = performance.now();
	const key = synthesisHash(query, ragContext);

	// 1. Check synthesis cache
	const cached = await clientCache.getSynthesis(key);
	if (cached) {
		const durationMs = Math.round(performance.now() - startMs);
		console.info(`[Synthesis] Cache hit for "${query.slice(0, 40)}..." (${durationMs}ms)`);
		return {
			text: cached.response,
			source: 'cache-hit',
			durationMs,
			cached: true
		};
	}

	// 2. Cache miss — generate via E2B (or fall back)
	if (isE2BReady()) {
		try {
			// Build prompt with RAG context if provided
			const systemPrompt = ragContext
				? `You are a helpful legal AI assistant. Use the following retrieved context to answer the user's question accurately and concisely.\n\n---\nRetrieved Context:\n${ragContext}\n---`
				: options?.systemPrompt;

			const result = await generateE2B(query, [], {
				...options,
				systemPrompt
			});

			// 3. Cache the result
			await clientCache.putSynthesis(key, result.text, 'local-e2b', ragContext);

			return {
				text: result.text,
				source: 'local-e2b',
				durationMs: result.durationMs,
				cached: false
			};
		} catch (err) {
			console.warn('[Synthesis] E2B generation failed, falling back:', err);
		}
	}

	// 4. Fallback: return empty result — caller should escalate to server or 270M ONNX
	const durationMs = Math.round(performance.now() - startMs);
	return {
		text: '',
		source: 'local-onnx',
		durationMs,
		cached: false
	};
}

/**
 * Pre-warm the synthesis cache with common queries.
 * Useful during idle time after page load.
 */
export async function warmSynthesisCache(
	queries: Array<{ query: string; ragContext?: string }>,
	options?: E2BGenerateOptions
): Promise<number> {
	let warmed = 0;
	for (const { query, ragContext } of queries) {
		const key = synthesisHash(query, ragContext);
		const cached = await clientCache.getSynthesis(key);
		if (!cached) {
			try {
				await synthesize(query, ragContext, options);
				warmed++;
			} catch {
				// Best-effort warming
			}
		}
	}
	console.info(`[Synthesis] Warmed ${warmed}/${queries.length} cache entries`);
	return warmed;
}
