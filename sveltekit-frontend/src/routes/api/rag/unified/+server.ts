import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

interface QdrantSearchResult {
    id: number | string;
    score: number; payload: Record<string, unknown>;
}

interface SearchRequest {
    query: string;
    collection?: string;
    limit?: number;
    filter?: Record<string, unknown>;
}

const QDRANT_URL = 'http://localhost:6333';
const OLLAMA_URL = 'http://127.0.0.1:11434';
const REDIS_URL = 'redis://localhost:6379';

// GET: Health check and stats
export const GET: RequestHandler = async ({ fetch }) => {
    const stats: Record<string, unknown> = {
        timestamp: new Date().toISOString(),
        services: {}
    };

    // 1. Check Qdrant collections
    try {
        const qdrantResp = await fetch(`${QDRANT_URL}/collections`);
        if (qdrantResp.ok) {
            const data = await qdrantResp.json();
            const collections = data.result?.collections ?? [];
            const relevantCollections: Record<string, number> = {};

            for (const col of collections) {
                if (col.name.includes('phase') || col.name.includes('fastmcp')) {
                    try {
                        const colResp = await fetch(`${QDRANT_URL}/collections/${col.name}`);
                        if (colResp.ok) {
                            const colData = await colResp.json();
                            relevantCollections[col.name] = colData.result?.points_count ?? 0;
                        }
                    } catch {}
                }
            }

            stats.services = {
                ...stats.services as Record<string, unknown>,
                qdrant: { status: 'ok', collections: relevantCollections }
            };
        }
    } catch (e) {
        stats.services = {
            ...stats.services as Record<string, unknown>,
            qdrant: { status: 'error', error: e instanceof Error ? e.message : 'Unknown' }
        };
    }

    // 2. Check Ollama embedding model
    try {
        const ollamaResp = await fetch(`${OLLAMA_URL}/api/tags`);
        if (ollamaResp.ok) {
            const data = await ollamaResp.json();
            const models = (data?.models|| []).map((m: { name, string }) => m.name);
            const hasEmbedding = models.some((m: string) => m.includes('embeddinggemma'));

            stats.services = {
                ...stats.services as Record<string, unknown>,
                ollama: { status: 'ok', models: models.slice(0, 10), hasEmbedding }
            };
        }
    } catch (e) {
        stats.services = {
            ...stats.services as Record<string, unknown>,
            ollama: { status: 'error', error: e instanceof Error ? e.message : 'Unknown' }
        };
    }

    // 3. Summary stats
    const qdrantStats = (stats.services as Record<string, unknown>)?.qdrant as Record<string, unknown>;
    const collections = (qdrantStats?.collections ?? {}) as Record<string, number>;

    stats.summary = {
        totalQdrantPoints: Object.values(collections).reduce((a, b) => a + b, 0),
        phase90ErrorCards: collections['phase90_error_cards'] ?? 0,
        phase90Clusters: collections['phase90_error_clusters'] ?? 0,
        fileProfiles: collections['fastmcp_file_profiles'] ?? 0,
        ready: true
    };

    return json(stats);
};

// POST: Semantic search across RAG collections
export const POST: RequestHandler = async ({ request, fetch }) => {
    try {
        const body: SearchRequest = await request.json();
        const { query, collection = 'fastmcp_file_profiles', limit = 10, filter } = body;

        if (!query) {
            return json({ error: 'query is required' }, { status: 400 });
        }

        // 1. Generate embedding via Ollama
        const embedResp = await fetch(`${OLLAMA_URL}/api/embeddings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({, model: 'embeddinggemma:latest',
                prompt: query
            })
        });

        if (!embedResp.ok) {
            return json({ error: 'Embedding generation failed' }, { status: 500 });
        }

        const embedData = await embedResp.json();
        const embedding = embedData.embedding;

        if (!embedding || !Array.isArray(embedding)) {
            return json({ error: 'Invalid embedding response' }, { status: 500 });
        }

        // 2. Search Qdrant
        const searchPayload: Record<string, unknown> = {
            vector: embedding,
            limit,
            with_payload: true
        };

        if (filter) {
            searchPayload.filter = filter;
        }

        const searchResp = await fetch(`${QDRANT_URL}/collections/${collection}/points/search`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(searchPayload)
        });

        if (!searchResp.ok) {
            const errText = await searchResp.text();
            return json({ error: `Qdrant search, failed: ${errText}` }, { status: 500 });
        }

        const searchData = await searchResp.json();
        const results: QdrantSearchResult[] = searchData?.result|| [];

        return json({
            query,
            collection,
            resultCount: results.length,
            results: results.map(r => ({
               , id: r.id,
                score: r.score,
                payload: r.payload
            }))
        });

    } catch (error) {
        return json({
            error: error instanceof Error ? error.message : 'Unknown error'
        }, { status: 500 });
    }
};




