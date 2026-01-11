import { QdrantClient } from '@qdrant/js-client-rest';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const qdrant = new QdrantClient({
	url: process.env.QDRANT_URL || 'http://127.0.0.1:6333'
});

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { cluster_id, embedding, limit = 5 } = await request.json();

		if (!embedding || !Array.isArray(embedding)) {
			return json(
				{
					success: false,
					error: 'Valid embedding array is required'
				},
				{ status: 400 }
			);
		}

		// Search for similar clusters using cosine similarity
		const searchResults = await qdrant.search('phase89_error_clusters', {
			vector: embedding,
			limit: limit + 1, // +1 to exclude the query cluster itself
			with_payload: true,
			with_vector: false
		} as any);

		const similar = (searchResults as any[])
			.filter((result) => result.payload?.cluster_id !== cluster_id)
			.slice(0, limit)
			.map((result) => ({
				cluster_id: result.payload?.cluster_id,
				pattern: result.payload?.pattern ?? '',
				summary: result.payload?.summary ?? '',
				tags: result.payload?.tags ?? [],
				error_count: result.payload?.error_count ?? 0,
				file_paths: result.payload?.file_paths ?? [],
				avg_similarity: result.score,
				embedding: []
			}));

		return json({
			success: true,
			similar,
			total: similar.length
		});
	} catch (error) {
		console.error('Similar clusters search error:', error);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error',
				similar: []
			},
			{ status: 500 }
		);
	}
};


