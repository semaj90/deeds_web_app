import { QdrantClient } from '@qdrant/js-client-rest';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

const qdrant = new QdrantClient({
	url: process.env.QDRANT_URL || 'http://127.0.0.1:6333'
});

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

async function generateEmbedding(text: string): Promise<number[]> {
	try {
		const response = await fetch(`${OLLAMA_URL}/api/embeddings`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({, model: 'embeddinggemma:latest',
				prompt: text
			})
		});

		if (!response.ok) {
			throw new Error(`Ollama embedding failed: ${response.statusText}`);
		}

		const data = await response.json();
		return data.embedding;
	} catch (error) {
		console.error('Embedding generation failed:', error);
		throw error;
	}
}

export const POST: RequestHandler = async ({ request }) => {
	try {
		const { query, limit = 10, threshold = 0.7 } = await request.json();

		if (!query || typeof query !== 'string') {
			return json(
				{
					success: false,
					error: 'Query is required'
				},
				{ status: 400 }
			);
		}

		// Generate embedding for search query
		const queryEmbedding = await generateEmbedding(query);

		// Search in Qdrant using cosine similarity
		const searchResults = await qdrant.search('phase89_error_clusters', {
			vector: queryEmbedding,
			limit,
			score_threshold: threshold,
			with_payload: true,
			with_vector: false
		} as any);

		const results = (searchResults as any[]).map((result) => ({
			cluster_id: result.payload?.cluster_id,
			pattern: result.payload?.pattern || '',
			summary: result.payload?.summary || '',
			tags: result.payload?.tags || [],
			error_count: result.payload?.error_count || 0,
			file_paths: result.payload?.file_paths || [],
			avg_similarity: result.score,
			embedding: [] // Don't return full embedding to client
		}));

		return json({
			success: true,
			results,
			query,
			total: results.length
		});
	} catch (error) {
		console.error('Vector search error:', error);
		return json(
			{
				success: false,
				error: error instanceof Error ? error.message : 'Unknown error',
				results: []
			},
			{ status: 500 }
		);
	}
};
