/**
 * CouchDB DAG Cache (P3)
 *
 * Caches topological DAG orderings and graph traversal results in CouchDB.
 * Structured document storage with timestamp-based expiry (1 hour default).
 *
 * CouchDB is better suited than Redis for this because:
 * - DAG orderings are structured documents (ordered IDs, cycle info, edge counts)
 * - MapReduce views allow querying all cached orderings per case
 * - Data survives Redis restarts (orderings take 10-50ms to compute)
 *
 * Cache keys: `dag:{queryHash}` where queryHash = MD5 of sorted document ID set
 */

import { createHash } from 'crypto';
import { traceCouchDB } from '$lib/server/observability/langfuse.js';

const DAG_CACHE_DB = 'dag_cache';
const DEFAULT_TTL_MS = 60 * 60 * 1000; // 1 hour

interface CachedDAGOrdering {
	orderedIds: string[];
	cycles: string[][];
	edgesDropped: number;
	caseId?: string;
	queryHash: string;
	cachedAt: string;
	ttlMs: number;
}

/**
 * Build a deterministic cache key from the document ID set.
 */
export function dagCacheKey(documentIds: string[]): string {
	const sorted = [...documentIds].sort().join(',');
	return `dag:${createHash('md5').update(sorted).digest('hex').slice(0, 16)}`;
}

/**
 * Try to get a cached DAG ordering from CouchDB.
 * Returns null on miss or if expired.
 */
export async function getCachedDAG(
	documentIds: string[]
): Promise<CachedDAGOrdering | null> {
	const key = dagCacheKey(documentIds);

	try {
		return await traceCouchDB('dag-cache-get', DAG_CACHE_DB, async () => {
			const { couchdb } = await import('$lib/services/couchdb-client.js');
			const doc = (await couchdb.get(DAG_CACHE_DB, key)) as Record<string, unknown>;

			const cached = doc as unknown as CachedDAGOrdering & { _id?: string; _rev?: string };
			if (!cached.orderedIds || !cached.cachedAt) return null;

			// Check TTL
			const age = Date.now() - new Date(cached.cachedAt).getTime();
			if (age > (cached.ttlMs || DEFAULT_TTL_MS)) {
				console.log(`[DAG Cache] EXPIRED (age: ${Math.round(age / 1000)}s)`);
				return null;
			}

			console.log(
				`[DAG Cache] HIT: ${cached.orderedIds.length} docs, ` +
				`${cached.cycles.length} cycles, age ${Math.round(age / 1000)}s`
			);
			return cached;
		});
	} catch {
		// Cache miss (doc not found) or CouchDB down — non-fatal
		return null;
	}
}

/**
 * Store a DAG ordering in CouchDB cache.
 * Fire-and-forget — errors are logged but not thrown.
 */
export async function setCachedDAG(
	documentIds: string[],
	orderedIds: string[],
	cycles: string[][],
	edgesDropped: number,
	caseId?: string,
	ttlMs = DEFAULT_TTL_MS
): Promise<void> {
	const key = dagCacheKey(documentIds);
	const doc: CachedDAGOrdering = {
		orderedIds,
		cycles,
		edgesDropped,
		caseId,
		queryHash: key,
		cachedAt: new Date().toISOString(),
		ttlMs,
	};

	try {
		await traceCouchDB('dag-cache-set', DAG_CACHE_DB, async () => {
			const { couchdb } = await import('$lib/services/couchdb-client.js');

			// Ensure DB exists
			await couchdb.createDb(DAG_CACHE_DB);

			// Upsert: try get _rev first, then put
			const payload = doc as unknown as Record<string, unknown>;
			try {
				const existing = (await couchdb.get(DAG_CACHE_DB, key)) as Record<string, unknown>;
				await couchdb.put(DAG_CACHE_DB, key, { ...payload, _rev: existing._rev });
			} catch {
				// New doc
				await couchdb.put(DAG_CACHE_DB, key, payload);
			}
		});
	} catch (err) {
		console.warn('[DAG Cache] Write failed (non-fatal):', (err as Error)?.message ?? err);
	}
}
