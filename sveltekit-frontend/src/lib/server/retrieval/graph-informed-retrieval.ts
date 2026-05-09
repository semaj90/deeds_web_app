/**
 * Graph-Informed Retrieval Expansion (P0 KAG Gap Fix)
 *
 * Closes the gap between "graph-decorated RAG" and "graph-informed retrieval":
 *
 * Before: Graph neighbors only re-rank existing results (graphBoostRerank).
 * After:  Graph neighbor documents are searched for relevant chunks and
 *         merged into the retrieval set, weighted by connection strength.
 *
 * Flow:
 *   1. Extract neighbor node IDs not already in initial results
 *   2. Query Qdrant for chunks from those neighbor documents (same query vector)
 *   3. Weight scores by graph connection strength (authority weight)
 *   4. Merge + deduplicate + cap at budget
 */

import type { GraphNeighbor } from './graph-context.js';
import { buildVectorPayload } from '$lib/server/config/vector-config.js';
import { traceGraph } from '$lib/server/observability/langfuse.js';
import { gpuRerank, type RerankableDoc } from './gpu-reranker.js';
import { fromQdrantPoint, type UnifiedRetrievalResult } from '$lib/server/types/retrieval.js';

// ── Legacy ContextDoc shim (kept for call-sites that haven't migrated yet) ──
export interface ContextDoc {
	content: string;
	similarity: number;
	documentId: string;
	sourceId?: string;
	model?: string;
}

interface GraphExpansionConfig {
	/** Qdrant REST URL (e.g. via ENV.QDRANT_URL) */
	qdrantUrl: string;
	/** Collections to search for neighbor chunks */
	collections: readonly string[];
	/** Maximum expanded chunks to add (prevents unbounded growth) */
	maxExpansionChunks: number;
	/** Minimum Qdrant score threshold for expansion hits */
	scoreThreshold: number;
	/** Max chars per chunk */
	chunkMaxChars: number;
	/** Authority weight multiplier (0-1): how much graph strength affects ranking */
	authorityWeight: number;
}

const DEFAULT_CONFIG: GraphExpansionConfig = {
	qdrantUrl: '',
	collections: ['evidence_vectors', 'case_chunks', 'evidence_items', 'legal_documents'],
	maxExpansionChunks: 3,
	scoreThreshold: 0.35,
	chunkMaxChars: 600,
	authorityWeight: 0.2,
};

/**
 * Expand retrieval results using graph neighbor documents.
 *
 * Given initial retrieval results and graph neighbors, searches Qdrant
 * for chunks belonging to neighbor documents that are also semantically
 * relevant to the query. Merges them into the result set with
 * authority-weighted scores.
 *
 * @param queryVector - The original query embedding vector
 * @param initialDocs - Existing retrieval results (after DAG ordering)
 * @param neighbors - Graph neighbors from getGraphContext()
 * @param config - Partial config overrides
 * @returns Expanded + merged context docs (deduplicated, re-ranked)
 */
export async function graphExpandRetrieval(
	queryVector: number[],
	initialDocs: UnifiedRetrievalResult[],
	neighbors: GraphNeighbor[],
	config: Partial<GraphExpansionConfig> & { qdrantUrl: string }
): Promise<UnifiedRetrievalResult[]> {
	const cfg = { ...DEFAULT_CONFIG, ...config };

	if (!neighbors.length || !queryVector.length) return initialDocs;

	return traceGraph('graph-expand-retrieval', { neighborCount: neighbors.length, initialDocCount: initialDocs.length }, async () => {
		// 1. Find neighbor IDs not already in the initial result set
		const existingIds = new Set(
			initialDocs.map((d) => d.sourceId ?? d.id)
		);
		const newNeighbors = neighbors.filter((n) => !existingIds.has(n.nodeId));

		if (newNeighbors.length === 0) {
			console.log('[KAG Expand] All graph neighbors already in retrieval set — skipping expansion');
			return initialDocs;
		}

		console.log(
			`[KAG Expand] Expanding retrieval with ${newNeighbors.length} graph neighbors ` +
				`(${neighbors.length} total, ${neighbors.length - newNeighbors.length} already present)`
		);

		// 2. Search Qdrant for chunks from neighbor documents
		const expansionHits = await fetchNeighborChunks(
			queryVector,
			newNeighbors,
			cfg
		);

		if (expansionHits.length === 0) {
			console.log('[KAG Expand] No expansion chunks found from graph neighbors');
			return initialDocs;
		}

		// 3. Apply authority weight: score = cosine * (1 + authorityWeight * normalizedStrength)
		const weightedHits = expansionHits.map((hit) => {
			const neighbor = newNeighbors.find((n) => (hit.sourceId ?? hit.id).includes(n.nodeId));
			const normalizedStrength = neighbor ? neighbor.strength / 100 : 0.5;
			const authorityBoost = 1 + cfg.authorityWeight * normalizedStrength;
			return {
				...hit,
				score: Math.min(hit.score * authorityBoost, 1.0),
				graphDistance: 1,
			} satisfies UnifiedRetrievalResult;
		});

		// 4. Merge + deduplicate (initial docs take priority)
		const merged = [...initialDocs];
		const seenIds = new Set(initialDocs.map((d) => d.id));

		for (const hit of weightedHits) {
			if (seenIds.has(hit.id)) continue;
			seenIds.add(hit.id);
			merged.push(hit);
		}

		// 5. GPU-accelerated reranking if enough docs, else JS sort
		// gpuRerank operates on the legacy ContextDoc shape — bridge via shim
		const legacyMerged: (ContextDoc & RerankableDoc)[] = merged.map((d) => ({
			content: d.content,
			similarity: d.score,
			documentId: d.sourceId ?? d.id,
			sourceId: d.sourceId,
		}));
		const reranked = await gpuRerank<ContextDoc & RerankableDoc>(
			queryVector,
			legacyMerged,
			{ minDocsForGpu: 20, gpuWeight: 0.6 }
		);

		// Map reranked ContextDoc[] back to UnifiedRetrievalResult[] preserving metadata
		const idToUnified = new Map(merged.map((d) => [d.sourceId ?? d.id, d]));
		const result = reranked.docs.map((d) => {
			const original = idToUnified.get(d.sourceId ?? d.documentId) ?? merged[0];
			return { ...original, score: d.similarity } satisfies UnifiedRetrievalResult;
		});

		console.log(
			`[KAG Expand] Merged ${expansionHits.length} expansion chunks → ` +
				`${merged.length} total (was ${initialDocs.length}), rerank: ${reranked.source} (${reranked.rerankMs}ms)`
		);

		return result;
	}); // end traceGraph
}

/**
 * Fetch Qdrant chunks from neighbor documents using the original query vector.
 * Returns UnifiedRetrievalResult[] via fromQdrantPoint() so callers get
 * graphDistance, somCluster, and authorityScore from enriched Qdrant payloads.
 */
async function fetchNeighborChunks(
	queryVector: number[],
	neighbors: GraphNeighbor[],
	cfg: GraphExpansionConfig
): Promise<UnifiedRetrievalResult[]> {
	// Collect both node IDs and resolved evidence IDs for Qdrant matching
	const allMatchIds = new Set<string>();
	for (const n of neighbors) {
		allMatchIds.add(n.nodeId);
		for (const eid of n.evidenceIds ?? []) allMatchIds.add(eid);
	}
	const matchIds = [...allMatchIds];

	// Build Qdrant filter: match chunks whose document/evidence ID is in the neighbor set
	const idFilterKeys = ['document_id', 'evidence_id', 'source_id', 'file_path'];

	const searchPromises = cfg.collections.map(async (collection) => {
		try {
			const shouldClauses = idFilterKeys.map((key) => ({
				key,
				match: { any: matchIds },
			}));

			const vectorPayload = buildVectorPayload(collection, queryVector);

			const res = await fetch(
				`${cfg.qdrantUrl}/collections/${collection}/points/search`,
				{
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						vector: vectorPayload,
						limit: cfg.maxExpansionChunks,
						with_payload: true,
						score_threshold: cfg.scoreThreshold,
						filter: { should: shouldClauses },
					}),
					signal: AbortSignal.timeout(3000),
				}
			);

			if (!res.ok) return [] as UnifiedRetrievalResult[];
			const data = await res.json();

			return ((data.result ?? []) as Array<Record<string, unknown>>)
				.map((r) => {
					const payload = r.payload as Record<string, unknown> | undefined;
					// Truncate content to budget
					const rawContent = String(
						payload?.['text'] ??
							payload?.['content_preview'] ??
							payload?.['full_text'] ??
							payload?.['content'] ??
							payload?.['title'] ??
							''
					);
					const truncatedPayload = rawContent.length > cfg.chunkMaxChars
						? { ...payload, content: rawContent.slice(0, cfg.chunkMaxChars) + '...' }
						: payload;

					return fromQdrantPoint(
						{ id: String(r['id'] ?? ''), score: Number(r['score'] ?? 0), payload: truncatedPayload },
						{ kind: 'legal_doc', collection }
					);
				})
				.filter((c) => c.content.length > 0);
		} catch (err) {
			console.warn(
				`[KAG Expand] Qdrant search failed for ${collection}:`,
				(err as Error)?.message ?? err
			);
			return [] as UnifiedRetrievalResult[];
		}
	});

	const results = await Promise.allSettled(searchPromises);
	const allChunks: UnifiedRetrievalResult[] = [];

	for (const result of results) {
		if (result.status === 'fulfilled') {
			allChunks.push(...result.value);
		}
	}

	// Sort by score, take top N
	allChunks.sort((a, b) => b.score - a.score);
	return allChunks.slice(0, cfg.maxExpansionChunks);
}
