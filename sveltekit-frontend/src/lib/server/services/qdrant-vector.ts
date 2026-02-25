import { QdrantClient } from '@qdrant/js-client-rest';
import type { IQdrantVectorService } from '$lib/types/external-services';
import { env } from '$env/dynamic/private';

const client = new QdrantClient({ url: env?.QDRANT_URL ?? 'http://localhost:6333' });
const COLLECTION = env?.QDRANT_COLLECTION ?? 'legal-documents';

export const QdrantVectorService: IQdrantVectorService = {
    async upsertVector(id: string, vector: number[], metadata: Record<string, unknown>) {
        await client.upsert(COLLECTION, {
            points: [{ id, vector, payload: metadata }]
        });
    },
	async searchVector(query: number[], topK: number) {
        const res = await client.search(COLLECTION, {
            vector: query,
            limit: topK
        });
        return res;
    }
};
