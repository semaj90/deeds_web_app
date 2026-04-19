import { QdrantClient } from '@qdrant/js-client-rest';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';


import { ollamaFetch } from '$lib/server/ollama.js';
import { ENV } from '$lib/server/env.server.js';
const qdrant = new QdrantClient({
	url: ENV.QDRANT_URL
});

const OLLAMA_URL = ENV.OLLAMA_BASE_URL;

async function generateEmbedding(text: string): Promise<number[]> {
	try {
		const response = await ollamaFetch(`${OLLAMA_URL}/api/embeddings`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				model: 'embeddinggemma:latest',
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

const vectorSearchSchema = z.object({
	query: z.string().trim().min(1, 'Query is required').max(5000),
	limit: z.number().int().min(1).max(100).optional().default(10),
	threshold: z.number().min(0).max(1).optional().default(0.7),
});

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) return json({ error: 'Unauthorized' }, { status: 401 });
	try {
		const parsed = vectorSearchSchema.safeParse(await request.json());
		if (!parsed.success) {
			return json({ success: false, error: parsed.error.issues[0]?.message ?? 'Invalid request' }, { status: 400 });
		}
		const { query, limit, threshold } = parsed.data;

		// Generate embedding for search query
		const queryEmbedding = await generateEmbedding(query);

		// Search in Qdrant using cosine similarity
		const searchResults = await qdrant.search('phase89_error_clusters', {
			vector: queryEmbedding,
			limit,
			score_threshold: threshold,
			with_payload: true,
			with_vector: false
		});

		const results = (searchResults as Array<{ payload?: Record<string, unknown>; score: number }>).map((result) => ({
			cluster_id: result.payload?.cluster_id,
			pattern: result.payload?.pattern ?? '',
			summary: result.payload?.summary ?? '',
			tags: result.payload?.tags ?? [],
			error_count: result.payload?.error_count ?? 0,
			file_paths: result.payload?.file_paths ?? [],
			avg_similarity: result.score,
			embedding: [] // Don't return full embedding to client
		}));

		return json({
			success: true,
			results,
			total: results.length
		});
	} catch (error) {
		console.error('Vector search error:', error);
		return json(
			{
				success: false,
				error: 'Search failed',
				results: []
			},
			{ status: 500 }
		);
	}
};