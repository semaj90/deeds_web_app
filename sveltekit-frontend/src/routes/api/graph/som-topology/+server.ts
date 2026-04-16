/**
 * POST /api/graph/som-topology
 * Trigger SOM topology pipeline: trains a Kohonen Self-Organizing Map over
 * codebase_chunks_768 embeddings, writes `som_cluster` back to Qdrant payloads,
 * and creates SIMILAR_TOPOLOGY edges in Neo4j between topologically adjacent files.
 *
 * GET /api/graph/som-topology
 * Returns endpoint description and parameter reference (no auth required).
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { z } from 'zod';
import { runSOMTopologyPipeline } from '$lib/server/graph/som-topology-pipeline.js';
import { getRedis } from '$lib/server/redis.js';

// Redis key prefix written by LangGraph app.py — must match REDIS_KAG_PREFIX
const KAG_KEY_PREFIX = 'langgraph:kag:neighbors:';

const somTopologySchema = z.object({
	maxFiles: z.number().int().min(1).max(5000).optional().default(2000),
	gridW: z.number().int().min(2).max(100).optional(),
	gridH: z.number().int().min(2).max(100).optional(),
	iters: z.number().int().min(100).max(10000).optional().default(1000),
});

const DEGRADED_RESPONSE = {
	filesProcessed: 0,
	gridSize: '0x0',
	neuronsUsed: 0,
	edgesCreated: 0,
	durationMs: 0,
	source: 'cpu' as const,
};

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) {
		return json({ ...DEGRADED_RESPONSE, error: 'Unauthorized' }, { status: 401 });
	}

	let body: unknown;
	try {
		body = await request.json();
	} catch {
		body = {};
	}

	const parsed = somTopologySchema.safeParse(body);
	if (!parsed.success) {
		return json(
			{
				...DEGRADED_RESPONSE,
				error: parsed.error.issues[0]?.message ?? 'Invalid request body',
			},
			{ status: 400 }
		);
	}

	const { maxFiles, gridW, gridH, iters } = parsed.data;

	try {
		const result = await runSOMTopologyPipeline({ maxFiles, gridW, gridH, iters });

		// Invalidate stale KAG neighbor cache — topology changed, old neighbor sets are stale.
		// LangGraph app.py uses REDIS_KAG_PREFIX = "langgraph:kag:neighbors:"
		let kagKeysDeleted = 0;
		try {
			const redis = getRedis();
			const keys = await redis.keys(`${KAG_KEY_PREFIX}*`);
			if (keys.length > 0) {
				kagKeysDeleted = await redis.del(...keys);
			}
		} catch (redisErr) {
			console.warn('[/api/graph/som-topology] KAG cache flush non-fatal:', redisErr);
		}

		return json({ ...result, kagCacheKeysInvalidated: kagKeysDeleted });
	} catch (err) {
		console.error('[/api/graph/som-topology] pipeline error:', err);
		return json({ ...DEGRADED_RESPONSE, error: String(err) });
	}
};

export const GET: RequestHandler = async () => {
	return json({
		endpoint: 'POST /api/graph/som-topology',
		description:
			'Trains a Kohonen Self-Organizing Map (SOM) over codebase embeddings from the ' +
			'codebase_chunks_768 Qdrant collection. Deduplicates by file_path (one embedding per file), ' +
			'runs GPU-accelerated SOM training, writes som_cluster back to Qdrant payloads, and creates ' +
			'SIMILAR_TOPOLOGY edges in Neo4j between CodebaseFile nodes whose BMU neurons are within ' +
			'Manhattan distance ≤ 1 on the SOM grid.',
		parameters: {
			maxFiles: 'integer 1–5000 (default 2000) — max files to include in training',
			gridW: 'integer 2–100 (optional) — SOM grid width; defaults to ceil(sqrt(sqrt(n)*5))',
			gridH: 'integer 2–100 (optional) — SOM grid height; defaults to ceil(sqrt(sqrt(n)*5))',
			iters: 'integer 100–10000 (default 1000) — SOM training iterations',
		},
		response: {
			filesProcessed: 'number of unique files trained',
			gridSize: '"WxH" string, e.g. "14x14"',
			neuronsUsed: 'number of distinct BMU neurons activated',
			edgesCreated: 'SIMILAR_TOPOLOGY edges created/updated in Neo4j',
			durationMs: 'wall-clock time in milliseconds',
			source: '"gpu" | "cpu" — which compute path was used',
		},
		auth: 'Required (session cookie)',
	});
};