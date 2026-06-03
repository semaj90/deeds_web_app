/**
 * retrieval.turbovec.rerank
 *
 * Slices and sorts top-N retrieval hits by combining Qdrant semantic similarity,
 * Neo4j GraphRAG topology authority scores, and Autoencoder latent space centroids.
 * Implements fallback logic to preserve Qdrant search order if any subsystem fails.
 */

export interface QdrantHit {
	id: string | number;
	score: number;
	payload: {
		chunk_id?: string;
		file_path?: string;
		file_name?: string;
		content?: string;
		som_cluster?: number;
		[key: string]: any;
	};
}

export interface GraphRAGHints {
	authorityScores?: Record<string, number>; // file_path -> pagerank / authority
	connections?: Array<{ source: string; target: string; weight?: number }>;
}

export interface RerankOptions {
	query: string;
	hits: QdrantHit[];
	graphHints?: GraphRAGHints;
	sourceRefs?: string[];
	aeScores?: Record<string | number, number>; // pointId -> latent similarity
	/** GRPO reward scores from glyph_records — keyed by source_id or file_path (Redis gpu:glyph:rewards) */
	glyphRewardScores?: Record<string, number>;
}

export interface RerankResult {
	ok: boolean;
	hits: QdrantHit[];
	latencyMs: number;
	error?: string;
	trace?: {
		query: string;
		beforeIds: string[];
		afterIds: string[];
		scoreDeltas: Record<string, number>;
	};
}

/**
 * Perform TurboVec reranking over retrieved hits.
 * Blends semantic, topological, and latent scores.
 */
export async function turbovecRerank(options: RerankOptions): Promise<RerankResult> {
	const t0 = performance.now();
	const { query, hits, graphHints, aeScores, glyphRewardScores } = options;

	try {
		if (!hits || hits.length === 0) {
			return {
				ok: true,
				hits: [],
				latencyMs: Math.round(performance.now() - t0),
				trace: { query, beforeIds: [], afterIds: [], scoreDeltas: {} }
			};
		}

		const beforeIds = hits.map(h => String(h.id));
		const scoreDeltas: Record<string, number> = {};

		// Scoring weights — glyph GRPO reward is 4th signal (0.10)
		const semanticWeight  = 0.45;
		const topologyWeight  = 0.30;
		const latentWeight    = 0.15;
		const glyphRewardWeight = 0.10;
		const hasGlyphRewards = glyphRewardScores && Object.keys(glyphRewardScores).length > 0;

		const rerankedHits = hits.map(hit => {
			const ptId = String(hit.id);
			const filePath = hit.payload?.file_path || '';
			const sourceId = hit.payload?.source_id || hit.payload?.chunk_id || '';

			// 1. Semantic score (normalized roughly to 0..1 range)
			const sScore = hit.score || 0;

			// 2. Topology score from Neo4j pagerank/authority
			let tScore = 0;
			if (graphHints?.authorityScores) {
				tScore = graphHints.authorityScores[filePath] || 0;
			}

			// 3. Latent similarity score
			const lScore = aeScores?.[ptId] || aeScores?.[Number(ptId)] || 0;

			// 4. GRPO glyph reward score — lookup by source_id, file_path, or chunk_id
			let gScore = 0;
			if (hasGlyphRewards) {
				gScore = glyphRewardScores![sourceId]
					?? glyphRewardScores![filePath]
					?? glyphRewardScores![ptId]
					?? 0;
			}

			// Combined blend score — fall back to 3-component weights if no glyph rewards
			const blended = hasGlyphRewards
				? (sScore * semanticWeight) + (tScore * topologyWeight) + (lScore * latentWeight) + (gScore * glyphRewardWeight)
				: (sScore * 0.5) + (tScore * 0.35) + (lScore * 0.15);
			scoreDeltas[ptId] = blended - sScore;

			return {
				hit,
				blended
			};
		});

		// Sort hits by blended score desc
		rerankedHits.sort((a, b) => b.blended - a.blended);

		const finalHits = rerankedHits.map(x => x.hit);
		const afterIds = finalHits.map(h => String(h.id));

		return {
			ok: true,
			hits: finalHits,
			latencyMs: Math.round(performance.now() - t0),
			trace: {
				query,
				beforeIds,
				afterIds,
				scoreDeltas
			}
		};
	} catch (e: any) {
		return {
			ok: false,
			hits: hits, // Safe fallback to original hits
			latencyMs: Math.round(performance.now() - t0),
			error: e?.message || String(e)
		};
	}
}
