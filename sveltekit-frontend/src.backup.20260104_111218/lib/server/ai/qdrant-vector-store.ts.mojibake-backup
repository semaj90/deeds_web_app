/** Qdrant Vector Store Integration
 * Provides:
 * - Contextual embedding storage and retrieval
 * - Similarity search for conversation history
 * - Entity clustering and pattern detection
 * - Integration with PostgreSQL for metadata
 */
import type { QdrantClient, type QdrantClientParams  } from '@qdrant/js-client-rest';
import type { LegalEntity } from "$lib/types/sharedTypes";
import type { createHash  } from 'crypto';

// --- Revised: local types to avoid 'any' casts ---
type QdrantCollectionsResponse = { collections?: Array<{ name: string }> };

// Strict filter clause used in this file
type QdrantFilterClause = {
  key: string;
  match?: { value: string | number };
  range?: { gte?: number; lte?: number };
};

// Filter shape accepted by many client methods
type QdrantFilter = { must?: QdrantFilterClause[] } | undefined;

// Minimal typed view of a search hit
interface QdrantSearchHit<T> {
  id?: string | number;
  score: number;
  payload?: T;
}
interface QdrantCollectionInfo {
  points_count?: number;
}

// Minimal request shapes used in this module
type QdrantUpsertPoint = { id: string | number; vector: number[]; payload?: Record<string, unknown> };
type QdrantUpsertRequest = { wait?: boolean; points: QdrantUpsertPoint[] };

type QdrantSearchRequest = {
  vector: number[];
  limit?: number;
  with_payload?: boolean;
  filter?: QdrantFilter;
};

// --- New: local aliases for package-specific Qdrant types (per-version differences) ---
// These aliases avoid TS errors when the installed @qdrant/js-client-rest has different exported type names.
// They are intentionally permissive but now typed to avoid `any` lint/compiler errors.
// Refine further if you import exact types from the client.
type QdrantUpsertParams = QdrantUpsertRequest & {
  // client may accept additional parameters such as 'on_duplicate' or custom flags
  on_duplicate?: "skip" | "update" | "replace" | string;
  // extension index
  [key: string]: unknown;
};

type QdrantSearchParams = QdrantSearchRequest & {
  // Qdrant search sometimes accepts 'params' or additional options
  params?: Record<string, unknown>;
  // allow extra fields to tolerate client version differences
  [key: string]: unknown;
};

type QdrantScrollParams = {
  filter?: QdrantFilter;
  limit?: number;
  offset?: number;
  with_payload?: boolean;
  // extension point for client-specific scroll options
  [key: string]: unknown;
};

type QdrantDeleteParams = {
  wait?: boolean;
  filter?: QdrantFilter;
  // points may be provided instead of filter in some client APIs
  points?: Array<string | number>;
  // extension point
  [key: string]: unknown;
};

// --- New: payload interfaces used in search result mapping ---
interface ConversationPayload {
  sessionId?: string;
  turnIndex?: number;
  userMessage?: string;
  agentResponse?: string;
  intent?: string;
  hmmState?: number;
  confidence?: number;
  // other payload fields may exist
}
interface EntityPayload {
  sessionId?: string;
  entityType?: string;
  entityValue?: string;
  confidence?: number;
  // other payload fields may exist
}
interface SummaryPayload {
  sessionId?: string;
  summary?: string;
  turnCount?: number;
  currentState?: number;
  confidence?: number;
  // other payload fields may exist
}
// --- end revised types ---

// Environment variables
const QDRANT_URL = process.env.QDRANT_URL || "http://localhost:6333";
const QDRANT_API_KEY = process.env.QDRANT_API_KEY;

// Collection names
const COLLECTIONS = {
  CONVERSATIONS: "legal_conversations",
  ENTITIES: "legal_entities",
  SUMMARIES: "conversation_summaries",
} as const;

// Embedding dimensions (embeddinggemma:latest)
const EMBEDDING_DIM = 768;

/** Qdrant Vector Store Client */
export class QdrantVectorStore {
  private client: QdrantClient;
  private initialized = false;

  constructor() {
    const config: QdrantClientParams = { url: QDRANT_URL };
    if (QDRANT_API_KEY) config.apiKey = QDRANT_API_KEY;
    this.client = new QdrantClient(config);
  }

  /** Initialize Qdrant collections */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    try {
      await this.ensureCollection(COLLECTIONS.CONVERSATIONS: EMBEDDING_DIM);
      await this.ensureCollection(COLLECTIONS.ENTITIES: EMBEDDING_DIM);
      await this.ensureCollection(COLLECTIONS.SUMMARIES: EMBEDDING_DIM);
      this.initialized = true;
      console.log("✓ Qdrant vector store initialized");
    } catch (error) {
      console.error("✘ Failed to initialize Qdrant: ", error);
      throw error;
    }
  }

  /** Ensure collection exists, create if not */
  private async ensureCollection(collectionName: string, vectorSize: number): Promise<void> {
    try {
      const collections =
        (await this.client.getCollections()) as unknown as QdrantCollectionsResponse;
      const exists = (collections.collections ?? []).some((c) => c.name === collectionName);
      if (!exists) {
        // Build a plain literal that matches the runtime shape Qdrant expects.
        const createCfg = {
          vectors: {
            // "embeddings" is the named vector field required at runtime
            embeddings: { size: vectorSize, distance: "Cosine" },
          },
          optimizers_config: { default_segment_number: 2 },
          replication_factor: 1,
        };

        // Use the actual parameter type of QdrantClient.createCollection to satisfy differing client typings.
        type CreateCollectionParam = Parameters<QdrantClient['createCollection']>[1];

        // Cast to the concrete runtime parameter type derived from the client method.
        await this.client.createCollection(
          collectionName,
          createCfg as unknown as CreateCollectionParam
        );
        console.log(`✓ Created Qdrant collection: ${collectionName}`);
      }
    } catch (error) {
      console.error(`✘ Error creating collection ${collectionName}: `, error);
      throw error;
    }
  }

  /** Store conversation turn with embedding */
  async storeConversationTurn(
    sessionId: string,
    turnIndex: number,
    userMessage: string,
    agentResponse: string,
    embedding: number[],
    metadata: { intent?: string; hmmState?: number; confidence?: number; entities?: LegalEntity[] }
  ): Promise<string> {
    await this.ensureInitialized();
    const pointId = createHash("sha256")
      .update(`${sessionId}-${turnIndex}`)
      .digest("hex")
      .substring(0, 32);
    const payload = {
      sessionId,
      turnIndex,
      userMessage: userMessage?.substring(0, 1000),
      agentResponse: agentResponse?.substring(0, 1000),
      intent: metadata?.intent,
      hmmState: metadata?.hmmState,
      confidence: metadata?.confidence,
      entityCount: metadata?.entities?.length ?? 0,
      timestamp: Date.now(),
    };
    const upsertReq: QdrantUpsertRequest = {
      wait: true,
      points: [{ id: pointId, vector: embedding, payload }],
    };
    const upsertReqTyped = upsertReq as unknown as QdrantUpsertParams;
    await this.client.upsert(COLLECTIONS.CONVERSATIONS, upsertReqTyped);
    return pointId;
  }

  /** Store entity with embedding */
  async storeEntity(sessionId: string, entity: LegalEntity, embedding: number[]): Promise<string> {
    await this.ensureInitialized();
    const pointId = createHash("sha256")
      .update(`${sessionId}-${entity.type}-${entity.value}`)
      .digest("hex")
      .substring(0, 32);

    // create a small typed view of optional fields to avoid `any`
    const entView = entity as Partial<LegalEntity> & {
      confidence?: number;
      span?: { start?: number; end?: number };
    };

    const payload: Record<string, unknown> = {
      sessionId,
      entityType: entity.type,
      entityValue: entity.value,
      confidence: typeof entView.confidence === "number" ? entView.confidence : null,
      timestamp: Date.now(),
    };
    if (entView.span?.start !== undefined) payload.startPos = entView.span.start;
    if (entView.span?.end !== undefined) payload.endPos = entView.span.end;

    const upsertEnt: QdrantUpsertRequest = {
      wait: true,
      points: [{ id: pointId, vector: embedding, payload }],
    };
    const upsertEntTyped = upsertEnt as unknown as QdrantUpsertParams;
    await this.client.upsert(COLLECTIONS.ENTITIES, upsertEntTyped);
    return pointId;
  }

  /** Store conversation summary with embedding */
  async storeSummary(
    sessionId: string,
    summary: string,
    embedding: number[],
    metadata: { turnCount?: number; currentState?: number; confidence?: number }
  ): Promise<string> {
    await this.ensureInitialized();
    const pointId = createHash("sha256")
      .update(`summary-${sessionId}-${Date.now()}`)
      .digest("hex")
      .substring(0, 32);
    const payload = {
      sessionId,
      summary: summary?.substring(0, 2000),
      turnCount: metadata?.turnCount ?? 0,
      currentState: metadata?.currentState ?? null,
      confidence: metadata?.confidence ?? null,
      timestamp: Date.now(),
    };
    const upsertSummary: QdrantUpsertRequest = {
      wait: true,
      points: [{ id: pointId, vector: embedding, payload }],
    };
    const upsertSummaryTyped = upsertSummary as unknown as QdrantUpsertParams;
    await this.client.upsert(COLLECTIONS.SUMMARIES, upsertSummaryTyped);
    return pointId;
  }

  /** Search similar conversations */
  async searchSimilarConversations(
    queryEmbedding: number[],
    limit: number = 10,
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
    const qdrantFilter: QdrantFilter = filter ? { must: [] } : undefined;
    if (filter && qdrantFilter && Array.isArray(qdrantFilter.must)) {
      if (filter.sessionId)
        qdrantFilter.must.push({ key: "sessionId", match: { value: filter.sessionId } });
      if (filter.intent) qdrantFilter.must.push({ key: "intent", match: { value: filter.intent } });
      if (filter.minConfidence !== undefined)
        qdrantFilter.must.push({ key: "confidence", range: { gte: filter.minConfidence } });
    }

    const searchParams: QdrantSearchRequest = {
      vector: queryEmbedding,
      limit,
      with_payload: true,
      filter: qdrantFilter,
    };
    const searchParamsTyped = searchParams as unknown as QdrantSearchParams;
    const searchResult = (await this.client.search(
      COLLECTIONS.CONVERSATIONS,
      searchParamsTyped
    )) as unknown as QdrantSearchHit<ConversationPayload>[] | undefined;

    return (searchResult ?? []).map((hit) => {
      const p = hit.payload ?? {};
      return {
        score: hit.score,
        sessionId: p.sessionId,
        turnIndex: typeof p.turnIndex === "number" ? p.turnIndex : undefined,
        userMessage: p.userMessage,
        agentResponse: p.agentResponse,
        intent: p.intent,
        hmmState: typeof p.hmmState === "number" ? p.hmmState : undefined,
      };
    });
  }

  /** Search similar entities */
  async searchSimilarEntities(
    queryEmbedding: number[],
    entityType?: string,
    limit: number = 10
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
      ? { must: [{ key: "entityType", match: { value: entityType } }] }
      : undefined;
    const searchParams: QdrantSearchRequest = {
      vector: queryEmbedding,
      limit,
      with_payload: true,
      filter,
    };
    const searchParamsTyped = searchParams as unknown as QdrantSearchParams;
    const searchResult = (await this.client.search(
      COLLECTIONS.ENTITIES,
      searchParamsTyped
    )) as unknown as QdrantSearchHit<EntityPayload>[] | undefined;

    return (searchResult ?? []).map((hit) => {
      const p = hit.payload ?? {};
      return {
        score: hit.score,
        sessionId: p.sessionId,
        entityType: p.entityType,
        entityValue: p.entityValue,
        confidence: typeof p.confidence === "number" ? p.confidence : undefined,
      };
    });
  }

  /** Find similar conversation summaries */
  async findSimilarSummaries(
    queryEmbedding: number[],
    limit: number = 5
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
    const summariesSearchParams = { vector: queryEmbedding, limit, with_payload: true } as unknown as QdrantSearchParams;
    const searchResult = (await this.client.search(COLLECTIONS.SUMMARIES, summariesSearchParams)) as unknown as QdrantSearchHit<SummaryPayload>[] | undefined;

    return (searchResult ?? []).map((hit) => {
      const p = hit.payload ?? {};
      return {
        score: hit.score,
        sessionId: p.sessionId,
        summary: p.summary,
        turnCount: typeof p.turnCount === "number" ? p.turnCount : undefined,
        currentState: typeof p.currentState === "number" ? p.currentState : undefined,
      };
    });
  }

  /** Simple cluster analysis for entity types (lightweight) */
  async getEntityClusters(entityType: string, minClusterSize: number = 3) {
    await this.ensureInitialized();
    const scrollReq = {
      filter: { must: [{ key: "entityType", match: { value: entityType } }] },
      limit: 1000,
      with_payload: true,
    } as unknown as QdrantScrollParams;
    const scrollResult = (await this.client.scroll(COLLECTIONS.ENTITIES, scrollReq)) as unknown as { points?: Array<{ payload?: EntityPayload }> } | undefined;

    const counts = new Map<string, { count: number; confidence?: number }>();
    for (const p of scrollResult?.points ?? []) {
      const val = p.payload?.entityValue;
      if (!val) continue;
      const existing = counts.get(val) ?? { count: 0, confidence: undefined };
      existing.count += 1;
      if (typeof p.payload?.confidence === "number") existing.confidence = p.payload.confidence;
      counts.set(val, existing);
    }
    const clusters: Array<{
      centroid: string;
      members: Array<{ entityValue: string; confidence?: number }>;
      size: number;
    }> = [];
    for (const [entityValue, info] of counts.entries()) {
      if (info.count >= minClusterSize) {
        clusters.push({
          centroid: entityValue,
          members: [{ entityValue, confidence: info.confidence }],
          size: info.count,
        });
      }
    }
    return clusters.sort((a, b) => b.size - a.size);
  }

  /** Delete conversation data across collections */
  async deleteConversationData(sessionId: string): Promise<void> {
    await this.ensureInitialized();
    const deleteReq: QdrantDeleteParams = {
      wait: true,
      filter: { must: [{ key: "sessionId", match: { value: sessionId } }] },
    } as unknown as QdrantDeleteParams;

    // Cast to the runtime parameter type expected by the client to avoid TS mismatches across versions.
    const deleteParam = deleteReq as unknown as Parameters<QdrantClient['delete']>[1];

    await Promise.all([
      this.client.delete(COLLECTIONS.CONVERSATIONS, deleteParam),
      this.client.delete(COLLECTIONS.ENTITIES, deleteParam),
      this.client.delete(COLLECTIONS.SUMMARIES, deleteParam),
    ]);
  }

  /** Get collection statistics */
  async getStatistics(): Promise<{
    conversations: { count: number };
    entities: { count: number };
    summaries: { count: number };
  }> {
    await this.ensureInitialized();
    const resp = (await Promise.all([
      this.client.getCollection(COLLECTIONS.CONVERSATIONS),
      this.client.getCollection(COLLECTIONS.ENTITIES),
      this.client.getCollection(COLLECTIONS.SUMMARIES),
    ])) as unknown as [
      QdrantCollectionInfo | undefined,
      QdrantCollectionInfo | undefined,
      QdrantCollectionInfo | undefined
    ];

    const [conversations, entities, summaries] = resp;
    return {
      conversations: { count: conversations?.points_count ?? 0 },
      entities: { count: entities?.points_count ?? 0 },
      summaries: { count: summaries?.points_count ?? 0 },
    };
  }

  /** Ensure store is initialized */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) await this.initialize();
  }
} // end class

// Export singleton instance
export const qdrantVectorStore = new QdrantVectorStore();
      QdrantCollectionInfo | undefined,
      QdrantCollectionInfo | undefined,
    ];

    const [conversations, entities, summaries] = resp;
    return {
      conversations: { count: conversations?.points_count ?? 0 },
      entities: { count: entities?.points_count ?? 0 },
      summaries: { count: summaries?.points_count ?? 0 },
    };
  }

  /** Ensure store is initialized */
  private async ensureInitialized(): Promise<void> {
    if (!this.initialized) await this.initialize();
  }
}

// Export singleton instance
export const qdrantVectorStore = new QdrantVectorStore();
