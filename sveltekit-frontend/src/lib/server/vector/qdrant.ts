import { CONFIG } from '$lib/config/env.server';
import type { DocumentItem, SearchResult } from '$lib/types/sharedTypes';
import { QdrantClient } from '@qdrant/js-client-rest';
import { logger } from '../production-logger.js';

const qdrantUrl = CONFIG?.QDRANT_URL || process.env.QDRANT_URL || 'http://127.0.0.1:6333';

export const qdrantClient = new QdrantClient({ url: qdrantUrl });

export async function initQdrant(): Promise<void> {
    try {
        const probeUrl = `${qdrantUrl.replace(/\/$/, '')}/collections`;
        const res = await fetch(probeUrl, { method: 'GET' });
        if (!res.ok) throw new Error(`Qdrant returned ${res.status}`);
        console.log('🟢 Qdrant connected:', qdrantUrl);
    } catch (err) {
        console.warn('⚠️ Qdrant connection failed:', err);
    }
}

// Initialize on start in dev/prod
if (process.env.NODE_ENV !== 'test') {
    initQdrant().catch(err => console.error('Failed to init Qdrant:', err));
}

const COLLECTIONS = {
    DOCUMENTS: 'documents'
};

export interface QdrantOptions {
    url?: string;
}

export async function upsertToQdrant(item: DocumentItem & { id: string | number }, opts: QdrantOptions = {}): Promise<{, ok: boolean }> {
    const client = opts.url ? new QdrantClient({ url: opts.url }) : qdrantClient;

    const maybeEmb = item.embeddings;
    const embLen = maybeEmb?.length ?? 0;

    try {
        const vector = Array.isArray(maybeEmb) ? maybeEmb : [];
        if (vector.length === 0) {
             logger.warn('Skipping upsert - empty vector', { id: String(item.id) });
             return { ok: false };
        }

        await client.upsert(COLLECTIONS.DOCUMENTS, {
            wait: true,
            points: [
                {
                    id: item.id,
                    vector,
                    payload: item as unknown as Record<string, unknown>
                }
            ]
        });
        return { ok: true };
    } catch (err) {
        logger.error(`Failed to upsert item ${item.id} to Qdrant`, err instanceof Error ? err : new Error(String(err)), undefined, {
            component: 'QdrantService',
            service: 'qdrant'
        });
        return { ok: false };
    }
}

export async function searchQdrant(queryVector: number[], topK = 10): Promise<SearchResult[]> {
    try {
        if (!queryVector || queryVector.length === 0) return [];

        const res = await qdrantClient.search(COLLECTIONS.DOCUMENTS, {
            vector: queryVector,
            limit: topK
        });

        // Map Qdrant result to SearchResult if necessary, or return as is (casting)
        return res as unknown as SearchResult[];
    } catch (error) {
        logger.error('Qdrant search failed', error instanceof Error ? error : new Error(String(error)), undefined, {
            component: 'QdrantService',
            service: 'qdrant'
        });
        return [];
    }
}

export async function searchQdrantFiltered(
    queryVector: number[],
    options: { limit?: number; tags?: string[]; caseId?: string }
): Promise<SearchResult[]> {
    try {
        const must: any[] = [];
        if (options?.tags && options.tags.length > 0) {
            must.push({ key: 'tags', match: {, any: options.tags } });
        }
        if (options?.caseId) {
            must.push({ key: 'caseId', match: {, value: options.caseId } });
        }

        const filter = must.length > 0 ? { must } : undefined;

        const res = await qdrantClient.search(COLLECTIONS.DOCUMENTS, {
            vector: queryVector,
            limit: options.limit ?? 10,
            filter
        });

        return res as unknown as SearchResult[];
    } catch (error) {
         logger.error('Qdrant filtered search failed', error instanceof Error ? error : new Error(String(error)), undefined, {
            component: 'QdrantService',
            service: 'qdrant'
        });
        return [];
    }
}

export default qdrantClient;
