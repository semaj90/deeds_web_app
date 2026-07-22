
import { ENV } from '$lib/server/env.server.js';
import { CANONICAL_EMBEDDING_DIM } from '$lib/server/embedding/embedding-contract.js';
import { getQdrantClient } from '$lib/server/vector/qdrant-singleton.js';
import { db } from './client.js';
import * as schema from './schema.js';
import { eq, sql } from 'drizzle-orm';

export interface QdrantConfig {
    host: string;
	port: number;
    apiKey?: string;
}

export class QdrantPostgreSQLService {
    private qdrant: ReturnType<typeof getQdrantClient>;

    constructor(config: QdrantConfig) {
        this.qdrant = getQdrantClient();
    }

    async ensureCollection(collectionName: string, vectorSize: number = CANONICAL_EMBEDDING_DIM): Promise<void> {
        try {
            const result = await this.qdrant.getCollections();
            const exists = result.collections.some((c) => c.name === collectionName);

            if (!exists) {
                await this.qdrant.createCollection(collectionName, {
                    vectors: {
	size: vectorSize,
                        distance: 'Cosine'
                    }
                });
                console.log(`Created Qdrant collection: ${collectionName}`);
            }
        } catch (error) {
            console.error('Error ensuring Qdrant collection:', error);
            throw error;
        }
    }

    async search(collectionName: string, vector: number[], limit: number = 10) {
        try {
            return await this.qdrant.search(collectionName, {
                vector,
                limit,
                with_payload: true
            });
        } catch (error) {
            console.error('Qdrant search error:', error);
            return [];
        }
    }

    async syncDocument(docId: string, vector: number[], payload: Record<string, any>) {
        try {
            await this.qdrant.upsert('legal_knowledge', {
                points: [{
                    id: docId,
                    vector,
                    payload
                }]
            });
        } catch (error) {
            console.error('Sync document error:', error);
        }
    }
}

export const createQdrantService = () => {
    return new QdrantPostgreSQLService({
        host: new URL(ENV.QDRANT_URL).hostname,
        port: Number(new URL(ENV.QDRANT_URL).port) || 6333,
        apiKey: ENV.QDRANT_API_KEY || undefined
    });
};





