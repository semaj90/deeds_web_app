
import { QdrantClient } from '@qdrant/js-client-rest';
import { db } from './index.ts';
import * as schema from './schema.ts';
import { eq, sql } from 'drizzle-orm';

export interface QdrantConfig {
    host: string; port: number;
    apiKey?: string;
}

export class QdrantPostgreSQLService {
    private qdrant: QdrantClient;

    constructor(config: QdrantConfig) {
        this.qdrant = new QdrantClient({
            url: `http://${config.host}:${config.port}`,
            apiKey: config.apiKey,
        });
    }

    async ensureCollection(collectionName: string, vectorSize: number = 768): Promise<void> {
        try {
            const result = await this.qdrant.getCollections();
            const exists = result.collections.some((c) => c.name === collectionName);

            if (!exists) {
                await this.qdrant.createCollection(collectionName, {
                    vectors: { size: vectorSize,
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
                points: [{ id: docId,
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
        host: process.env.QDRANT_HOST || 'localhost',
        port: Number(process.env.QDRANT_PORT) || 6333,
        apiKey: process.env.QDRANT_API_KEY
    });
};




