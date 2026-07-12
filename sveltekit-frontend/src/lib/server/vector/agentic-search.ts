import { MultiQueryGenerator } from '$lib/server/ai/multi-query-generator';
import { getQdrantClient } from '$lib/server/vector/qdrant-singleton';
// embedding-client has the `(text: string) => number[] | null` shape callers expect
// (handles gRPC → HTTP → inline cascade internally).
import { generateEmbedding } from '$lib/server/grpc/embedding-client';

export interface AgenticSearchOptions {
	collection: string;
	tags?: string[];
	limit?: number;
	expandQuery?: boolean;
	/** Additional Qdrant filter predicates merged on top of the tag filter */
	filters?: Record<string, unknown>;
}

export class AgenticSearchService {
	private static qdrant = getQdrantClient();

	/**
	 * Performs an agentic multi-query semantic search with tag filtering.
	 */
	static async search(query: string, options: AgenticSearchOptions) {
		const { collection, tags = [], limit = 10, expandQuery = true } = options;

		// 1. Expand query if requested
		const queries = expandQuery 
			? await MultiQueryGenerator.generate(query, 3) 
			: [query];
		
		if (!queries.includes(query)) queries.unshift(query); // Ensure original is included

		// 2. Prepare filters
		const filters: any = {};
		if (tags.length > 0) {
			filters.tags = tags;
		}

		// 3. Execute searches in parallel
		const searchPromises = queries.map(async (q) => {
			const embedding = await generateEmbedding(q);
			return this.qdrant.hybridSearch({
				query: q,
				queryEmbedding: embedding,
				collection,
				filters: Object.keys(filters).length > 0 ? filters : undefined,
				limit: limit * 2 // Fetch more for merging
			});
		});

		const allResults = await Promise.all(searchPromises);

		// 4. Merge results using Reciprocal Rank Fusion (RRF)
		const merged = this.mergeResults(allResults.map(r => r.results));

		return {
			query,
			expandedQueries: queries,
			results: merged.slice(0, limit),
			metadata: {
				totalSearches: queries.length,
				tagsUsed: tags
			}
		};
	}

	/**
	 * Merges multiple result sets using Reciprocal Rank Fusion (RRF).
	 */
	private static mergeResults(resultSets: any[][], k: number = 60) {
		const scores: Map<string, number> = new Map();
		const payloads: Map<string, any> = new Map();

		for (const results of resultSets) {
			results.forEach((hit, rank) => {
				const id = String(hit.id);
				const rrfScore = 1 / (k + rank + 1);
				scores.set(id, (scores.get(id) || 0) + rrfScore);
				if (!payloads.has(id)) payloads.set(id, hit.payload);
			});
		}

		return Array.from(scores.entries())
			.map(([id, score]) => ({
				id,
				score,
				payload: payloads.get(id)
			}))
			.sort((a, b) => b.score - a.score);
	}
}
