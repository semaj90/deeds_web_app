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
let _langfuseCtorPromise: Promise<any> | null = null;

// Helper to normalize possibly-undefined callbacks into an async function
function _safeCallback<T>(cb?: (...args: any[]) => Promise<T> | T, defaultReturn?: T) {
	if (typeof cb === 'function') {
		return (...args: any[]) => Promise.resolve((cb as any)(...args));
	}
	return async (..._args: any[]) => defaultReturn as T;
}

// Safe stringify helper — returns a truncated JSON string or empty string on failure
function _safeStringify(obj: unknown, max = 300): string {
	try {
		const s = JSON.stringify(obj);
		if (!s) return '';
		return s.length > max ? s.slice(0, max) : s;
	} catch {
		try {
			const s = String(obj ?? '');
			return s.length > max ? s.slice(0, max) : s;
		} catch {
			return '';
		}
	}
}

export async function getLangfuse() {
  if (_langfuse) return _langfuse;
  if (!ENV.LANGFUSE_ENABLED || !ENV.LANGFUSE_PUBLIC_KEY || !ENV.LANGFUSE_SECRET_KEY) {
    return null;
  }

  try {
    if (!_langfuseCtorPromise) {
      _langfuseCtorPromise = import('langfuse').then((mod) => mod.Langfuse);
    }

    const Langfuse = await _langfuseCtorPromise;
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
	const langfuse = await getLangfuse();
	const safeCb = _safeCallback(callback, undefined as unknown as T);
	if (!langfuse) {
		// No-op handle when disabled — call safe callback if caller omitted it
		return safeCb({ end: () => {} } as TraceGenerationHandle);
	}

	const trace = langfuse.trace({
    name,
    metadata,
    tags: [(metadata.backend as string) ?? 'llm', (metadata.model as string) ?? 'gemma4-rotorquant:latest'],
  });

	const generation = trace.generation({
		name: `${name}-generation`,
		model: (metadata.model as string) ?? 'gemma4-rotorquant:latest',
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
	callback: () => Promise<T>,
	metadata: Record<string, unknown> = {}
): Promise<T> {
	const langfuse = await getLangfuse();
	const safeCb = _safeCallback(callback, undefined as unknown as T);
	if (!langfuse) return safeCb();

	const trace = langfuse.trace({
		name: 'embedding',
		metadata: {
			model,
			textLength: text.length,
			...metadata,
		},
		tags: ['embedding', model],
	});

	const span = trace.span({
		name: 'embed-generation',
		input: _safeStringify({
			model,
			textLength: text.length,
			...metadata,
		}, 500),
	});
	const start = Date.now();

	try {
		const result = await callback();
		const dimension =
			typeof metadata.expectedDimensions === 'number'
				? `${metadata.expectedDimensions}-dim vector`
				: 'embedding vector';
		span.end({ output: `${dimension} (${Date.now() - start}ms)` });
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
	const langfuse = await getLangfuse();
	const safeCb = _safeCallback(callback, undefined as unknown as T);
	if (!langfuse) {
		// No-op trace — call safe callback
		return safeCb({
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

// ── Infrastructure Trace Wrappers ────────────────────────────────────────

/**
 * Trace a vector database search (Qdrant).
 */
export async function traceVectorSearch<T>(
	collection: string,
	metadata: Record<string, unknown>,
	callback: () => Promise<T>
): Promise<T> {
	const langfuse = await getLangfuse();
	const safeCb = _safeCallback(callback, undefined as unknown as T);
	if (!langfuse) return safeCb();

	const trace = langfuse.trace({
		name: `vector:${collection}`,
		metadata: { collection, ...metadata },
		tags: ['qdrant', collection],
	});

	const span = trace.span({
		name: 'vector-search',
		input: _safeStringify(metadata, 500),
	});
	const start = Date.now();

	try {
		const result = await safeCb();
		const ms = Date.now() - start;
		const count = Array.isArray(result) ? result.length : (result as { length?: number })?.length ?? 1;
		span.end({ output: `${count} results (${ms}ms)` });
		return result;
	} catch (err) {
		span.end({ statusMessage: (err as Error).message, level: 'ERROR' });
		throw err;
	}
}

/**
 * Trace a database query (PostgreSQL).
 */
export async function traceDB<T>(
	operation: string,
	metadata: Record<string, unknown>,
	callback: () => Promise<T>
): Promise<T> {
	const langfuse = await getLangfuse();
	const safeCb = _safeCallback(callback, undefined as unknown as T);
	if (!langfuse) return safeCb();

	const trace = langfuse.trace({
		name: `db:${operation}`,
		metadata,
		tags: ['postgresql', operation],
	});

	const span = trace.span({
		name: operation,
		input: metadata.table ? String(metadata.table) : undefined,
	});
	const start = Date.now();

	try {
		const result = await callback();
		const ms = Date.now() - start;
		const rowCount = (result as { rows?: unknown[] })?.rows?.length ?? (result as { rowCount?: number })?.rowCount ?? '?';
		span.end({ output: `${rowCount} rows (${ms}ms)` });
		return result;
	} catch (err) {
		span.end({ statusMessage: (err as Error).message, level: 'ERROR' });
		throw err;
	}
}

/**
 * Trace a message queue operation (RabbitMQ publish/consume).
 */
export async function traceQueue<T>(
	operation: 'publish' | 'consume',
	queue: string,
	metadata: Record<string, unknown>,
	callback: () => Promise<T>
): Promise<T> {
	const langfuse = await getLangfuse();
	const safeCb = _safeCallback(callback, undefined as unknown as T);
	if (!langfuse) return safeCb();

	const trace = langfuse.trace({
		name: `queue:${operation}:${queue}`,
		metadata: { queue, operation, ...metadata },
		tags: ['rabbitmq', operation, queue],
	});

	const span = trace.span({
		name: `${operation}-${queue}`,
		input: _safeStringify(metadata, 300),
	});
	const start = Date.now();

	try {
		const result = await callback();
		span.end({ output: `${operation} ok (${Date.now() - start}ms)` });
		return result;
	} catch (err) {
		span.end({ statusMessage: (err as Error).message, level: 'ERROR' });
		throw err;
	}
}

/**
 * Trace a worker thread task (compute-pool).
 */
export async function traceWorker<T>(
	taskType: string,
	metadata: Record<string, unknown>,
	callback: () => Promise<T>
): Promise<T> {
	const langfuse = await getLangfuse();
	const safeCb = _safeCallback(callback, undefined as unknown as T);
	if (!langfuse) return safeCb();

	const trace = langfuse.trace({
		name: `worker:${taskType}`,
		metadata: { taskType, ...metadata },
		tags: ['worker-thread', taskType],
	});

	const span = trace.span({
		name: `compute-${taskType}`,
		input: _safeStringify(metadata, 300),
	});
	const start = Date.now();

	try {
		const result = await callback();
		span.end({ output: `${taskType} done (${Date.now() - start}ms)` });
		return result;
	} catch (err) {
		span.end({ statusMessage: (err as Error).message, level: 'ERROR' });
		throw err;
	}
}

/**
 * Trace a CouchDB operation.
 */
export async function traceCouchDB<T>(
	operation: string,
	dbName: string,
	callback: () => Promise<T>
): Promise<T> {
	const langfuse = await getLangfuse();
	const safeCb = _safeCallback(callback, undefined as unknown as T);
	if (!langfuse) return safeCb();

	const trace = langfuse.trace({
		name: `couchdb:${operation}`,
		metadata: { dbName, operation },
		tags: ['couchdb', operation],
	});

	const span = trace.span({ name: `${operation}-${dbName}` });
	const start = Date.now();

	try {
		const result = await callback();
		span.end({ output: `${operation} ok (${Date.now() - start}ms)` });
		return result;
	} catch (err) {
		span.end({ statusMessage: (err as Error).message, level: 'ERROR' });
		throw err;
	}
}

/**
 * Trace a cache operation (Redis/memory).
 */
export async function traceCache<T>(
	operation: string,
	metadata: Record<string, unknown>,
	callback: () => Promise<T>
): Promise<T> {
	const langfuse = await getLangfuse();
	const safeCb = _safeCallback(callback, undefined as unknown as T);
	if (!langfuse) return safeCb();

	const trace = langfuse.trace({
		name: `cache:${operation}`,
		metadata: { operation, ...metadata },
		tags: ['cache', operation],
	});

	const span = trace.span({ name: `cache-${operation}` });
	const start = Date.now();

	try {
		const result = await callback();
		const ms = Date.now() - start;
		const hit = metadata.hit ?? (result !== null && result !== undefined);
		span.end({ output: `${hit ? 'HIT' : 'MISS'} (${ms}ms)` });
		return result;
	} catch (err) {
		span.end({ statusMessage: (err as Error).message, level: 'ERROR' });
		throw err;
	}
}

/**
 * Trace a graph/KAG operation (Neo4j/pgvector graph queries).
 */
export async function traceGraph<T>(
	operation: string,
	metadata: Record<string, unknown>,
	callback: () => Promise<T>
): Promise<T> {
	const langfuse = await getLangfuse();
	const safeCb = _safeCallback(callback, undefined as unknown as T);
	if (!langfuse) return safeCb();

	const trace = langfuse.trace({
		name: `graph:${operation}`,
		metadata: { operation, ...metadata },
		tags: ['kag', operation],
	});

	const span = trace.span({
		name: `graph-${operation}`,
		input: _safeStringify(metadata, 300),
	});
	const start = Date.now();

	try {
		const result = await callback();
		const ms = Date.now() - start;
		const count = Array.isArray(result) ? result.length : (result as { length?: number })?.length ?? 1;
		span.end({ output: `${count} results (${ms}ms)` });
		return result;
	} catch (err) {
		span.end({ statusMessage: (err as Error).message, level: 'ERROR' });
		throw err;
	}
}

/**
 * Trace a deterministic ACE policy evaluation.
 */
export async function tracePolicy<T>(
	operation: string,
	metadata: Record<string, unknown>,
	callback: () => Promise<T>
): Promise<T> {
	const langfuse = await getLangfuse();
	const safeCb = _safeCallback(callback, undefined as unknown as T);
	if (!langfuse) return safeCb();

	const trace = langfuse.trace({
		name: `policy:${operation}`,
		metadata: { operation, ...metadata },
		tags: ['ace-policy', operation],
	});

	const span = trace.span({
		name: `policy-${operation}`,
		input: _safeStringify(metadata, 300),
	});
	const start = Date.now();

	try {
		const result = await safeCb();
		span.end({ output: `policy ok (${Date.now() - start}ms)` });
		return result;
	} catch (err) {
		span.end({ statusMessage: (err as Error).message, level: 'ERROR' });
		throw err;
	}
}

/**
 * Trace a CHR97 cartridge operation (export, search, cache lookup).
 * Tags: 'chr97', operation name, optionally 'cache-hit' or 'cache-miss'.
 */
export async function traceCartridge<T>(
	operation: 'export' | 'search' | 'cache-hit' | 'cache-miss',
	metadata: Record<string, unknown>,
	callback: () => Promise<T>
): Promise<T> {
	const langfuse = await getLangfuse();
	const safeCb = _safeCallback(callback, undefined as unknown as T);
	if (!langfuse) return safeCb();

	const trace = langfuse.trace({
		name: `cartridge:${operation}`,
		metadata: { operation, ...metadata },
		tags: ['chr97', operation],
	});

	const span = trace.span({
		name: `cartridge-${operation}`,
		input: _safeStringify(metadata, 400),
	});
	const start = Date.now();

	try {
		const result = await callback();
		const ms = Date.now() - start;
		const count = Array.isArray(result) ? result.length : null;
		span.end({ output: count !== null ? `${count} results (${ms}ms)` : `ok (${ms}ms)` });
		return result;
	} catch (err) {
		span.end({ statusMessage: (err as Error).message, level: 'ERROR' });
		throw err;
	}
}

/**
 * Trace an MCP tool call (trace-mcp-server :8788).
 * Records tool name, input, round number, and output.
 */
export async function traceMCPTool<T>(
	toolName: string,
	metadata: Record<string, unknown>,
	callback: () => Promise<T>
): Promise<T> {
	const langfuse = await getLangfuse();
	const safeCb = _safeCallback(callback, undefined as unknown as T);
	if (!langfuse) return safeCb();

	const trace = langfuse.trace({
		name: `mcp:${toolName}`,
		metadata: { toolName, ...metadata },
		tags: ['mcp', 'trace-mcp-server', toolName],
	});

	const span = trace.span({
		name: `tool-${toolName}`,
		input: _safeStringify(metadata, 400),
	});
	const start = Date.now();

	try {
		const result = await callback();
		const ms = Date.now() - start;
		const count = Array.isArray(result) ? result.length : null;
		span.end({ output: count !== null ? `${count} results (${ms}ms)` : `ok (${ms}ms)` });
		return result;
	} catch (err) {
		span.end({ statusMessage: (err as Error).message, level: 'ERROR' });
		throw err;
	}
}

/**
 * Trace a Bifrost L2 semantic cache interaction.
 * operation: 'hit' | 'miss' | 'store' — indicates cache outcome.
 */
export async function traceBifrost<T>(
	operation: 'hit' | 'miss' | 'store',
	metadata: Record<string, unknown>,
	callback: () => Promise<T>
): Promise<T> {
	const langfuse = await getLangfuse();
	const safeCb = _safeCallback(callback, undefined as unknown as T);
	if (!langfuse) return safeCb();

	const trace = langfuse.trace({
		name: `bifrost:${operation}`,
		metadata: { operation, ...metadata },
		tags: ['bifrost', 'l2-cache', operation],
	});

	const span = trace.span({
		name: `bifrost-${operation}`,
		input: _safeStringify(metadata, 300),
	});
	const start = Date.now();

	try {
		const result = await callback();
		const ms = Date.now() - start;
		span.end({ output: `${operation} (${ms}ms)` });
		return result;
	} catch (err) {
		span.end({ statusMessage: (err as Error).message, level: 'ERROR' });
		throw err;
	}
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
 * Trace a custom span for observability (e.g. relation_scan, dynamic_import_detection).
 */
export async function traceSpan<T>(
	name: string,
	metadata: Record<string, unknown>,
	callback: () => Promise<T>
): Promise<T> {
	const langfuse = await getLangfuse();
	const safeCb = _safeCallback(callback, undefined as unknown as T);
	if (!langfuse) return safeCb();

	const trace = langfuse.trace({
		name,
		metadata,
		tags: ['custom-span', name],
	});

	const span = trace.span({
		name,
		input: _safeStringify(metadata, 500),
	});
	const start = Date.now();

	try {
		const result = await callback();
		span.end({ output: `ok (${Date.now() - start}ms)` });
		return result;
	} catch (err) {
		span.end({ statusMessage: (err as Error).message, level: 'ERROR' });
		throw err;
	}
}

/**
 * Trace a full bifrost semantic routing decision.
 *
 * Records the complete routing path (exact hash → feature semantic → qdrant
 * fallback → postgres fallback → gemma4 generate → reward write) as a single
 * Langfuse trace with one span per lane that was attempted.
 *
 * routeLanes is an array of completed routing steps:
 *   { name, hit, latency_ms, metadata? }
 *
 * Call fire-and-forget (don't await in hot paths) or await before response.
 */
export async function traceRouterDecision(opts: {
	query: string;
	queryHash: string;
	featureId?: string;
	cacheHit: boolean;
	cacheTier: 'valkey-exact' | 'valkey-semantic' | 'qdrant-fallback' | 'postgres-fallback' | 'gemma4-generate' | 'none';
	reward?: number;
	sourceRefCount?: number;
	packetUuid?: string;
	durationMs: number;
	routeLanes?: Array<{ name: string; hit: boolean; latency_ms: number; metadata?: Record<string, unknown> }>;
}): Promise<void> {
	const langfuse = await getLangfuse();
	if (!langfuse) return;

	const trace = langfuse.trace({
		name: 'ace.query',
		input: opts.query.slice(0, 500),
		metadata: {
			queryHash: opts.queryHash,
			featureId: opts.featureId ?? 'unknown',
			cacheHit: opts.cacheHit,
			cacheTier: opts.cacheTier,
			reward: opts.reward ?? 0,
			sourceRefCount: opts.sourceRefCount ?? 0,
			packetUuid: opts.packetUuid,
			durationMs: opts.durationMs,
		},
		tags: [
			'bifrost',
			'ace-query',
			opts.cacheHit ? 'cache-hit' : 'cache-miss',
			opts.cacheTier,
			opts.featureId ?? 'unknown',
		],
	});

	for (const lane of (opts.routeLanes ?? [])) {
		const span = trace.span({
			name: lane.name,
			input: _safeStringify(lane.metadata ?? {}, 200),
		});
		span.end({
			output: `${lane.hit ? 'HIT' : 'MISS'} (${lane.latency_ms}ms)`,
			level: lane.hit ? 'DEFAULT' : 'WARNING',
		});
	}

	// Top-level span for reward write
	if (opts.reward !== undefined && opts.reward > 0) {
		const rwSpan = trace.span({ name: 'reward.write', input: String(opts.reward) });
		rwSpan.end({ output: `reward=${opts.reward.toFixed(4)}` });
	}

	try {
		await langfuse.flushAsync();
	} catch {
		// Non-fatal
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

