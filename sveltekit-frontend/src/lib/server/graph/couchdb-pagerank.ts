/**
 * CouchDB MapReduce PageRank — Step 21
 *
 * Computes PageRank from the `codebase_graph` CouchDB database using
 * the `link_matrix` MapReduce view, then runs power-iteration in TypeScript.
 *
 * Why CouchDB instead of Neo4j GDS:
 *   - Works without Neo4j GDS plugin or Colab notebook
 *   - Durable across Docker restarts (CouchDB persists to disk)
 *   - Incrementally maintained — new documents update the view lazily
 *   - Produces `pagerank_score_couchdb` payload field in Qdrant as middle-tier fallback
 *
 * PageRank retrieval priority in codebase-context.ts:
 *   1. Colab GPU `pagerank_score`        (highest precision)
 *   2. CouchDB power-iteration `pagerank_score_couchdb`  (durable, this module)
 *   3. Local LibTorch `neo4j_pageRankScore`              (always present after gpu-audit)
 */

import { getRedis } from '$lib/server/redis.js';

const COUCHDB_URL = process.env.COUCHDB_URL ?? 'http://localhost:5984';
const COUCHDB_DB  = 'codebase_graph';
const DAMPING     = 0.85;
const MAX_ITER    = 100;
const TOLERANCE   = 1e-6;
const REDIS_KEY   = 'couchdb:pagerank_scores';
const REDIS_TTL   = 6 * 3600; // 6 hours

// ── CouchDB design document ────────────────────────────────────────────────

/**
 * Upload the design document to CouchDB if it doesn't exist.
 * Safe to call on every startup — uses PUT with _rev for updates.
 */
export async function ensureCouchDbDesignDoc(): Promise<void> {
	const designId = '_design/codebase_graph';
	const designUrl = `${COUCHDB_URL}/${COUCHDB_DB}/${designId}`;

	// Check if it already exists
	const checkRes = await fetch(designUrl, {
		headers: { Accept: 'application/json' }
	}).catch(() => null);

	const doc: Record<string, unknown> = {
		views: {
			link_matrix: {
				map: `function(doc) {
					if (doc.type !== 'codebase_file' || !doc.imports) return;
					doc.imports.forEach(function(t) { emit([doc._id, t], 1); });
				}`,
			},
			in_degree: {
				map: `function(doc) {
					if (doc.type !== 'codebase_file' || !doc.imports) return;
					doc.imports.forEach(function(t) { emit(t, 1); });
				}`,
				reduce: '_count',
			},
			out_degree: {
				map: `function(doc) {
					if (doc.type !== 'codebase_file') return;
					emit(doc._id, (doc.imports || []).length);
				}`,
				reduce: '_sum',
			},
			file_scores: {
				map: `function(doc) {
					if (doc.type === 'codebase_file' && doc.pagerank_score_couchdb != null) {
						emit(doc._id, {
							pagerank: doc.pagerank_score_couchdb,
							complexity: doc.complexity,
							routeType: doc.routeType
						});
					}
				}`,
			},
		},
	};

	if (checkRes?.ok) {
		// Update existing — need _rev
		const existing = await checkRes.json() as Record<string, unknown>;
		doc._rev = existing._rev;
	}

	await fetch(designUrl, {
		method:  'PUT',
		headers: { 'Content-Type': 'application/json' },
		body:    JSON.stringify(doc),
	}).catch(() => {}); // non-fatal
}

// ── Edge loading ───────────────────────────────────────────────────────────

interface Edge { source: string; target: string }

async function loadEdges(): Promise<Edge[]> {
	const res = await fetch(
		`${COUCHDB_URL}/${COUCHDB_DB}/_design/codebase_graph/_view/link_matrix?reduce=false`,
		{
			headers: { Accept: 'application/json' },
			signal:  AbortSignal.timeout(30_000),
		}
	);
	if (!res.ok) throw new Error(`CouchDB link_matrix view failed: ${res.status}`);

	const data = await res.json() as { rows?: Array<{ key: [string, string] }> };
	return (data.rows ?? []).map((r) => ({ source: r.key[0], target: r.key[1] }));
}

// ── Power-iteration PageRank ───────────────────────────────────────────────

/**
 * Compute PageRank from a sparse edge list using adjacency-list power iteration.
 * O(E × iter) time, O(N + E) space.
 *
 * @returns Map<relativePath, normalised_score_0_to_1>
 */
export function computePageRank(edges: Edge[]): Map<string, number> {
	if (edges.length === 0) return new Map();

	// Build node set + adjacency structures
	const nodes  = new Set<string>();
	const outDeg = new Map<string, number>();          // outgoing edge count per source
	const preds  = new Map<string, string[]>();        // predecessors[target] = [source, ...]

	for (const e of edges) {
		nodes.add(e.source);
		nodes.add(e.target);
		outDeg.set(e.source, (outDeg.get(e.source) ?? 0) + 1);
		if (!preds.has(e.target)) preds.set(e.target, []);
		preds.get(e.target)!.push(e.source);
	}

	const N       = nodes.size;
	const nodeArr = [...nodes];

	// Initialise uniform rank
	const rank = new Map<string, number>(nodeArr.map((n) => [n, 1 / N]));

	// Dangling nodes (no outgoing edges) redistribute their rank uniformly
	const dangling = nodeArr.filter((n) => !outDeg.has(n));

	for (let iter = 0; iter < MAX_ITER; iter++) {
		// Sum dangling rank contribution (shared evenly among all nodes)
		const danglingSum = dangling.reduce((s, n) => s + (rank.get(n) ?? 0), 0);
		const danglingShare = DAMPING * danglingSum / N;

		const newRank = new Map<string, number>();
		let delta = 0;

		for (const node of nodeArr) {
			// Teleportation + dangling redistribution
			let score = (1 - DAMPING) / N + danglingShare;

			// Incoming contributions from predecessors
			for (const pred of (preds.get(node) ?? [])) {
				score += DAMPING * (rank.get(pred) ?? 0) / (outDeg.get(pred) ?? 1);
			}

			newRank.set(node, score);
			delta = Math.max(delta, Math.abs(score - (rank.get(node) ?? 0)));
		}

		for (const [n, s] of newRank) rank.set(n, s);
		if (delta < TOLERANCE) {
			console.log(`[couchdb-pagerank] Converged in ${iter + 1} iterations (delta=${delta.toExponential(2)})`);
			break;
		}
	}

	// Normalise to 0–1 range
	const maxScore = Math.max(...rank.values());
	if (maxScore > 0) {
		for (const [n, s] of rank) rank.set(n, s / maxScore);
	}

	return rank;
}

// ── Persist scores ─────────────────────────────────────────────────────────

/** PATCH pagerank_score_couchdb back into CouchDB documents (100 at a time). */
async function persistToCouchDb(scores: Map<string, number>): Promise<number> {
	const entries = [...scores.entries()];
	let written = 0;

	for (let i = 0; i < entries.length; i += 100) {
		const batch = entries.slice(i, i + 100);

		// Fetch current _rev for each doc (needed for update)
		const ids = batch.map(([id]) => id);
		const allDocsRes = await fetch(`${COUCHDB_URL}/${COUCHDB_DB}/_all_docs`, {
			method:  'POST',
			headers: { 'Content-Type': 'application/json' },
			body:    JSON.stringify({ keys: ids }),
		}).catch(() => null);

		const revMap = new Map<string, string>();
		if (allDocsRes?.ok) {
			const allDocs = await allDocsRes.json() as {
				rows?: Array<{ id: string; value?: { rev: string } }>;
			};
			for (const row of allDocs.rows ?? []) {
				if (row.value?.rev) revMap.set(row.id, row.value.rev);
			}
		}

		// Bulk update with _rev
		const docs = batch.map(([id, score]) => {
			const doc: Record<string, unknown> = {
				_id: id,
				pagerank_score_couchdb: score,
			};
			const rev = revMap.get(id);
			if (rev) doc._rev = rev;
			return doc;
		});

		const bulkRes = await fetch(`${COUCHDB_URL}/${COUCHDB_DB}/_bulk_docs`, {
			method:  'POST',
			headers: { 'Content-Type': 'application/json' },
			body:    JSON.stringify({ docs }),
		}).catch(() => null);

		if (bulkRes?.ok) written += batch.length;
	}

	return written;
}

/** Cache the score map in Redis for fast reads (TTL=6h). */
async function cacheInRedis(scores: Map<string, number>): Promise<void> {
	try {
		const redis = getRedis();
		await redis.setex(
			REDIS_KEY,
			REDIS_TTL,
			JSON.stringify(Object.fromEntries(scores))
		);
	} catch {
		// Redis unavailable — non-fatal
	}
}

// ── Public API ─────────────────────────────────────────────────────────────

export interface CouchDbPageRankResult {
	nodesScored:  number;
	edgesUsed:    number;
	writtenCouch: number;
	topFiles:     Array<{ path: string; score: number }>;
	durationMs:   number;
}

/**
 * Full pipeline:
 *   1. Ensure CouchDB design doc + link_matrix view exist
 *   2. Load all edges from CouchDB MapReduce view
 *   3. Run power-iteration PageRank (converges in ~50 iterations for 3140 nodes)
 *   4. PATCH pagerank_score_couchdb back to CouchDB
 *   5. Cache score map in Redis (6h TTL)
 *   6. Return summary for API response + Neo4j/Qdrant callers
 */
export async function runCouchDbPageRank(): Promise<CouchDbPageRankResult> {
	const start = Date.now();

	await ensureCouchDbDesignDoc();

	const edges = await loadEdges();
	if (edges.length === 0) {
		throw new Error(
			'No edges in CouchDB link_matrix view — run graph-sync first to populate codebase_graph documents'
		);
	}

	const scores = computePageRank(edges);

	const [writtenCouch] = await Promise.all([
		persistToCouchDb(scores),
		cacheInRedis(scores),
	]);

	// Top-10 files by PageRank for API response / admin display
	const topFiles = [...scores.entries()]
		.sort((a, b) => b[1] - a[1])
		.slice(0, 10)
		.map(([path, score]) => ({ path, score: Math.round(score * 1000) / 1000 }));

	return {
		nodesScored:  scores.size,
		edgesUsed:    edges.length,
		writtenCouch,
		topFiles,
		durationMs:   Date.now() - start,
	};
}

/**
 * Fast read: return cached PageRank scores from Redis.
 * Falls back to null if Redis is unavailable or cache is cold.
 */
export async function getCachedPageRankScores(): Promise<Map<string, number> | null> {
	try {
		const redis  = getRedis();
		const cached = await redis.get(REDIS_KEY);
		if (!cached) return null;
		const obj = JSON.parse(cached) as Record<string, number>;
		return new Map(Object.entries(obj));
	} catch {
		return null;
	}
}

/**
 * Write CouchDB mirror documents for a set of scanned nodes.
 * Called by syncCodebaseToNeo4j() after mergeEdges() to keep the
 * link graph in CouchDB in sync with the scanner output.
 *
 * Uses _bulk_docs for efficiency — no Neo4j dependency.
 */
export async function syncNodesToCouchDb(
	nodes: Array<{
		id: string;                  // relativePath (Qdrant / CouchDB _id)
		filePath: string;
		imports?: string[];          // list of imported relativePaths
		lineCount?: number;
		complexity?: number;
		routeType?: string | null;
		hasAuthGuard?: boolean;
		isRouteFile?: boolean;
	}>
): Promise<{ written: number; failed: number }> {
	// Fetch existing _revs so we don't create conflicts
	const ids = nodes.map((n) => n.id);
	let revMap = new Map<string, string>();

	try {
		const allDocsRes = await fetch(`${COUCHDB_URL}/${COUCHDB_DB}/_all_docs`, {
			method:  'POST',
			headers: { 'Content-Type': 'application/json' },
			body:    JSON.stringify({ keys: ids }),
			signal:  AbortSignal.timeout(15_000),
		});
		if (allDocsRes.ok) {
			const allDocs = await allDocsRes.json() as {
				rows?: Array<{ id: string; value?: { rev: string } }>;
			};
			for (const row of allDocs.rows ?? []) {
				if (row.value?.rev) revMap.set(row.id, row.value.rev);
			}
		}
	} catch {
		// Best-effort — proceed without _rev (may cause 409 conflicts for existing docs)
	}

	const docs = nodes.map((n) => {
		const doc: Record<string, unknown> = {
			_id:          n.id,
			type:         'codebase_file',
			filePath:     n.filePath,
			imports:      n.imports ?? [],
			lineCount:    n.lineCount,
			complexity:   n.complexity,
			routeType:    n.routeType ?? null,
			hasAuthGuard: n.hasAuthGuard ?? false,
			isRouteFile:  n.isRouteFile ?? false,
			updatedAt:    new Date().toISOString(),
		};
		const rev = revMap.get(n.id);
		if (rev) doc._rev = rev;
		return doc;
	});

	let written = 0;
	let failed  = 0;

	// Batch in chunks of 200
	for (let i = 0; i < docs.length; i += 200) {
		const batch = docs.slice(i, i + 200);
		try {
			const res = await fetch(`${COUCHDB_URL}/${COUCHDB_DB}/_bulk_docs`, {
				method:  'POST',
				headers: { 'Content-Type': 'application/json' },
				body:    JSON.stringify({ docs: batch }),
				signal:  AbortSignal.timeout(15_000),
			});
			if (res.ok) {
				const results = await res.json() as Array<{ ok?: boolean; error?: string }>;
				for (const r of results) {
					if (r.ok) written++;
					else failed++;
				}
			} else {
				failed += batch.length;
			}
		} catch {
			failed += batch.length;
		}
	}

	return { written, failed };
}
