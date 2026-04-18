import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { clusterNarratives } from '$lib/server/db/schema-postgres.js';
import { eq, sql, desc } from 'drizzle-orm';
import { getAllClusterNarratives, detectCodebaseClusters } from '$lib/server/graph/codebase-cluster-detection.js';

/**
 * GET /api/codebase/narratives
 * Query params:
 *   ?clusterId=N  — single cluster
 *   ?search=text  — cosine similarity search via pgvector
 *   ?limit=10     — result limit (default 20)
 */
export const GET: RequestHandler = async ({ url }) => {
	try {
		const clusterIdParam = url.searchParams.get('clusterId');
		const search = url.searchParams.get('search');
		const limit = Math.min(Number(url.searchParams.get('limit') ?? 20), 100);

		if (search) {
			// Cosine similarity search via pgvector
			const { generateSingleEmbedding } = await import('$lib/server/grpc/embedding-client.js');
			const queryEmbedding = await generateSingleEmbedding(search);
			const vectorStr = `[${queryEmbedding.join(',')}]`;

			const rows = await db
				.select({
					id: clusterNarratives.id,
					clusterId: clusterNarratives.clusterId,
					k: clusterNarratives.k,
					purpose: clusterNarratives.purpose,
					patterns: clusterNarratives.patterns,
					keyFiles: clusterNarratives.keyFiles,
					crossReferences: clusterNarratives.crossReferences,
					memberCount: clusterNarratives.memberCount,
					dominantAstCluster: clusterNarratives.dominantAstCluster,
					tags: clusterNarratives.tags,
					similarity: sql<number>`1 - (${clusterNarratives.narrativeEmbedding} <=> ${vectorStr}::vector)`,
				})
				.from(clusterNarratives)
				.orderBy(sql`${clusterNarratives.narrativeEmbedding} <=> ${vectorStr}::vector`)
				.limit(limit);

			return json({ narratives: rows, total: rows.length, mode: 'semantic' });
		}

		if (clusterIdParam) {
			const cid = Number(clusterIdParam);
			if (Number.isNaN(cid)) return json({ narratives: [], total: 0 });
			const rows = await db.select().from(clusterNarratives).where(eq(clusterNarratives.clusterId, cid));
			return json({ narratives: rows, total: rows.length, mode: 'exact' });
		}

		// All narratives
		const rows = await db.select().from(clusterNarratives).orderBy(desc(clusterNarratives.updatedAt)).limit(limit);
		return json({ narratives: rows, total: rows.length, mode: 'all' });
	} catch {
		return json({ narratives: [], total: 0 });
	}
};

/**
 * POST /api/codebase/narratives
 * Trigger narrative re-synthesis for all clusters.
 * Body: { k?: number }
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	try {
		const body = await request.json().catch(() => ({}));
		const k = typeof body.k === 'number' ? body.k : undefined;

		// Get current cluster map from CouchDB
		const existing = await getAllClusterNarratives(k);
		if (existing.length === 0) {
      return json({ synthesized: 0, message: 'No clusters found. Run cluster detection first.' });
    }

    // Re-synthesize triggers the full pipeline including PG + Qdrant mirror
    const result = await detectCodebaseClusters(k != null ? { k } : {});
		return json({
			synthesized: result.narrativesSynthesized,
			clusters: result.k,
			files: result.filesProcessed,
		});
	} catch (e) {
		return json({ synthesized: 0, error: e instanceof Error ? e.message : 'Unknown error' }, { status: 500 });
	}
};
