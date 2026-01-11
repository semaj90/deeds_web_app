/**
 * Qdrant Vector Store Integration
 * Provides:
 * - Contextual embedding storage and retrieval
 * - Similarity search for conversation history
 * - Entity clustering and pattern detection
 * - Integration with PostgreSQL for metadata
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import type { LegalEntity } from '$lib/types/sharedTypes';
import * as crypto from 'crypto';

// Reusing types from previous context where appropriate
type QdrantCollectionsResponse = { collections?: Array<{ name: string }> };

type QdrantFilterClause = {
	key: string;
	match?: { value: string | number };
	range?: { gte?: number; lte?: number };
};

type QdrantFilter = { must?: QdrantFilterClause[] } | undefined;

interface QdrantSearchHit<T> {
	id?: string | number;
	score: number;
	payload?: T;
}

interface ConversationPayload {
	sessionId?: string;
	turnIndex?: number;
	userMessage?: string;
	agentResponse?: string;
	intent?: string;
	hmmState?: number;
	confidence?: number;
}

interface EntityPayload {
	sessionId?: string;
	entityType?: string;
	entityValue?: string;
	confidence?: number;
}

interface SummaryPayload {
	sessionId?: string;
	summary?: string;
	turnCount?: number;
	currentState?: number;
	confidence?: number;
}

// Environment variables
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const QDRANT_API_KEY = process.env.QDRANT_API_KEY;

// Collection names
const COLLECTIONS = {
	CONVERSATIONS: 'legal_conversations',
	ENTITIES: 'legal_entities',
	SUMMARIES: 'conversation_summaries'
} as const;

// Embedding dimensions (embeddinggemma:latest)
const EMBEDDING_DIM = 768;

/** Qdrant Vector Store Client */
export class QdrantVectorStore {
	private client: QdrantClient;
	private initialized = false;

	constructor() {
		this.client = new QdrantClient({
			url: QDRANT_URL,
			apiKey: QDRANT_API_KEY
		});
	}

	/** Initialize Qdrant collections */
	async initialize(): Promise<void> {
		if (this.initialized) return;
		try {
			await this.ensureCollection(COLLECTIONS.CONVERSATIONS, EMBEDDING_DIM);
			await this.ensureCollection(COLLECTIONS.ENTITIES, EMBEDDING_DIM);
			await this.ensureCollection(COLLECTIONS.SUMMARIES, EMBEDDING_DIM);
			this.initialized = true;
			console.log('✓ Qdrant vector store initialized');
		} catch (error) {
			console.error('✘ Failed to initialize Qdrant:', error);
			throw error;
		}
	}

	/** Ensure collection exists, create if not */
	private async ensureCollection(collectionName: string, size: number): Promise<void> {
		try {
			const collections =
				(await this.client.getCollections()) as unknown as QdrantCollectionsResponse;
			const exists = (collections.collections ?? []).some((c) => c.name === collectionName);

			if (!exists) {
				await this.client.createCollection(collectionName, {
					vectors: {
						size,
						distance: 'Cosine'
					},
					optimizers_config: { default_segment_number: 2 },
					replication_factor: 1
				});
				console.log(`✓ Created Qdrant collection: ${collectionName}`);
			}
		} catch (error) {
			console.error(`✘ Error creating collection ${collectionName}:`, error);
			throw error;
		}
	}

	/** Store conversation turn with embedding */
	async storeConversationTurn(
		turnIndex: number,
		userMessage: string,
		agentResponse: string,
		metadata?: { intent?: string; hmmState?: number; confidence?: number; entities?: LegalEntity[] }
	): Promise<string> {
		await this.ensureInitialized();

		const payload = {
			sessionId: `session-${Date.now()}`,
			turnIndex,
			userMessage,
			agentResponse,
			intent: metadata?.intent,
			hmmState: metadata?.hmmState,
			confidence: metadata?.confidence,
			entityCount: metadata?.entities?.length ?? 0,
			timestamp: Date.now()
		};

		const pointId = crypto.randomUUID();
		const embedding = new Array(EMBEDDING_DIM).fill(0); // Placeholder

		await this.client.upsert(COLLECTIONS.CONVERSATIONS, {
			wait: true,
			points: [{ id: pointId, vector: embedding, payload }]
		});

		return pointId;
	}

	/** Store entity with embedding */
	async storeEntity(
		sessionId: string,
		entity: LegalEntity,
		embedding: number[]
	): Promise<string> {
		await this.ensureInitialized();

		const pointId = crypto
			.createHash('sha256')
			.update(`${sessionId}-${entity.type}-${entity.value}`)
			.digest('hex')
			.substring(0, 32);

		const payload: Record<string, unknown> = {
			sessionId,
			entityType: entity.type,
			entityValue: entity.value,
			confidence: entity.confidence,
			timestamp: Date.now()
		};

		if (entity.span?.start !== undefined) payload.startPos = entity.span.start;
		if (entity.span?.end !== undefined) payload.endPos = entity.span.end;

		await this.client.upsert(COLLECTIONS.ENTITIES, {
			wait: true,
			points: [{ id: pointId, vector: embedding, payload }]
		});

		return pointId;
	}

	/** Store conversation summary with embedding */
	async storeSummary(
		sessionId: string,
		summary: string,
		embedding: number[],
		metadata?: { turnCount?: number; currentState?: number; confidence?: number }
	): Promise<string> {
		await this.ensureInitialized();

		const pointId = crypto
			.createHash('sha256')
			.update(`summary-${sessionId}-${Date.now()}`)
			.digest('hex')
			.substring(0, 32);

		const payload = {
			sessionId,
			summary: summary.substring(0, 2000),
			turnCount: metadata?.turnCount ?? null,
			currentState: metadata?.currentState ?? null,
			confidence: metadata?.confidence ?? null,
			timestamp: Date.now()
		};

		await this.client.upsert(COLLECTIONS.SUMMARIES, {
			wait: true,
			points: [{ id: pointId, vector: embedding, payload }]
		});

		return pointId;
	}

	/** Search similar conversations */
	async searchSimilarConversations(
		queryEmbedding: number[],
		limit = 10,
		filter?: { sessionId?: string; intent?: string; minConfidence?: number }
	): Promise<
		Array<{
			score: number;
			sessionId?: string;
			turnIndex?: number;
			userMessage?: string;
			agentResponse?: string;
			intent?: string;
			hmmState?: number;
		}>
	> {
		await this.ensureInitialized();

		const must: QdrantFilterClause[] = [];
		if (filter?.sessionId) must.push({ key: 'sessionId', match: { value: filter.sessionId } });
		if (filter?.intent) must.push({ key: 'intent', match: { value: filter.intent } });
		if (filter?.minConfidence !== undefined)
			must.push({ key: 'confidence', range: { gte: filter.minConfidence } });

		const qdrantFilter: QdrantFilter = must.length > 0 ? { must } : undefined;

		const searchResult = (await this.client.search(COLLECTIONS.CONVERSATIONS, {
			vector: queryEmbedding,
			limit,
			with_payload: true,
			filter: qdrantFilter
		})) as unknown as QdrantSearchHit<ConversationPayload>[];

		return searchResult.map((hit) => {
			const p = hit.payload || {};
			return {
				score: hit.score,
				sessionId: p.sessionId,
				turnIndex: p.turnIndex,
				userMessage: p.userMessage,
				agentResponse: p.agentResponse,
				intent: p.intent,
				hmmState: p.hmmState
			};
		});
	}

	/** Search similar entities */
	async searchSimilarEntities(
		queryEmbedding: number[],
		entityType?: string,
		limit = 10
	): Promise<
		Array<{
			score: number;
			sessionId?: string;
			entityType?: string;
			entityValue?: string;
			confidence?: number;
		}>
	> {
		await this.ensureInitialized();
		const filter = entityType
			? { must: [{ key: 'entityType', match: { value: entityType } }] }
			: undefined;

		const searchResult = (await this.client.search(COLLECTIONS.ENTITIES, {
			vector: queryEmbedding,
			limit,
			with_payload: true,
			filter
		})) as unknown as QdrantSearchHit<EntityPayload>[];

		return searchResult.map((hit) => {
			const p = hit.payload || {};
			return {
				score: hit.score,
				sessionId: p.sessionId,
				entityType: p.entityType,
				entityValue: p.entityValue,
				confidence: p.confidence
			};
		});
	}

	/** Find similar conversation summaries */
	async findSimilarSummaries(
		queryEmbedding: number[],
		limit = 5
	): Promise<
		Array<{
			score: number;
			sessionId?: string;
			summary?: string;
			turnCount?: number;
			currentState?: number;
		}>
	> {
		await this.ensureInitialized();

		const searchResult = (await this.client.search(COLLECTIONS.SUMMARIES, {
			vector: queryEmbedding,
			limit,
			with_payload: true
		})) as unknown as QdrantSearchHit<SummaryPayload>[];

		return searchResult.map((hit) => {
			const p = hit.payload || {};
			return {
				score: hit.score,
				sessionId: p.sessionId,
				summary: p.summary,
				turnCount: p.turnCount,
				currentState: p.currentState
			};
		});
	}

	/** Simple cluster analysis for entity types (lightweight) */
	async getEntityClusters(entityType: string, minClusterSize: number = 3) {
		await this.ensureInitialized();

		const scrollResult = (await this.client.scroll(COLLECTIONS.ENTITIES, {
			filter: { must: [{ key: 'entityType', match: { value: entityType } }] },
			limit: 1000,
			with_payload: true
		})) as { points: { payload?: EntityPayload }[] };

		const counts = new Map<string, { count: number; confidence?: number }>();

		for (const p of scrollResult.points) {
			const val = p.payload?.entityValue;
			if (!val) continue;

			const existing = counts.get(val) ?? { count: 0, confidence: undefined };
			existing.count += 1;
			if (p.payload?.confidence !== undefined) existing.confidence = p.payload.confidence;
			counts.set(val, existing);
		}

		const clusters: Array<{ centroid: string;
			members: Array<{ entityValue: string; confidence?: number }>;
			size: number;
		}> = [];

		for (const [entityValue, info] of counts.entries()) {
			if (info.count >= minClusterSize) {
				clusters.push({
					centroid: entityValue,
					members: [{ entityValue, confidence: info.confidence }],
					size: info.count
				});
			}
		}

		return clusters.sort((a, b) => b.size - a.size);
	}

	/** Delete conversation data across collections */
	async deleteConversationData(sessionId: string): Promise<void> {
		await this.ensureInitialized();

		const filter = { must: [{ key: 'sessionId', match: { value: sessionId } }] };

		await Promise.all([
			this.client.delete(COLLECTIONS.CONVERSATIONS, { filter }),
			this.client.delete(COLLECTIONS.ENTITIES, { filter }),
			this.client.delete(COLLECTIONS.SUMMARIES, { filter })
		]);
	}

	/** Ensure store is initialized */
	private async ensureInitialized(): Promise<void> {
		if (!this.initialized) await this.initialize();
	}
}

// Export singleton instance
export const qdrantVectorStore = new QdrantVectorStore();



