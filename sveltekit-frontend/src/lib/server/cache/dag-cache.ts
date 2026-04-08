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

/**
 * Purge expired DAG cache documents from CouchDB.
 * Scans all docs, checks cachedAt + ttlMs, bulk-deletes expired ones.
 * Non-blocking, non-fatal — safe to call from boot tasks or scheduled interval.
 */
export async function cleanupExpiredDAGCache(): Promise<{ deleted: number; error?: string }> {
	try {
		const { couchdb } = await import('$lib/services/couchdb-client.js');
		const allDocs = await couchdb.allDocs(DAG_CACHE_DB, { include_docs: true }) as {
			rows: Array<{ id: string; doc?: Record<string, unknown> & { _rev?: string } }>
		};

		const now = Date.now();
		const expired: Array<{ _id: string; _rev: string; _deleted: true }> = [];

		for (const row of allDocs.rows) {
			if (row.id.startsWith('_design/')) continue;
			const doc = row.doc;
			if (!doc?.cachedAt) continue;

			const age = now - new Date(doc.cachedAt as string).getTime();
			const ttl = (doc.ttlMs as number) || DEFAULT_TTL_MS;
			// Delete if expired by more than 2x TTL (generous buffer)
			if (age > ttl * 2 && doc._rev) {
				expired.push({ _id: row.id, _rev: doc._rev, _deleted: true });
			}
		}

		if (expired.length === 0) return { deleted: 0 };

		const baseUrl = process.env.COUCHDB_URL ?? 'http://localhost:5984';
		const auth = 'Basic ' + Buffer.from(
			`${process.env.COUCHDB_USER ?? 'admin'}:${process.env.COUCHDB_PASS ?? process.env.COUCHDB_PASSWORD ?? 'legal_ai_pass'}`
		).toString('base64');

		const res = await fetch(`${baseUrl}/${DAG_CACHE_DB}/_bulk_docs`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json', Authorization: auth },
			body: JSON.stringify({ docs: expired }),
			signal: AbortSignal.timeout(10_000),
		});

		const deleted = res.ok ? expired.length : 0;
		console.log(`[DAG Cache] Cleanup: deleted ${deleted} expired docs`);
		return { deleted };
	} catch (err) {
		const msg = (err as Error)?.message ?? String(err);
		console.warn('[DAG Cache] Cleanup failed (non-fatal):', msg);
		return { deleted: 0, error: msg };
	}
}
