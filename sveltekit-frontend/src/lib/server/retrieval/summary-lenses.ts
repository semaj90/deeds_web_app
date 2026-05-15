import { db } from '$lib/server/db/client';
import { embeddedSummaries } from '$lib/server/db/schema/embedded-summaries';
import { eq, or, sql, and, gte, lte } from 'drizzle-orm';

export interface SummaryLensHit {
	id: string;
	title: string;
	summary: string;
	url?: string;
	gpuCluster?: number;
	topoClass?: string;
	relevanceScore: number;
}

/**
 * Summary Lenses Lane
 * 
 * Retrieves high-fidelity research summaries based on topological proximity.
 * Complements the raw chunk retrieval by providing high-level thematic context.
 */
export class SummaryLensesService {
	/**
	 * Search for high-fidelity summaries within a manifold neighborhood.
	 */
	static async searchByManifold(
		manifold4: [number, number, number, number], 
		radius: number = 0.25, 
		limit: number = 5
	): Promise<SummaryLensHit[]> {
		const [x, y, z, w] = manifold4;
		
		try {
			const rows = await db.execute(sql`
				SELECT 
					id, 
					chunk_id as title, 
					summary_text as summary, 
					gpu_cluster,
					topo_class,
					confidence as relevance_score,
					(manifold4::vector <-> ${`[${x},${y},${z},${w}]`}::vector) as dist
				FROM embedded_summaries
				WHERE manifold4 IS NOT NULL
				  AND array_length(manifold4, 1) = 4
				  AND (manifold4::vector <-> ${`[${x},${y},${z},${w}]`}::vector) <= ${radius}
				ORDER BY dist ASC
				LIMIT ${limit}
			`);

			return (rows.rows as any[]).map(row => ({
				id: row.id,
				title: row.title,
				summary: row.summary,
				gpuCluster: row.gpu_cluster,
				topoClass: row.topo_class,
				relevanceScore: 1 / (1 + Number(row.dist))
			}));
		} catch (err) {
			console.error('[summary-lenses] Manifold search failed:', err);
			return [];
		}
	}

	/**
	 * Search for summaries by cluster ID.
	 */
	static async searchByCluster(clusterId: number, limit: number = 5): Promise<SummaryLensHit[]> {
		try {
			const results = await db.select({
				id: embeddedSummaries.id,
				title: embeddedSummaries.chunkId,
				summary: embeddedSummaries.summaryText,
				gpuCluster: embeddedSummaries.gpuCluster,
				topoClass: embeddedSummaries.topoClass,
				relevanceScore: embeddedSummaries.confidence
			})
				.from(embeddedSummaries)
				.where(eq(embeddedSummaries.gpuCluster, clusterId))
				.orderBy(sql`confidence DESC`)
				.limit(limit);

			return results.map(row => ({
				id: String(row.id),
				title: row.title ?? 'Untitled Summary',
				summary: row.summary ?? '',
				gpuCluster: row.gpuCluster ?? undefined,
				topoClass: row.topoClass ?? undefined,
				relevanceScore: Number(row.relevanceScore ?? 0)
			}));
		} catch (err) {
			console.error('[summary-lenses] Cluster search failed:', err);
			return [];
		}
	}
}
