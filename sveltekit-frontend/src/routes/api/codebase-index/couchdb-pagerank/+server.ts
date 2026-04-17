/**
 * POST /api/codebase-index/couchdb-pagerank
 *
 * Runs CouchDB MapReduce PageRank (Step 21) on the codebase_graph database.
 * After computing power-iteration PageRank from the link_matrix view, it:
 *   1. Writes pagerank_score_couchdb back to CouchDB documents
 *   2. Caches score map in Redis (6h TTL)
 *   3. Optionally syncs scores to Qdrant payload + Neo4j properties
 *
 * GET /api/codebase-index/couchdb-pagerank
 *   Returns current cached scores (Redis) or last-run summary.
 *   Degraded: { cached: false, topFiles: [], nodesScored: 0, message }
 *
 * Body (POST):
 *   syncQdrant?  boolean  — write pagerank_score_couchdb to Qdrant payload (default true)
 *   syncNeo4j?   boolean  — write f.pagerank_score_couchdb to Neo4j nodes (default false)
 *   dryRun?      boolean  — compute + log, do not write (default false)
 *
 * Auth: requires locals.user
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import {
	runCouchDbPageRank,
	getCachedPageRankScores,
	ensureCouchDbDesignDoc,
} from '$lib/server/graph/couchdb-pagerank.js';
import { ENV } from '$lib/server/env.server.js';

const bodySchema = z.object({
	syncQdrant: z.boolean().default(true),
	syncNeo4j:  z.boolean().default(false),
	dryRun:     z.boolean().default(false),
});

// ── POST — run PageRank pipeline ──────────────────────────────────────────

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const raw    = await request.json().catch(() => ({}));
	const parsed = bodySchema.safeParse(raw);
	const opts   = parsed.success ? parsed.data : bodySchema.parse({});

	try {
		// Ensure design doc exists before running
		await ensureCouchDbDesignDoc();

		if (opts.dryRun) {
			// Just validate CouchDB is reachable and design doc is in place
			const couchUrl = process.env.COUCHDB_URL ?? 'http://localhost:5984';
			const checkRes = await fetch(
				`${couchUrl}/codebase_graph/_design/codebase_graph/_view/link_matrix?reduce=false&limit=5`,
				{ headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(5_000) }
			).catch(() => null);

			const edgeSample = checkRes?.ok
				? ((await checkRes.json()) as { rows?: unknown[] }).rows?.length ?? 0
				: 0;

			return json({
				dryRun:      true,
				couchdbOk:   checkRes?.ok ?? false,
				edgeSample,
				message:     checkRes?.ok
					? `CouchDB reachable — found ${edgeSample} edge sample rows (full view may have more)`
					: 'CouchDB unreachable or link_matrix view missing — run graph-sync first',
			});
		}

		const result = await runCouchDbPageRank();

		// Optional: sync scores to Qdrant payload
		let qdrantUpdated = 0;
		if (opts.syncQdrant && result.nodesScored > 0) {
			qdrantUpdated = await syncScoresToQdrant(
				// Re-read from Redis cache rather than re-computing
				await getCachedPageRankScores() ?? new Map()
			);
		}

		// Optional: sync to Neo4j
		let neo4jUpdated = 0;
		if (opts.syncNeo4j && result.nodesScored > 0) {
			neo4jUpdated = await syncScoresToNeo4j(
				await getCachedPageRankScores() ?? new Map()
			);
		}

		return json({
			...result,
			qdrantUpdated,
			neo4jUpdated,
			syncQdrant: opts.syncQdrant,
			syncNeo4j:  opts.syncNeo4j,
		});
	} catch (err) {
		const msg = err instanceof Error ? err.message : String(err);
		console.error('[couchdb-pagerank] Pipeline failed:', msg);
		return json({ error: msg }, { status: 500 });
	}
};

// ── GET — read cached scores ───────────────────────────────────────────────

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	try {
		const cached = await getCachedPageRankScores();
		if (!cached) {
			return json({
				cached:      false,
				nodesScored: 0,
				topFiles:    [],
				message:     'No cached PageRank scores — POST to /api/codebase-index/couchdb-pagerank to compute',
			});
		}

		const topFiles = [...cached.entries()]
			.sort((a, b) => b[1] - a[1])
			.slice(0, 20)
			.map(([path, score]) => ({ path, score: Math.round(score * 1000) / 1000 }));

		return json({
			cached:      true,
			nodesScored: cached.size,
			topFiles,
		});
	} catch (err) {
		return json({ cached: false, nodesScored: 0, topFiles: [], message: String(err) });
	}
};

// ── Helpers ───────────────────────────────────────────────────────────────

/** Write pagerank_score_couchdb to Qdrant payload for all scored files. */
async function syncScoresToQdrant(scores: Map<string, number>): Promise<number> {
	if (scores.size === 0) return 0;

	const qdrantUrl = ENV.QDRANT_URL;
	const collection = 'codebase_chunks_768';
	const entries    = [...scores.entries()];
	let   updated    = 0;

	// Batch by 50 — one Qdrant set-payload call per file (filter by relativePath)
	const concurrencyLimit = 10;
	for (let i = 0; i < entries.length; i += concurrencyLimit) {
		const batch = entries.slice(i, i + concurrencyLimit);
		await Promise.all(batch.map(async ([relativePath, score]) => {
			try {
				const res = await fetch(
					`${qdrantUrl}/collections/${collection}/points/payload`,
					{
						method:  'POST',
						headers: { 'Content-Type': 'application/json' },
						body:    JSON.stringify({
							payload: { pagerank_score_couchdb: score },
							filter:  { must: [{ key: 'relativePath', match: { value: relativePath } }] },
						}),
						signal: AbortSignal.timeout(5_000),
					}
				);
				if (res.ok) updated++;
			} catch { /* non-fatal */ }
		}));
	}

	return updated;
}

/** Write f.pagerank_score_couchdb to Neo4j CodebaseFile nodes. */
async function syncScoresToNeo4j(scores: Map<string, number>): Promise<number> {
	if (scores.size === 0) return 0;

	try {
		const { getNeo4jDriver } = await import('$lib/server/neo4j-driver.js');
		const driver  = getNeo4jDriver();
		const session = driver.session({ database: 'neo4j' });

		const batch = [...scores.entries()].map(([id, score]) => ({ id, score }));
		const BATCH  = 500;
		let updated  = 0;

		for (let i = 0; i < batch.length; i += BATCH) {
			const slice = batch.slice(i, i + BATCH);
			await session.run(
				`UNWIND $batch AS item
				 MATCH (f:CodebaseFile {id: item.id})
				 SET f.pagerank_score_couchdb = item.score`,
				{ batch: slice }
			);
			updated += slice.length;
		}

		await session.close();
		return updated;
	} catch (err) {
		console.warn('[couchdb-pagerank] Neo4j sync failed (non-fatal):', err);
		return 0;
	}
}
