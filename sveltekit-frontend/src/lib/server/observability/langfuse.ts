/**
 * Langfuse LLM Observability — Trace wrapper for Ollama + Triton inference
 *
 * Usage:
 *   import { traceLLM, traceEmbedding, traceRAG } from '$lib/server/observability/langfuse.js';
 *
 *   const result = await traceLLM('legal-query', { caseId }, async (gen) => {
 *     const res = await generateCompletion(prompt, opts);
 *     gen.end({ output: res.content, usage: { promptTokens: res.promptEvalCount, completionTokens: res.evalCount } });
 *     return res;
 *   });
 *
 * When LANGFUSE_ENABLED=false (default), all trace functions are no-ops — zero overhead.
 */
import { ENV } from '$lib/server/env.server.js';

// Lazy singleton — only created when LANGFUSE_ENABLED=true
let _langfuse: any = null;

function getLangfuse() {
	if (_langfuse) return _langfuse;
	if (!ENV.LANGFUSE_ENABLED || !ENV.LANGFUSE_PUBLIC_KEY || !ENV.LANGFUSE_SECRET_KEY) {
		return null;
	}

	try {
		// Dynamic import avoids loading the SDK when disabled
		const { Langfuse } = require('langfuse');
		_langfuse = new Langfuse({
			publicKey: ENV.LANGFUSE_PUBLIC_KEY,
			secretKey: ENV.LANGFUSE_SECRET_KEY,
			baseUrl: ENV.LANGFUSE_HOST,
			flushAt: 15,
			flushInterval: 5000,
		});
		console.log(`[Langfuse] Connected to ${ENV.LANGFUSE_HOST}`);
		return _langfuse;
	} catch (err) {
		console.warn('[Langfuse] SDK init failed (non-fatal):', (err as Error).message);
		return null;
	}
}

export interface TraceGenerationHandle {
	end(params: {
		output?: string;
		usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
		statusMessage?: string;
		level?: 'DEBUG' | 'DEFAULT' | 'WARNING' | 'ERROR';
	}): void;
}

/**
 * Trace an LLM generation (completion or chat).
 * Returns the callback result. If Langfuse is disabled, runs the callback directly.
 */
export async function traceLLM<T>(
	name: string,
	metadata: Record<string, unknown>,
	callback: (gen: TraceGenerationHandle) => Promise<T>
): Promise<T> {
	const langfuse = getLangfuse();
	if (!langfuse) {
		// No-op handle when disabled
		return callback({ end: () => {} });
	}

	const trace = langfuse.trace({
		name,
		metadata,
		tags: ['ollama', metadata.model as string ?? 'gemma3-legal'],
	});

	const generation = trace.generation({
		name: `${name}-generation`,
		model: (metadata.model as string) ?? 'gemma3-legal:latest',
		input: metadata.prompt ?? metadata.messages ?? undefined,
		metadata,
	});

	const startTime = Date.now();
	try {
		const result = await callback({
			end: (params) => {
				generation.end({
					output: params.output,
					usage: params.usage,
					statusMessage: params.statusMessage,
					level: params.level ?? 'DEFAULT',
					completionStartTime: new Date(startTime),
				});
			},
		});
		return result;
	} catch (err) {
		generation.end({
			statusMessage: (err as Error).message,
			level: 'ERROR',
		});
		throw err;
	}
}

/**
 * Trace an embedding generation call.
 */
export async function traceEmbedding<T>(
	text: string,
	model: string,
	callback: () => Promise<T>
): Promise<T> {
	const langfuse = getLangfuse();
	if (!langfuse) return callback();

	const trace = langfuse.trace({
		name: 'embedding',
		metadata: { model, textLength: text.length },
		tags: ['embedding', model],
	});

	const span = trace.span({ name: 'embed-generation', input: text.slice(0, 200) });
	const start = Date.now();

	try {
		const result = await callback();
		span.end({ output: `768-dim vector (${Date.now() - start}ms)` });
		return result;
	} catch (err) {
		span.end({ statusMessage: (err as Error).message, level: 'ERROR' });
		throw err;
	}
}

/**
 * Trace a RAG retrieval + generation pipeline.
 */
export async function traceRAG<T>(
	query: string,
	metadata: Record<string, unknown>,
	callback: (trace: { span: (name: string) => { end: (output?: string) => void } }) => Promise<T>
): Promise<T> {
	const langfuse = getLangfuse();
	if (!langfuse) {
		// No-op trace
		return callback({
			span: () => ({ end: () => {} }),
		});
	}

	const trace = langfuse.trace({
		name: 'rag-pipeline',
		input: query,
		metadata,
		tags: ['rag'],
	});

	return callback({
		span: (name: string) => {
			const s = trace.span({ name });
			return {
				end: (output?: string) => s.end({ output }),
			};
		},
	});
}

/**
 * Flush pending events (call during graceful shutdown).
 */
export async function flushLangfuse(): Promise<void> {
	if (_langfuse) {
		try {
			await _langfuse.flushAsync();
		} catch {
			// Non-fatal
		}
	}
}

/**
 * Shut down the Langfuse client.
 */
export async function shutdownLangfuse(): Promise<void> {
	if (_langfuse) {
		try {
			await _langfuse.shutdownAsync();
			_langfuse = null;
		} catch {
			// Non-fatal
		}
	}
}
