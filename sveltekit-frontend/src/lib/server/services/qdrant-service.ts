import { QdrantClient } from '@qdrant/js-client-rest';
import type { QdrantPayload, ChunkRecord } from '$lib/types/pipeline-v2';

// 768 is standard for embeddinggemma / gemma-based embeddings
const VECTOR_SIZE = 768;
const COLLECTION_NAME = 'legal_documents_v2';

export class QdrantService {
  private client: QdrantClient;
  private initialized = false;

  constructor() {
    this.client = new QdrantClient({
      host: process.env.QDRANT_HOST || 'localhost',
      port: Number(process.env.QDRANT_PORT) || 6333,
    });
  }

  /**
   * Ensure the V2 collection exists with correct config
   */
  async ensureCollection(): Promise<void> {
    if (this.initialized) return;

    try {
      const result = await this.client.getCollections();
      const exists = result.collections.some((c) => c.name === COLLECTION_NAME);

      if (!exists) {
        console.log(`[Qdrant] Creating collection: ${COLLECTION_NAME}`);
        await this.client.createCollection(COLLECTION_NAME, {
          vectors: {
            size: VECTOR_SIZE,
            distance: 'Cosine',
          },
        });

        // Create Payload Indexes for fast filtering
        await this.client.createPayloadIndex(COLLECTION_NAME, {
          field_name: 'tags',
          field_schema: 'keyword',
        });
        await this.client.createPayloadIndex(COLLECTION_NAME, {
          field_name: 'case_id',
          field_schema: 'keyword',
        });
        await this.client.createPayloadIndex(COLLECTION_NAME, {
          field_name: 'chunk_id',
          field_schema: 'keyword',
        });
      }
      this.initialized = true;
    } catch (error) {
      console.error('[Qdrant] Schema initialization failed:', error);
      // Don't throw, might be transient connection issue
    }
  }

  /**
   * Idempotent Upsert of Chunks with Embeddings
   */
  async upsertChunks(chunks: ChunkRecord[], embeddings: number[][]): Promise<boolean> {
    if (chunks.length !== embeddings.length) {
      throw new Error('Chunks and embeddings count mismatch');
    }
    await this.ensureCollection();

    const points = chunks.map((chunk, i) => {
      const payload: QdrantPayload = {
        doc_id: chunk.doc_id,
        chunk_id: chunk.chunk_id,
        case_id: chunk.case_id,
        tags: chunk.tags,
        priority: chunk.priority,
        created_at: chunk.created_at,
        sha256: chunk.sha256,
        source: chunk.source,
        text: chunk.text,
      };

      return {
        id: chunk.chunk_id,
        vector: embeddings[i],
        payload: payload as unknown as Record<string, unknown>,
      };
    });

    try {
      await this.client.upsert(COLLECTION_NAME, {
        wait: true,
        points: points as any,
      });
      return true;
    } catch (e) {
      console.error('[Qdrant] Upsert failed:', e);
      return false;
    }
  }

  /**
   * Search with V2 Filters (Tags, CaseID, Priority)
   */
  async search(
    queryVector: number[],
    filter?: { case_id?: string; tags?: string[]; min_priority?: number },
    limit = 5
  ) {
    await this.ensureCollection();

    const must: any[] = [];

    if (filter?.case_id) {
      must.push({ key: 'case_id', match: { value: filter.case_id } });
    }

    if (filter?.tags && filter.tags.length > 0) {
      must.push({ key: 'tags', match: { any: filter.tags } });
    }

    if (filter?.min_priority !== undefined) {
      must.push({ key: 'priority', range: { gte: filter.min_priority } });
    }

    try {
      const results = await this.client.search(COLLECTION_NAME, {
        vector: queryVector,
        filter: must.length > 0 ? { must } : undefined,
        limit,
        with_payload: true,
      });

      return results.map(hit => ({
        id: hit.id,
        score: hit.score,
        payload: hit.payload as unknown as QdrantPayload,
        version: hit.version
      }));
    } catch (e) {
      console.error('[Qdrant] Search failed:', e);
      return [];
    }
  }

  async health(): Promise<boolean> {
    try {
      await this.client.getCollections();
      return true;
    } catch {
      return false;
    }
  }
}

export const qdrantService = new QdrantService();
