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
import { ENV } from '$lib/server/env.server.js';

const INFERENCE_LOG_DB = 'inference_log';
const FLUSH_INTERVAL_MS = 5_000;
const FLUSH_THRESHOLD = 50;
const RETENTION_DAYS = 7;
const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000; // every 6 hours

export interface InferenceLogEntry {
  type: 'llm' | 'embedding' | 'vector_search' | 'graph_query' | 'dag_ordering' | 'policy';
  model?: string;
  backend?:
    | 'ollama'
    | 'tensorrt'
    | 'triton'
    | 'turboquant'
    | 'bifrost'
    | 'litert'
    | 'vlm-hf'
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
let cleanupTimer: ReturnType<typeof setInterval> | null = null;
let dbEnsured = false;
let totalLogged = 0;
let totalFlushed = 0;
let flushErrors = 0;

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
	totalLogged++;
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
			const { couchdb } = await import('$lib/server/services/couchdb-client.js');

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
				`${ENV.COUCHDB_URL}/${INFERENCE_LOG_DB}/_bulk_docs`,
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
				flushErrors++;
			} else {
				totalFlushed += batch.length;
			}
		});
	} catch (err) {
		flushErrors++;
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
	backend: 'ollama' | 'tensorrt' | 'triton' | 'turboquant' | 'bifrost' | 'litert' | 'vlm-hf';
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

/**
 * Purge inference_log documents older than RETENTION_DAYS.
 * Uses _all_docs to scan IDs (timestamp-prefixed) and _bulk_docs with _deleted.
 * Non-blocking, non-fatal — safe to call from boot tasks.
 */
export async function cleanupOldInferenceLogs(): Promise<{ deleted: number; error?: string }> {
	try {
		const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000).toISOString().replace(/[:.]/g, '-');
		const baseUrl = ENV.COUCHDB_URL;
		const auth = 'Basic ' + Buffer.from(
			`${process.env.COUCHDB_USER ?? 'admin'}:${process.env.COUCHDB_PASS ?? process.env.COUCHDB_PASSWORD ?? 'legal_ai_pass'}`
		).toString('base64');

		// Fetch all doc IDs up to the cutoff (IDs are timestamp-prefixed, so lexicographic order works)
		const res = await fetch(
			`${baseUrl}/${INFERENCE_LOG_DB}/_all_docs?endkey=${JSON.stringify(cutoff)}&limit=1000`,
			{ headers: { Authorization: auth }, signal: AbortSignal.timeout(10_000) }
		);
		if (!res.ok) return { deleted: 0, error: `_all_docs failed: ${res.status}` };

		const data = await res.json() as { rows: Array<{ id: string; value: { rev: string } }> };
		const rows = data.rows.filter(r => !r.id.startsWith('_design/'));
		if (rows.length === 0) return { deleted: 0 };

		// Bulk delete
		const deleteDocs = rows.map(r => ({ _id: r.id, _rev: r.value.rev, _deleted: true }));
		const delRes = await fetch(
			`${baseUrl}/${INFERENCE_LOG_DB}/_bulk_docs`,
			{
				method: 'POST',
				headers: { 'Content-Type': 'application/json', Authorization: auth },
				body: JSON.stringify({ docs: deleteDocs }),
				signal: AbortSignal.timeout(15_000),
			}
		);

		const deleted = delRes.ok ? deleteDocs.length : 0;
		console.log(`[Inference Log] Cleanup: deleted ${deleted} docs older than ${RETENTION_DAYS} days`);
		return { deleted };
	} catch (err) {
		const msg = (err as Error)?.message ?? String(err);
		console.warn('[Inference Log] Cleanup failed (non-fatal):', msg);
		return { deleted: 0, error: msg };
	}
}

/**
 * Get inference log buffer stats for monitoring.
 */
export function getInferenceLogStats() {
	return {
		buffered: buffer.length,
		totalLogged,
		totalFlushed,
		flushErrors,
		cleanupActive: cleanupTimer !== null,
	};
}

/**
 * Start the periodic cleanup timer. Call once from boot tasks.
 * Runs immediately on first call, then every CLEANUP_INTERVAL_MS.
 */
export function startInferenceLogCleanup(): void {
	if (cleanupTimer) return;
	// Run first cleanup after a short delay (don't block startup)
	setTimeout(() => cleanupOldInferenceLogs(), 30_000);
	cleanupTimer = setInterval(() => cleanupOldInferenceLogs(), CLEANUP_INTERVAL_MS);
	if (typeof cleanupTimer === 'object' && 'unref' in cleanupTimer) {
		cleanupTimer.unref();
	}
}
