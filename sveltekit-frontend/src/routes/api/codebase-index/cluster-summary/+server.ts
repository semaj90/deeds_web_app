/**
 * POST /api/codebase-index/cluster-summary
 *
 * Generate (or return cached) a VLM-synthesised narrative for a GPU cluster.
 *
 * Body: { clusterId: number, force?: boolean }
 * Response: ClusterSummary | { error: string }
 *
 * Cache: Redis 6h TTL per clusterId (bypass with force: true)
 * Auth: requires locals.user
 */
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { generateClusterSummary } from '$lib/server/indexer/cluster-summary.js';

const bodySchema = z.object({
	clusterId: z.number().int().min(0).max(999),
	force: z.boolean().optional().default(false),
});

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const raw = await request.json().catch(() => ({}));
	const parsed = bodySchema.safeParse(raw);
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
	}

	const { clusterId, force } = parsed.data;

	const result = await generateClusterSummary(clusterId, force);
	if (result.ok === false) {
		return json({ error: result.reason }, { status: 404 });
	}

	return json(result.summary);
};

/**
 * GET /api/codebase-index/cluster-summary?clusterId=N
 *
 * Convenience alias — same behaviour, cache-only (never forces regeneration).
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const clusterIdStr = url.searchParams.get('clusterId');
	const clusterId = clusterIdStr ? parseInt(clusterIdStr, 10) : NaN;
	if (isNaN(clusterId)) {
		return json({ error: 'clusterId query param required' }, { status: 400 });
	}

	const result = await generateClusterSummary(clusterId, false);
	if (result.ok === false) {
		return json({ error: result.reason }, { status: 404 });
	}

	return json(result.summary);
};

/**
 * PUT /api/codebase-index/cluster-summary
 *
 * Batch-regenerate summaries for all distinct gpu_cluster values in Postgres.
 * Runs sequentially (one at a time) to avoid hammering Ollama.
 *
 * Body: { force?: boolean }   — force=true bypasses Redis cache (default true)
 * Response: { total, succeeded, failed, skipped, results: [...] }
 */
export const PUT: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });

	const raw = await request.json().catch(() => ({}));
	const force: boolean = raw?.force !== false; // default true

	const { pool } = await import('$lib/server/db/client');
	const clusterRows = await pool.query<{ cluster_id: number }>(
		`SELECT DISTINCT gpu_cluster AS cluster_id
		   FROM codebase_chunk_index
		  WHERE gpu_cluster IS NOT NULL
		  ORDER BY gpu_cluster ASC`,
	);

	const clusterIds = clusterRows.rows.map((r) => Number(r.cluster_id));

	// Fire-and-forget — sequential loop runs in background so the request returns
	// immediately instead of timing out after ~500s (20 clusters × ~25s each).
	(async () => {
		let succeeded = 0;
		let failed = 0;
		let skipped = 0;
		for (const clusterId of clusterIds) {
			try {
				const r = await generateClusterSummary(clusterId, force);
				if (r.ok) {
					succeeded++;
				} else {
					skipped++;
				}
			} catch {
				failed++;
			}
		}

		// Phase 7: Once narratives are synthesised, bake the full architecture buffer
		// This makes the 20 clusters instantly available as a single ID-ready context.
		try {
			const { bakeArchitectureBuffer } = await import('$lib/server/retrieval/context-buffer.js');
			await bakeArchitectureBuffer();
			console.log('[cluster-summary] Architecture buffer pre-warmed successfully.');
		} catch (err) {
			console.warn('[cluster-summary] Buffer pre-warming failed:', err);
		}

		console.log(
			`[cluster-summary] backfill complete — succeeded:${succeeded} skipped:${skipped} failed:${failed}`,
		);
	})().catch((err) =>
		console.error('[cluster-summary] backfill loop error:', (err as Error)?.message),
	);

	return json({ status: 'started', total: clusterIds.length, clusters: clusterIds }, { status: 202 });
};
