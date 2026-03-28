import { QdrantClient } from '@qdrant/js-client-rest';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';

import { getQdrantUrl } from '$lib/config/env.server.js';
const qdrant = new QdrantClient({
	url: getQdrantUrl()
});

const similarClustersSchema = z.object({
	cluster_id: z.number().int().optional(),
	embedding: z.array(z.number()).min(1, 'Valid embedding array is required'),
	limit: z.number().int().min(1).max(100).optional().default(5),
});

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	try {
		const parsed = similarClustersSchema.safeParse(await request.json());
		if (!parsed.success) {
			return json({ success: false, error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
		}
		const { cluster_id, embedding, limit } = parsed.data;

		// Search for similar clusters using cosine similarity
		const searchResults = await qdrant.search('phase89_error_clusters', {
			vector: embedding,
			limit: limit + 1, // +1 to exclude the query cluster itself
			with_payload: true,
			with_vector: false
		});
		const similar = searchResults
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
				error: 'Similarity search failed',
				similar: []
			},
			{ status: 500 }
		);
	}
};


