/**
 * Concurrency gate for GPU/LLM-heavy pipeline stages.
 * Uses p-limit semaphores to prevent GPU overload.
 *
 * Limits:
 *   embed:    1 concurrent (GPU-bound, single Ollama instance)
 *   summarize: 1 concurrent (GPU-bound, shares Ollama)
 *   entity:   2 concurrent (CPU-bound regex + optional LLM)
 *   forensics: 4 concurrent (CPU-only regex, fast)
 */

import pLimit from 'p-limit';

/** GPU-bound: only 1 embedding at a time (Ollama single-model) */
export const embedGate = pLimit(1);

/** GPU-bound: only 1 summarization at a time (shares Ollama GPU) */
export const summarizeGate = pLimit(1);

/** Mixed: LLM primary + regex fallback — allow 2 concurrent */
export const entityGate = pLimit(2);

/** CPU-only: regex forensics is fast — allow 4 concurrent */
export const forensicsGate = pLimit(4);

/**
 * Run a function through the appropriate gate.
 * Returns the result of fn(), throttled by the concurrency limit.
 */
export function gated<T>(gate: ReturnType<typeof pLimit>, fn: () => Promise<T>): Promise<T> {
	return gate(fn);
}

/** Current queue depths for monitoring */
export function getGateStats() {
	return {
		embed: { active: embedGate.activeCount, pending: embedGate.pendingCount },
		summarize: { active: summarizeGate.activeCount, pending: summarizeGate.pendingCount },
		entity: { active: entityGate.activeCount, pending: entityGate.pendingCount },
		forensics: { active: forensicsGate.activeCount, pending: forensicsGate.pendingCount },
	};
}
