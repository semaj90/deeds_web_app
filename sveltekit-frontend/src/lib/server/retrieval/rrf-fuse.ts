/**
 * Reciprocal Rank Fusion (RRF) — combine multiple ranked lists into one.
 *
 * Standard formula: rrf_score(d) = Σ_l (weight_l / (k + rank_l(d)))
 *
 * Why RRF over score-normalised fusion:
 * - Different rankers produce non-comparable scores (cosine ∈ [0, 1] vs ts_rank ∈ ℝ⁺).
 *   RRF only uses the ranks, sidestepping normalisation entirely.
 * - Robust to one source returning fewer hits than another.
 * - Standard k=60 is the value used in the original RRF paper (Cormack et al., 2009)
 *   and in Elasticsearch / Solr / Qdrant hybrid search defaults.
 *
 * Design notes for this codebase:
 * - Pure function. No I/O. Deterministic. Testable in vitest.
 * - Default k=60. Override per-call if a ranker is so noisy you want to
 *   damp it (raise k) or so trustworthy you want to amplify (lower k).
 * - Weights default to 1.0. The Karpathy authority blend is NOT applied here
 *   — that lives in src/lib/server/atlas/context-for-file.ts and runs as a
 *   separate post-fusion rerank pass.
 */

export interface RrfHit {
	/** Stable identifier — caller decides what's stable for their domain (chunk_id, file path, doc.id, etc.) */
	id: string;
	/** Original ranker score — preserved for debugging only; not used by RRF */
	score?: number;
	/** Optional payload passed through to the fused result */
	payload?: Record<string, unknown>;
}

export interface RrfSource {
	/** Hits from one ranker, ordered best-first (rank 1 is most relevant) */
	hits: readonly RrfHit[];
	/** Source weight, default 1.0. Use 0 < w ≤ 1.5 in practice. */
	weight?: number;
	/** Optional source label for trace logging */
	label?: string;
}

export interface RrfOptions {
	/** RRF constant — higher = flatter ranking. Default 60. */
	k?: number;
	/** Cap output length. Default Infinity. */
	topK?: number;
	/** Include per-source breakdown in `provenance` field of each result */
	includeProvenance?: boolean;
}

export interface RrfResult {
	id: string;
	rrfScore: number;
	payload?: Record<string, unknown>;
	provenance?: Record<string, { rank: number; contribution: number }>;
}

/**
 * Fuse N ranked lists via reciprocal rank.
 *
 * @example
 *   const fused = rrfFuse(
 *     [
 *       { hits: denseHits, weight: 0.6, label: 'qdrant' },
 *       { hits: sparseHits, weight: 0.4, label: 'bm25' },
 *     ],
 *     { topK: 10 }
 *   );
 *   // fused[0] = highest combined relevance
 */
export function rrfFuse(
	sources: readonly RrfSource[],
	options: RrfOptions = {}
): RrfResult[] {
	const k = options.k ?? 60;
	const topK = options.topK ?? Infinity;
	const includeProvenance = options.includeProvenance ?? false;

	if (k <= 0) throw new Error(`RRF k must be > 0 (got ${k})`);
	if (sources.length === 0) return [];

	const accum = new Map<string, RrfResult>();

	for (const source of sources) {
		const weight = source.weight ?? 1.0;
		if (weight <= 0) continue; // 0 weight = ignore this source
		const label = source.label ?? `source_${sources.indexOf(source)}`;

		// rank is 1-based; index 0 → rank 1
		source.hits.forEach((hit, idx) => {
			const rank = idx + 1;
			const contribution = weight / (k + rank);

			const existing = accum.get(hit.id);
			if (existing) {
				existing.rrfScore += contribution;
				// Prefer earlier-source payload if not already set
				if (!existing.payload && hit.payload) existing.payload = hit.payload;
				if (existing.provenance) {
					existing.provenance[label] = { rank, contribution };
				}
			} else {
				const next: RrfResult = {
					id: hit.id,
					rrfScore: contribution,
					payload: hit.payload,
				};
				if (includeProvenance) {
					next.provenance = { [label]: { rank, contribution } };
				}
				accum.set(hit.id, next);
			}
		});
	}

	// Sort by rrfScore desc; stable sort by id asc as tiebreaker
	const fused = [...accum.values()].sort((a, b) => {
		if (b.rrfScore !== a.rrfScore) return b.rrfScore - a.rrfScore;
		return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
	});

	return Number.isFinite(topK) ? fused.slice(0, topK) : fused;
}

/**
 * Convenience: fuse a dense (semantic) lane with a sparse (BM25/lexical) lane.
 *
 * Defaults match the cheatsheet's "Tier 2" recommendation:
 *   - dense weight 0.6 (semantic intent matters more for legal Q&A)
 *   - sparse weight 0.4 (exact statute/cite matches catch what dense misses)
 *   - k=60 (standard)
 */
export function rrfFuseDenseSparse(
	dense: readonly RrfHit[],
	sparse: readonly RrfHit[],
	options: { topK?: number; denseWeight?: number; sparseWeight?: number } = {}
): RrfResult[] {
	return rrfFuse(
		[
			{ hits: dense,  weight: options.denseWeight  ?? 0.6, label: 'dense'  },
			{ hits: sparse, weight: options.sparseWeight ?? 0.4, label: 'sparse' },
		],
		{ topK: options.topK, includeProvenance: true }
	);
}
