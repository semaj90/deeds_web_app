/**
 * CouchDB Inference Log (P5B)
 *
 * Lightweight observability layer: logs every LLM/embedding/vector/graph
 * inference call to CouchDB for analysis, without requiring Langfuse/ClickHouse.
 *
 * Fire-and-forget writes — never blocks the request pipeline.
 * Buffered: flushes every 5 seconds or when buffer hits 50 entries.
 *
 * CouchDB database: `inference_log`
 * MapReduce views enable queries like:
 *   - Slowest inference calls (by latency)
 *   - Cache hit rate over time
 *   - Token consumption by model
 *   - Error rate by backend
 */

import { traceCouchDB } from './langfuse.js';

const INFERENCE_LOG_DB = 'inference_log';
const FLUSH_INTERVAL_MS = 5_000;
const FLUSH_THRESHOLD = 50;

export interface InferenceLogEntry {
  type: 'llm' | 'embedding' | 'vector_search' | 'graph_query' | 'dag_ordering' | 'policy';
  model?: string;
  backend?:
    | 'ollama'
    | 'tensorrt'
    | 'triton'
    | 'bifrost'
    | 'qdrant'
    | 'pgvector'
    | 'neo4j'
    | 'couchdb'
    | 'ace-policy';
  latencyMs: number;
  tokenCount?: number;
  cacheHit: boolean;
  queryHash?: string;
  collection?: string;
  resultCount?: number;
  error?: string;
  metadata?: Record<string, unknown>;
}

interface BufferedEntry extends InferenceLogEntry {
	timestamp: string;
}

let buffer: BufferedEntry[] = [];
let flushTimer: ReturnType<typeof setInterval> | null = null;
let dbEnsured = false;

function ensureFlushTimer(): void {
	if (flushTimer) return;
	flushTimer = setInterval(() => {
		if (buffer.length > 0) flushBuffer();
	}, FLUSH_INTERVAL_MS);
	// Don't prevent process exit
	if (typeof flushTimer === 'object' && 'unref' in flushTimer) {
		flushTimer.unref();
	}
}

/**
 * Log an inference event. Non-blocking, buffered.
 */
export function logInference(entry: InferenceLogEntry): void {
	buffer.push({
		...entry,
		timestamp: new Date().toISOString(),
	});

	ensureFlushTimer();

	if (buffer.length >= FLUSH_THRESHOLD) {
		flushBuffer();
	}
}

/**
 * Flush buffered entries to CouchDB.
 * Called automatically on interval/threshold and on shutdown.
 */
async function flushBuffer(): Promise<void> {
	if (buffer.length === 0) return;

	const batch = buffer.splice(0); // drain buffer

	try {
		await traceCouchDB('inference-log-flush', INFERENCE_LOG_DB, async () => {
			const { couchdb } = await import('$lib/services/couchdb-client.js');

			// Ensure DB exists (once)
			if (!dbEnsured) {
				await couchdb.createDb(INFERENCE_LOG_DB);
				dbEnsured = true;
			}

			// Bulk insert via _bulk_docs
			const docs = batch.map((entry, i) => ({
				_id: `${entry.timestamp.replace(/[:.]/g, '-')}-${i}-${Math.random().toString(36).slice(2, 8)}`,
				...entry,
			}));

			const res = await fetch(
				`${process.env.COUCHDB_URL ?? 'http://localhost:5984'}/${INFERENCE_LOG_DB}/_bulk_docs`,
				{
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						Authorization: 'Basic ' + Buffer.from(
							`${process.env.COUCHDB_USER ?? 'admin'}:${process.env.COUCHDB_PASS ?? process.env.COUCHDB_PASSWORD ?? 'legal_ai_pass'}`
						).toString('base64'),
					},
					body: JSON.stringify({ docs }),
				}
			);

			if (!res.ok) {
				console.warn(`[Inference Log] Bulk write failed: ${res.status}`);
			}
		});
	} catch (err) {
		console.warn('[Inference Log] Flush failed (non-fatal):', (err as Error)?.message ?? err);
		// Don't re-buffer on failure — drop to prevent infinite growth
	}
}

/**
 * Flush on shutdown. Call from graceful shutdown hook.
 */
export async function flushInferenceLog(): Promise<void> {
	if (flushTimer) {
		clearInterval(flushTimer);
		flushTimer = null;
	}
	await flushBuffer();
}

/**
 * Convenience: log an LLM inference call.
 */
export function logLLMInference(params: {
	model: string;
	backend: 'ollama' | 'tensorrt' | 'triton' | 'bifrost';
	latencyMs: number;
	tokenCount?: number;
	cacheHit?: boolean;
	queryHash?: string;
	error?: string;
}): void {
	logInference({
		type: 'llm',
		model: params.model,
		backend: params.backend,
		latencyMs: params.latencyMs,
		tokenCount: params.tokenCount,
		cacheHit: params.cacheHit ?? false,
		queryHash: params.queryHash,
		error: params.error,
	});
}

/**
 * Convenience: log a vector search.
 */
export function logVectorSearch(params: {
	collection: string;
	backend: 'qdrant' | 'pgvector';
	latencyMs: number;
	resultCount: number;
	cacheHit?: boolean;
}): void {
	logInference({
		type: 'vector_search',
		collection: params.collection,
		backend: params.backend,
		latencyMs: params.latencyMs,
		resultCount: params.resultCount,
		cacheHit: params.cacheHit ?? false,
	});
}
