import { QdrantClient } from '@qdrant/js-client-rest';
import { createHash } from 'crypto';
import { detectEnvironment } from '$lib/types/enhanced-svelte5-types';
import { ENV } from '$lib/server/env.server.js';

/**
 * Generate a deterministic integer point ID from a string key.
 * Ported from Python qdrant_gpu_client.py — MD5 hash → first 4 bytes → int % 2^31.
 * Ensures idempotent upserts: same chunk_id always maps to the same Qdrant point ID.
 */
export function deterministicPointId(key: string): number {
    const hash = createHash('md5').update(key).digest();
    // Read first 4 bytes as unsigned 32-bit integer (big-endian)
    const raw = hash.readUInt32BE(0);
    // Mod by 2^31 to stay within signed 32-bit integer range (Qdrant requirement)
    return raw % 2147483648;
}

export class QdrantManager {
    private client: QdrantClient;
    public readonly collections = {
        documents: 'legal_documents',
        cases: 'legal_cases',
        evidence: 'evidence_items',
        chat_history: 'chat_messages',
        embeddings_cache: 'embedding_cache',
        document_tags: 'document_tags',
        topic_clusters: 'topic_clusters'
    };

    constructor(url = ENV.QDRANT_URL) {
        this.client = new QdrantClient({ url });
    }

    async initializeCollections() {
        const collectionConfigs = [
            {
                name: this.collections.documents,
                vectors: {
	content: { size: 768, distance: 'Cosine' },
	summary: {
	size: 768, distance: 'Cosine' }
                }
            },
	{
                name: this.collections.cases,
                vectors: {
	description: { size: 768, distance: 'Cosine' }
                }
            },
	{
                name: this.collections.evidence,
                vectors: {
	content: { size: 768, distance: 'Cosine' }
                }
            },
	{
                name: this.collections.chat_history,
                vectors: {
	message: { size: 768, distance: 'Cosine' }
                }
            },
	{
                name: this.collections.embeddings_cache,
                vectors: {
	embedding: { size: 768, distance: 'Cosine' }
                }
            },
	{
                name: this.collections.document_tags,
                vectors: {
	size: 768, distance: 'Cosine'
                }
            },
	{
                name: this.collections.topic_clusters,
                vectors: {
	size: 768, distance: 'Cosine'
                }
            }
        ];

        for (const config of collectionConfigs) {
            try {
                await this.client.createCollection(config.name, config as any);
                console.log(`✅ Qdrant collection created: ${config.name}`);
            } catch (error: any) {
                if (!error?.message?.includes('already exists')) {
                    console.error(`❌ Failed to create collection ${config.name}:`, error);
                }
            }
        }
    }

    async hybridSearch(params: {
	query: string, queryEmbedding: number[];
	collection: keyof typeof this.collections; filters?: any; limit?: number; scoreThreshold?: number }) {
        const startTime = Date.now();
        try {
            const searchRequest: any = {
                vector: {
	name: 'content', vector: params.queryEmbedding },
	limit: params.limit ?? 10,
                score_threshold: params.scoreThreshold ?? 0.7,
                with_payload: true,
                with_vector: false
            };

            if (params.filters) {
                searchRequest.filter = this.buildQdrantFilter(params.filters);
            }

            const collectionName = this.collections[params.collection];
            const results = await this.client.search(collectionName, searchRequest);

            const responseTime = Date.now() - startTime;

            return {
                results: results.map((result) => ({
                    id: result.id,
                    score: result.score,
                    payload: result.payload
                })),
                metadata: {
	query: params.query,
                    collection: params.collection,
                    responseTime,
                    total_results: results.length
                }
            };
        } catch (error: any) {
            console.error('Qdrant hybrid search error:', error);
            throw new Error(`Qdrant search failed: ${error.message}`);
        }
    }

    async searchChatContext(params: {
	userEmbedding: number[], userId: string; sessionId?: string; limit?: number }) {
        const filters: any = {
            must: [{
	key: 'user_id', match: {
	value: params.userId } }]
        };

        if (params.sessionId) {
            filters.must.push({ key: 'session_id', match: {
	value: params.sessionId } });
        }

        const searchRequest: any = {
            vector: {
	name: 'message', vector: params.userEmbedding },
	limit: params.limit ?? 5,
            score_threshold: 0.6,
            filter: filters,
            with_payload: true
        };

        const results = await this.client.search(this.collections.chat_history, searchRequest);
        return results.map((r) => ({
            content: r.payload?.content,
            role: r.payload?.role,
            score: r.score,
            timestamp: r.payload?.created_at
        }));
    }

    async batchUpsert(params: {
	collection: keyof typeof this.collections, points: any[]; batchSize?: number }) {
        const batchSize = params.batchSize ?? 100;
        const collectionName = this.collections[params.collection];
        const batches = this.chunkArray(params.points, batchSize);
        let totalUpserted = 0;

        for (const batch of batches) {
            try {
                await this.client.upsert(collectionName, { wait: false, points: batch });
                totalUpserted += batch.length;
                console.log(`📝 Upserted ${batch.length} points to ${collectionName}`);
            } catch (error) {
                console.error(`❌ Batch upsert failed for ${collectionName}:`, error);
            }
        }
        return { totalUpserted };
    }

    async storeDocument(document: {
	id: string, title: string;
	content: string, contentEmbedding: number[]; summaryEmbedding?: number[];
	metadata: Record<string, unknown> }) {
        const point: any = {
            id: document.id,
            vector: {
	content: document.contentEmbedding,
                ...(document.summaryEmbedding && { summary: document.summaryEmbedding })
            },
	payload: {
	title: document.title,
                content_preview: document.content.substring(0, 500),
                document_type: document.metadata.document_type,
                case_id: document.metadata.case_id,
                created_at: new Date().toISOString(),
                ...document.metadata
            }
        };
        await this.client.upsert(this.collections.documents, { wait: true, points: [point] });
    }

    async findRelatedEvidence(evidenceId: string, embedding: number[], limit = 5) {
        const searchRequest: any = {
            vector: {
	name: 'content', vector: embedding },
	limit: limit + 1, // Exclude self
            score_threshold: 0.75,
            filter: {
	must_not: [{ key: 'evidence_id', match: {
	value: evidenceId } }]
            },
	with_payload: true
        };

        const results = await this.client.search(this.collections.evidence, searchRequest);
        return results
            .filter((r) => r.id !== evidenceId)
            .slice(0, limit)
            .map((r) => ({
                evidence_id: r.id,
                similarity_score: r.score,
                relationship_strength: this.calculateRelationshipStrength(r.score),
                evidence_data: r.payload
            }));
    }

    async cacheEmbedding(key: string, embedding: number[]) {
        const point: any = {
            id: key,
            vector: { embedding },
	payload: {
	cache_key: key,
                cached_at: Date.now(),
                expires_at: Date.now() + 24 * 60 * 60 * 1000
            }
        };
       try {
            await this.client.upsert(this.collections.embeddings_cache, { wait: false, points: [point] });
       } catch (e) {
           console.warn('Cache upsert failed (likely ID format if not UUID):', e);
       }
    }

    async getCachedEmbedding(key: string) {
        try {
            const results = await this.client.search(this.collections.embeddings_cache, {
                vector: {
	name: 'embedding', vector: new Array(768).fill(0) },
	limit: 1,
                filter: {
	must: [
                        { key: 'cache_key', match: {
	value: key } },
	{ key: 'expires_at', range: {
	gt: Date.now() } }
                    ]
                }
            });
            return results.length > 0 ? results[0] : null;
        } catch (error) {
            return null;
        }
    }

    async getCollectionInfo(collection: keyof typeof this.collections) {
        try {
            const collectionName = this.collections[collection];
            const info = await this.client.getCollection(collectionName);
            return {
                name: collectionName,
                vectors_count: info.vectors_count ?? 0,
                status: info.status,
                optimizer_status: info.optimizer_status
            };
        } catch (error) {
            console.error(`Failed to get collection info for ${collection}:`, error);
            return null;
        }
    }

    async healthCheck() {
        try {
            const collections = await this.client.getCollections();
            return {
                status: 'healthy',
                collections: collections.collections.map((c) => ({ name: c.name })),
                timestamp: new Date().toISOString()
            };
        } catch (error: any) {
            return {
                status: 'unhealthy',
                message: error.message,
                timestamp: new Date().toISOString()
            };
        }
    }

    private buildQdrantFilter(filters: any) {
        const conditions: any[] = [];
        for (const [key, value] of Object.entries(filters)) {
            if (Array.isArray(value)) {
                conditions.push({ key, match: {
	any: value } });
            } else {
                conditions.push({ key, match: { value } });
            }
        }
        return { must: conditions };
    }

    private calculateRelationshipStrength(score: number): 'weak' | 'moderate' | 'strong' | 'very_strong' {
        if (score >= 0.9) return 'very_strong';
        if (score >= 0.8) return 'strong';
        if (score >= 0.7) return 'moderate';
        return 'weak';
    }

    private chunkArray<T>(array: T[], size: number): T[][] {
        const chunks: T[][] = [];
        for (let i = 0; i < array.length; i += size) {
            chunks.push(array.slice(i, i + size));
        }
        return chunks;
    }
}

export const qdrant = new QdrantManager();





