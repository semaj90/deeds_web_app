import { QDRANT_SEMANTIC_COLLECTION } from '$lib/server/atlas/retrieval/qdrant-semantic-projection.js';
import { searchQdrantCodeStrictV1 } from '$lib/server/search/qdrant-search.js';
import type { ContextDoc } from './graph-informed-retrieval.js';

export async function searchCodebaseSemanticContext(
	vector: number[],
	topK: number,
): Promise<ContextDoc[]> {
	try {
		const results = await searchQdrantCodeStrictV1(vector, topK, { exactVectorSearch: false });
		return results
			.filter((result) => result.content.length > 0 && Number.isFinite(result.semantic_score))
			.sort((left, right) => right.semantic_score - left.semantic_score)
			.slice(0, topK)
			.map((result) => ({
				content: result.content.length > 2000 ? `${result.content.slice(0, 2000)}...` : result.content,
				similarity: result.semantic_score,
				documentId: `${QDRANT_SEMANTIC_COLLECTION}:${result.stable_key}`,
				sourceId: result.source_ref ?? result.file_path,
			}));
	} catch {
		return [];
	}
}
