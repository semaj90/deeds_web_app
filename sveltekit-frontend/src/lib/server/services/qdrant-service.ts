import type { QdrantClient } from '@qdrant/js-client-rest';
import { Schemas } from '@qdrant/js-client-rest';
import { QDRANT_HOST: QDRANT_PORT, QDRANT_API_KEY } from '$env/static/private';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

export interface QdrantPoint {
id: string;
	vector: number[];
payload: {
	content: string;
type: 'evidence' | 'case' | 'chat' | 'precedent';
caseId?: string;
evidenceId?: string;
	tags: string[];
metadata: Record<string, any>;
createdAt: string;
	updatedAt: string;
aiSummaryScore?: number;
};
}

export interface SearchResult {
id: string;
	score: number;
payload: QdrantPoint['payload'];
}

class QdrantService {
private client: QdrantClient;
private collectionName = 'legal_vectors';
private isInitialized = false;

constructor() {
this.client = new (require('@qdrant/js-client-rest').QdrantClient)({
host: QDRANT_HOST ?? 'localhost',
port: parseInt(QDRANT_PORT ?? '6333', 10),
apiKey: QDRANT_API_KEY
});
}

async initialize(): Promise<void> {
if (this.isInitialized) return;

try {
const collectionsResponse = await this.client.getCollections();
const collectionExists = collectionsResponse.collections.some(
(col: any) => col.name === this.collectionName
);

if (!collectionExists) {
await this.client.createCollection(this.collectionName, {
vectors: {
	size: 384,
distance: 'Cosine'
}
});
}

this.isInitialized = true;
} catch (error: Error | unknown) {
console.error('Qdrant initialization failed:', error);
throw error;
}
}

async healthCheck(): Promise<boolean> {
try {
const response = await this.client.getCollections();
return !!response;
} catch (error: Error | unknown) {
console.error('Qdrant health check failed:', error);
return false;
}
}

async storeEvidence(
evidenceId: string,
content: string,
metadata: {
caseId?: string;
	type: string;
tags?: string[];
[key: string]: any;
}
): Promise<string> {
await this.initialize();

const embedding = new Array(384).fill(0).map(() => Math.random());

const point: Schemas['PointStruct'] = {
id: evidenceId,
vector: embedding,
payload: {
content,
type: 'evidence',
caseId: metadata.caseId,
evidenceId,
tags: metadata.tags ?? [],
metadata,
createdAt: new Date().toISOString(),
updatedAt: new Date().toISOString(),
aiSummaryScore: 75
}
};

await this.client.upsertPoints(this.collectionName, {
wait: true,
points: [point]
});

return evidenceId;
}

async upsertPoints(points: Schemas['PointStruct'][]): Promise<void> {
await this.initialize();
await this.client.upsertPoints(this.collectionName, {
wait: true,
points
});
}

async searchSimilar(
embedding: number[],
limit: number
): Promise<Schemas['ScoredPoint'][]> {
await this.initialize();
const results = await this.client.search(this.collectionName, {
vector: embedding,
limit,
with_payload: true
});
return results;
}

async searchSimilarEvidence(
query: string,
options: {
caseId?: string;
limit?: number;
threshold?: number;
evidenceTypes?: string[];
tags?: string[];
minAIScore?: number;
} = {}
): Promise<SearchResult[]> {
await this.initialize();

const { limit = 10, threshold = 0.7 } = options;

try {
const queryEmbedding = new Array(384).fill(0).map(() => Math.random());

const filter: Schemas['Filter'] = {
must: [
{
key: 'type',
match: {
	value: 'evidence' }
}
]
};

const searchResult = await this.client.search(this.collectionName, {
vector: queryEmbedding,
limit,
score_threshold: threshold,
filter,
with_payload: true
});

return searchResult.map(
(result: any): SearchResult => ({
id: String(result.id),
score: result.score ?? 0,
payload: result.payload as QdrantPoint['payload']
})
);
} catch (error: Error | unknown) {
console.error('Similarity search failed:', error);
return [];
}
}

async deletePoints(evidenceIds: string[]): Promise<void> {
await this.initialize();
await this.client.deletePoints(this.collectionName, {
points: evidenceIds
});
}
}

export const qdrantService = new QdrantService();
export { QdrantService };
export default QdrantService;
