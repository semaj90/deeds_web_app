import { json } from '@sveltejs/kit';
import { qdrantService } from '$lib/server/services/qdrant-service';
import { OllamaService } from '$lib/services/ollamaService';
import type { ChunkRecord } from '$lib/types/pipeline-v2';

/**
 * POST /api/retrieve
 * V2 Pipeline Retrieval Endpoint
 */
export async function POST({ request }) {
    try {
        const body = await request.json();
        const { query, filters, top_k = 5, data } = body;

        // Support wrapped payload
        const payload = data || body;
        const targetQuery = payload.query || query;
        const targetFilter = payload.filters || filters;

        if (!targetQuery) return json({ error: 'Query required' }, { status: 400 });

        // 1. Embed Query
        const ollama = new OllamaService();
        const queryVector = await ollama.generateEmbedding(targetQuery, { model: 'embeddinggemma:latest' });

        if (!queryVector) return json({ error: 'Embedding failed' }, { status: 500 });

        // 2. Search Qdrant
        const results = await qdrantService.search(queryVector, targetFilter, top_k);

        // Map to ChunkRecord format for frontend
        const chunks = results.map(hit => ({
            chunk_id: hit.id,
            score: hit.score,
            ...hit.payload
        }));

        return json({
            chunks,
            total: chunks.length,
            query: targetQuery
        });

    } catch (err) {
        console.error('Retrieval error:', err);
        return json({ error: 'Internal Server Error' }, { status: 500 });
    }
}
