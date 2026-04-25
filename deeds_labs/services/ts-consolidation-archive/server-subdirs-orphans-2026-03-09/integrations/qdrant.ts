/**
 * Qdrant Vector Database Integration - Production-ready Vector Search
 */
import type { IQdrantVectorService, VectorSearchOptions, VectorSearchResult } from '$lib/types/external-services';
import type { Filter, PointStruct, SearchRequest, SearchResponse, UpsertPoints } from '$lib/types/qdrant';

interface QdrantConfig {
    url?: string;
    collectionName?: string;
    vectorSize?: number;
    timeout?: number;
}

export class QdrantVectorService implements IQdrantVectorService {
    private config: Required<QdrantConfig>;

    constructor(config: Partial<QdrantConfig> = {}) {
        this.config = {
            url: config.url || process.env.QDRANT_URL || 'http://localhost:6333',
            collectionName: config.collectionName || 'legal_embeddings',
            vectorSize: config.vectorSize ?? 768,
            timeout: config.timeout ?? 30000
        };
    }

    async initializeCollection(recreate = false): Promise<void> {
        try {
            const exists = await this.collectionExists();
            if (exists && recreate) {
                await this.deleteCollection();
            }
            if (!exists || recreate) {
                await this.createCollection();
            }
        } catch (error) {
            throw new Error(`Failed to initialize Qdrant collection: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    async upsertVector(id: string, vector: Float32Array | number[], metadata?: Record<string, any>): Promise<void> {
        await this.upsertBatch([{ id, vector, metadata }]);
    }

    async upsertBatch(items: Array<{
	id: string, vector: Float32Array | number[]; metadata?: Record<string, any> }>): Promise<void> {
        if (items.length === 0) return;
        const points: PointStruct[] = items.map(item => ({
            id: item.id,
            vector: Array.from(item.vector),
            payload: item.metadata || {}
        }));

        const body: UpsertPoints = { points, wait: true };
        const response = await this.fetchWithTimeout(
            `${this.config.url}/collections/${this.config.collectionName}/points`,
            {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify(body)
            }
        );

        if (!response.ok) {
            throw new Error(`Qdrant upsert failed: ${response.statusText}`);
        }
    }

    async searchVector<TMeta = Record<string, any>>(query: Float32Array | number[], topK: number, options?: VectorSearchOptions): Promise<Array<VectorSearchResult<TMeta>>> {
        const body: SearchRequest = {
            vector: Array.from(query),
            limit: topK,
            with_payload: options?.includePayload ?? true,
            with_vector: false
        };

        if (options?.filter) {
            body.filter = this.buildFilter(options.filter);
        }

        // Use score threshold if defined (defaulting to 0.0 only if implicitly needed, effectively no threshold by default unless specified)
        if (options?.minScore !== undefined) {
             body.score_threshold = options.minScore;
        }

        const response = await this.fetchWithTimeout(
            `${this.config.url}/collections/${this.config.collectionName}/points/search`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify(body)
            }
        );

        if (!response.ok) {
            throw new Error(`Qdrant search failed: ${response.statusText}`);
        }

        const data: SearchResponse = await response.json();
        return data.result.map(hit => ({
            id: String(hit.id),
            score: hit.score,
            metadata: hit.payload as TMeta
        }));
    }

    async deleteByIds(ids: string[]): Promise<void> {
        if (ids.length === 0) return;
        const response = await this.fetchWithTimeout(
            `${this.config.url}/collections/${this.config.collectionName}/points/delete`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
	points: ids, wait: true })
            }
        );

        if (!response.ok) {
            throw new Error(`Qdrant delete failed: ${response.statusText}`);
        }
    }

    async deleteByFilter(filter: Record<string, any>): Promise<void> {
        const response = await this.fetchWithTimeout(
             `${this.config.url}/collections/${this.config.collectionName}/points/delete`,
             {
                 method: 'POST',
                 headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
	filter: this.buildFilter(filter), wait: true })
             }
         );
         if (!response.ok) {
             throw new Error(`Qdrant filter delete failed: ${response.statusText}`);
         }
    }

    async getCollectionInfo(): Promise<any> {
        const response = await this.fetchWithTimeout(
            `${this.config.url}/collections/${this.config.collectionName}`,
            { method: 'GET' }
        );
        if (!response.ok) {
            throw new Error(`Qdrant collection info failed: ${response.statusText}`);
        }
        return await response.json();
    }

    async health(): Promise<{
	status: 'healthy' | 'degraded' | 'unavailable'; collections?: string[] }> {
        try {
            const response = await this.fetchWithTimeout(`${this.config.url}/collections`, { method: 'GET' },
	5000);
            if (!response.ok) {
                return { status: 'unavailable' };
            }
            const data = await response.json();
            const collections = data.result?.collections?.map((c: any) => c.name) ?? [];
            return {
                status: collections.length > 0 ? 'healthy' : 'degraded',
                collections
            };
        } catch {
            return { status: 'unavailable' };
        }
    }

    // Helpers
    private async collectionExists(): Promise<boolean> {
        try {
            const response = await this.fetchWithTimeout(
                `${this.config.url}/collections/${this.config.collectionName}`,
                { method: 'GET' },
	5000
            );
            return response.ok;
        } catch {
            return false;
        }
    }

    private async createCollection(): Promise<void> {
        const response = await this.fetchWithTimeout(
            `${this.config.url}/collections/${this.config.collectionName}`,
            {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify({
	vectors: { size: this.config.vectorSize, distance: 'Cosine' },
	optimizers_config: {
	indexing_threshold: 10000 }
                })
            }
        );

        if (!response.ok) {
            throw new Error(`Failed to create collection: ${response.statusText}`);
        }
    }

    private async deleteCollection(): Promise<void> {
        const response = await this.fetchWithTimeout(
            `${this.config.url}/collections/${this.config.collectionName}`,
            { method: 'DELETE' }
        );
         if (!response.ok) {
            throw new Error(`Failed to delete collection: ${response.statusText}`);
        }
    }

    private buildFilter(metadata: Record<string, any>): Filter {
        // Basic implementation for flat key-value match
        const must: any[] = [];
        for (const [key, value] of Object.entries(metadata)) {
            if (value && typeof value === 'object' && !Array.isArray(value)) {
                // Range query heuristics
                const rangeOps = ['gt', 'gte', 'lt', 'lte'];
                if (rangeOps.some(op => op in value)) {
                     must.push({ key, range: value });
                     continue;
                }
            }
            must.push({ key, match: { value } });
        }
        return { must };
    }

    private async fetchWithTimeout(url: string, options: RequestInit, timeout = this.config.timeout): Promise<Response> {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);
        try {
            const response = await fetch(url, { ...options, signal: controller.signal });
            return response;
        } finally {
            clearTimeout(timeoutId);
        }
    }
}

let qdrantInstance: QdrantVectorService | null = null;
export function getQdrantService(config?: Partial<QdrantConfig>): QdrantVectorService {
    if (!qdrantInstance || config) {
        qdrantInstance = new QdrantVectorService(config);
    }
    return qdrantInstance;
}
