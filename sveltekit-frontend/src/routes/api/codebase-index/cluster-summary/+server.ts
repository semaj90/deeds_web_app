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

	const summary = await generateClusterSummary(clusterId, force);
	if (!summary) {
		return json({ error: `No chunks found for cluster ${clusterId}` }, { status: 404 });
	}

	return json(summary);
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

	const summary = await generateClusterSummary(clusterId, false);
	if (!summary) {
		return json({ error: `No summary for cluster ${clusterId}` }, { status: 404 });
	}

	return json(summary);
};