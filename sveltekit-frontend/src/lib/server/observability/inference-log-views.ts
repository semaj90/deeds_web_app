/**
 * CouchDB Design Document for inference_log
 *
 * Creates MapReduce views for querying inference logs:
 *   - by_type: group by inference type (llm, embedding, vector_search, etc.)
 *   - by_backend: group by backend (ollama, tensorrt, bifrost, qdrant, etc.)
 *   - by_hour: time-series aggregation (latency stats per hour)
 *   - errors: filter to only failed inferences
 *   - cache_hits: filter to cache hits for hit-rate analysis
 *
 * Call ensureInferenceLogViews() once at startup or lazily on first query.
 */

const INFERENCE_LOG_DB = 'inference_log';

const DESIGN_DOC = {
	_id: '_design/stats',
	language: 'javascript',
	views: {
		by_type: {
			map: `function(doc) {
				if (doc.type) {
					emit(doc.type, {
						latencyMs: doc.latencyMs || 0,
						tokenCount: doc.tokenCount || 0,
						cacheHit: doc.cacheHit ? 1 : 0,
						error: doc.error ? 1 : 0,
						count: 1
					});
				}
			}`,
			reduce: `function(keys, values, rereduce) {
				var result = { latencyMs: 0, tokenCount: 0, cacheHit: 0, error: 0, count: 0 };
				for (var i = 0; i < values.length; i++) {
					result.latencyMs += values[i].latencyMs;
					result.tokenCount += values[i].tokenCount;
					result.cacheHit += values[i].cacheHit;
					result.error += values[i].error;
					result.count += values[i].count;
				}
				return result;
			}`,
		},
		by_backend: {
			map: `function(doc) {
				if (doc.backend) {
					emit(doc.backend, {
						latencyMs: doc.latencyMs || 0,
						count: 1,
						error: doc.error ? 1 : 0
					});
				}
			}`,
			reduce: `function(keys, values, rereduce) {
				var result = { latencyMs: 0, count: 0, error: 0 };
				for (var i = 0; i < values.length; i++) {
					result.latencyMs += values[i].latencyMs;
					result.count += values[i].count;
					result.error += values[i].error;
				}
				return result;
			}`,
		},
		by_hour: {
			map: `function(doc) {
				if (doc.timestamp) {
					var hour = doc.timestamp.substring(0, 13);
					emit(hour, {
						latencyMs: doc.latencyMs || 0,
						count: 1,
						cacheHit: doc.cacheHit ? 1 : 0
					});
				}
			}`,
			reduce: `function(keys, values, rereduce) {
				var result = { latencyMs: 0, count: 0, cacheHit: 0 };
				for (var i = 0; i < values.length; i++) {
					result.latencyMs += values[i].latencyMs;
					result.count += values[i].count;
					result.cacheHit += values[i].cacheHit;
				}
				return result;
			}`,
		},
		errors: {
			map: `function(doc) {
				if (doc.error) {
					emit(doc.timestamp, {
						type: doc.type,
						backend: doc.backend,
						error: doc.error,
						latencyMs: doc.latencyMs
					});
				}
			}`,
		},
		slowest: {
			map: `function(doc) {
				if (doc.latencyMs > 1000) {
					emit(doc.latencyMs, {
						type: doc.type,
						backend: doc.backend,
						model: doc.model,
						timestamp: doc.timestamp
					});
				}
			}`,
		},
	},
};

let viewsEnsured = false;

/**
 * Ensure the inference_log design document exists with all views.
 * Idempotent — safe to call multiple times.
 */
export async function ensureInferenceLogViews(): Promise<void> {
	if (viewsEnsured) return;

	try {
		const { couchdb } = await import('$lib/services/couchdb-client.js');

		await couchdb.createDb(INFERENCE_LOG_DB);

		// Check if design doc exists
		try {
			const existing = await couchdb.get(INFERENCE_LOG_DB, '_design/stats') as Record<string, unknown>;
			// Update if views changed
			await couchdb.put(INFERENCE_LOG_DB, '_design/stats', {
				...DESIGN_DOC,
				_rev: existing._rev,
			});
		} catch {
			// Doesn't exist — create
			await couchdb.put(INFERENCE_LOG_DB, '_design/stats', DESIGN_DOC);
		}

		viewsEnsured = true;
		console.log('[Inference Log] CouchDB design doc ensured');
	} catch (err) {
		console.warn('[Inference Log] Design doc setup failed (non-fatal):', (err as Error)?.message ?? err);
	}
}

/**
 * Query inference stats by type (llm, embedding, vector_search, etc.)
 */
export async function getStatsByType(): Promise<Record<string, { avgLatencyMs: number; count: number; cacheHitRate: number; errorRate: number }>> {
	await ensureInferenceLogViews();

	try {
		const { couchdb } = await import('$lib/services/couchdb-client.js');
		const result = await couchdb.view(INFERENCE_LOG_DB, 'stats', 'by_type', { group: 'true' });

		const stats: Record<string, { avgLatencyMs: number; count: number; cacheHitRate: number; errorRate: number }> = {};
		for (const row of result.rows) {
			const v = row.value as { latencyMs: number; tokenCount: number; cacheHit: number; error: number; count: number };
			stats[row.key as string] = {
				avgLatencyMs: v.count > 0 ? Math.round(v.latencyMs / v.count) : 0,
				count: v.count,
				cacheHitRate: v.count > 0 ? v.cacheHit / v.count : 0,
				errorRate: v.count > 0 ? v.error / v.count : 0,
			};
		}
		return stats;
	} catch {
		return {};
	}
}

/**
 * Query inference stats by backend.
 */
export async function getStatsByBackend(): Promise<Record<string, { avgLatencyMs: number; count: number; errorRate: number }>> {
	await ensureInferenceLogViews();

	try {
		const { couchdb } = await import('$lib/services/couchdb-client.js');
		const result = await couchdb.view(INFERENCE_LOG_DB, 'stats', 'by_backend', { group: 'true' });

		const stats: Record<string, { avgLatencyMs: number; count: number; errorRate: number }> = {};
		for (const row of result.rows) {
			const v = row.value as { latencyMs: number; count: number; error: number };
			stats[row.key as string] = {
				avgLatencyMs: v.count > 0 ? Math.round(v.latencyMs / v.count) : 0,
				count: v.count,
				errorRate: v.count > 0 ? v.error / v.count : 0,
			};
		}
		return stats;
	} catch {
		return {};
	}
}
