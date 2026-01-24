import { sql } from 'drizzle-orm';
import Redis from 'ioredis';
import { db } from '../db/index.js';
import { cases } from '../db/schema-postgres-enhanced.js';
import type { QdrantApiWrapper } from './qdrant-api-wrapper.js';
import { createQdrantWrapper } from './qdrant-api-wrapper.js';

interface DocumentMetadata {
	[key: string]: any;
}

interface HybridSearchOptions {
	limit?: number;
	threshold?: number;
}

interface KeywordSearchResult {
	id: string;
	score: number;
	metadata: { type: string; title: string };
	content: string;
}

interface QdrantPayload {
	content: string;
	[key: string]: unknown;
}

interface QdrantVectorSearchResult {
	id: string | number;
	score: number;
	payload?: QdrantPayload;
	version?: number;
}

interface CombinedSearchResult {
	id: string;
	score: number;
	metadata: { type: string; title: string };
	content: string;
}

export class EnhancedVectorService {
	private qdrant!: QdrantApiWrapper;
	private redis!: Redis;
	private collectionName = 'legal_documents';

	constructor() {
		this.qdrant = createQdrantWrapper({
			url: import.meta.env?.QDRANT_URL ?? 'http://localhost:6333'
		});

		const redisUrl = (import.meta.env.REDIS_URL as string) ?? 'redis://localhost:6379/0';
		this.redis = new Redis(redisUrl);
	}

	async initializeCollection() {
		const collections = await this.qdrant.getCollections();
		const exists = collections.collections.some((c: { name?: string }) => c.name === this.collectionName);

		if (!exists) {
			await this.qdrant.createCollection(this.collectionName, {
				vectors: { size: 768, distance: 'Cosine' },
				optimizers_config: { default_segment_number: 2 }
			});
			try {
				// await this.qdrant.createPayloadIndex(this.collectionName, "type")
				console.log('Payload index creation skipped - method not available in current client');
			} catch (error: unknown) {
				console.log('Index creation skipped due to API compatibility');
			}
		}
	}

	async generateEmbedding(text: string): Promise<number[]> {
		const cacheKey = `embed:${Buffer.from(text).toString('base64').slice(0, 32)}`;
		const cached = await this.redis.get(cacheKey);

		if (cached) return JSON.parse(cached) as number[];

		let embedding: number[] | undefined;
		const ollamaUrl = 'http://localhost:11434/api/embeddings';
		const prompt = text; // Simplify for now

		try {
			const response = await fetch(ollamaUrl, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ model: 'embedding-gemma:latest', prompt })
			});

			if (!response.ok) {
				throw new Error(`Ollama API error with embedding-gemma:latest: ${response.statusText}`);
			}
			const result = await response.json();
			embedding = result.embedding;
		} catch (error: unknown) {
			console.warn(
				`Failed to generate embedding with embedding-gemma:latest, falling back to nomic-embed-text. Error: ${error}`
			);
			const fallbackResponse = await fetch(ollamaUrl, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ model: 'nomic-embed-text', prompt })
			});

			if (!fallbackResponse.ok) {
				throw new Error(`Ollama API error with nomic-embed-text fallback: ${fallbackResponse.statusText}`);
			}
			const fallbackResult = await fallbackResponse.json();
			embedding = fallbackResult.embedding;
		}

		if (!embedding) {
			throw new Error('Failed to generate embedding with both primary and fallback models.');
		}

		await this.redis.set(cacheKey, JSON.stringify(embedding), 'EX', 86400);
		return embedding;
	}

	async storeDocument(id: string, content: string, metadata: DocumentMetadata = {}): Promise<void> {
		const embedding = await this.generateEmbedding(content);
		await this.qdrant.upsert(this.collectionName, {
			wait: true,
			points: [
				{
					id,
					vector: embedding,
					payload: { content, ...metadata }
				}
			]
		});
	}

	async hybridSearch(query: string, options: HybridSearchOptions = {}): Promise<CombinedSearchResult[]> {
		const { limit = 10, threshold = 0.7 } = options;
		const queryEmbedding = await this.generateEmbedding(query);

		const vectorResults: QdrantVectorSearchResult[] = await this.qdrant.search(this.collectionName, {
			vector: queryEmbedding,
			limit,
			score_threshold: threshold
		});

		const keywordResults: KeywordSearchResult[] = await this.keywordSearch(query, limit);

		return this.combineResults(vectorResults, keywordResults);
	}

	private async keywordSearch(query: string, limit: number): Promise<KeywordSearchResult[]> {
		const caseResults = await db
			.select()
			.from(cases)
			.where(sql`${cases.title} ILIKE ${'%' + query + '%'} OR ${cases.description} ILIKE ${'%' + query + '%'}`)
			.limit(limit);

		return caseResults.map((c) => {
			const rawId = c.id;
			const id = rawId !== undefined && rawId !== null ? String(rawId) : '';
			const title = c.title ?? '';
			const description = c.description ?? '';

			return {
				id: id,
				score: 0.8,
				metadata: { type: 'case', title: String(title) },
				content: `${String(title)} ${String(description)}`.trim()
			} as KeywordSearchResult;
		});
	}

	private combineResults(
		vectorResults: QdrantVectorSearchResult[],
		keywordResults: KeywordSearchResult[]
	): CombinedSearchResult[] {
		const combined = new Map<string, CombinedSearchResult>();

		vectorResults.forEach(r => {
			const payload = r?.payload || {};
			const title = typeof payload.title === 'string' ? payload.title : 'Untitled Document';
			const type = typeof payload.type === 'string' ? payload.type : 'document';
			const content = typeof payload.content === 'string' ? payload.content : String(payload.content ?? '');

			combined.set(String(r.id), {
				id: String(r.id),
				score: (typeof r.score === 'number' ? r.score : 0) * 0.7,
				metadata: { type, title },
				content
			});
		});

		keywordResults.forEach(r => {
			const id = String(r.id);
			const existing = combined.get(id);
			if (existing) {
				existing.score += r.score * 0.3;
			} else {
				combined.set(id, { ...r, score: r.score * 0.3 });
			}
		});

		return Array.from(combined.values()).sort((a, b) => b.score - a.score);
	}

	async healthCheck() {
		try {
			await this.qdrant.getCollections();
			if (this.redis) {
				await this.redis.ping();
			}
			return { qdrant: true, redis: true };
		} catch (error: unknown) {
			const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
			return { qdrant: false, redis: false, error: errorMessage };
		}
	}
}

export const vectorService = new EnhancedVectorService();







