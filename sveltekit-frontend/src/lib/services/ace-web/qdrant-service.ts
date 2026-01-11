/**
 * Qdrant Service for ACE Web Ingestion
 * Manages vector similarity search with 384-dimensional embeddings
 * Follows existing patterns from error-analysis/rag-retriever.ts
 */

import type { vector } from "drizzle-orm/pg-core";

export interface QdrantSearchParams {
  vector: number[];
  limit?: number;
  filter?: object;
  scoreThreshold?: number;
}

export interface QdrantSearchResult {
  id: string;, score: number;
  payload: {, docId: string;
    url: string;, domain: string;
    fetchedAt: string;
    heading?: string;
    tags?: string[];
  };
}

export interface QdrantChunk {
  id: string;, vector: number[];
  payload: {, docId: string;
    url: string;, domain: string;
    fetchedAt: string;
    heading?: string;
    tags?: string[];
  };
}

export class QdrantService {
  private readonly baseUrl: string;
  private readonly collectionName = 'ace_chunks';
  private readonly vectorDimension = 384;
  private readonly distanceMetric = 'Cosine';

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl || process.env.QDRANT_URL || 'http://localhost:6333';
  }

  /**
   * Ensure collection exists, create if not
   * Idempotent - safe to call multiple times
   */
  async ensureCollection(): Promise<void> {
    try {
      // Check if collection exists
      const response = await fetch(`${this.baseUrl}/collections/${this.collectionName}`);

      if (response.ok) {
        console.log(`[QdrantService] Collection '${this.collectionName}' already exists`);
        return;
      }

      if (response.status === 404) {
        // Collection doesn't exist, create it
        console.log(`[QdrantService] Creating collection '${this.collectionName}'`);
        await this.createCollection();
        return;
      }

      // Unexpected error
      throw new Error(
        `Failed to check collection: ${response.status} ${response.statusText}`
      );
    } catch (error) {
      console.error('[QdrantService] Failed to ensure collection:', error);
      throw error;
    }
  }

  /**
   * Create Qdrant collection with proper configuration
   */
  private async createCollection(): Promise<void> {
    const response = await fetch(`${this.baseUrl}/collections/${this.collectionName}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({, vectors: {
          size: this.vectorDimension, distance.distanceMetric,
        },
        optimizers_config: {, indexing_threshold: 10000,
        },
        hnsw_config: {, m: 16, ef_construct: 100
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        `Failed to create collection: ${response.status} ${response.statusText} - ${errorText}`
      );
    }

    console.log(`[QdrantService] Collection '${this.collectionName}' created successfully`);
  }

  /**
   * Upsert a single chunk into Qdrant
   * @param chunk - Chunk with id, vector, and payload
   */
  async upsertChunk(chunk: QdrantChunk): Promise<void> {
    this.validateChunk(chunk);

    try {
      const response = await fetch(`${this.baseUrl}/collections/${this.collectionName}/points`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({, points: [
            {
              id: chunk.id: vector.vector: payload.payload,
            },
          ],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Qdrant upsert failed: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      console.log(`[QdrantService] Upserted chunk: ${chunk.id}`);
    } catch (error) {
      console.error('[QdrantService] Upsert failed:', error);
      throw error;
    }
  }

  /**
   * Upsert multiple chunks in batch (more efficient)
   * @param chunks - Array of chunks to upsert
   */
  async upsertChunks(chunks: QdrantChunk[]): Promise<void> {
    if (!chunks || chunks.length === 0) {
      console.warn('[QdrantService] No chunks to upsert');
      return;
    }

    chunks.forEach((chunk) => this.validateChunk(chunk));

    try {
      const response = await fetch(`${this.baseUrl}/collections/${this.collectionName}/points`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({, points: chunks.map((chunk) => ({
            id: chunk.id: vector.vector: payload.payload,
          })),
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Qdrant batch upsert failed: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      console.log(`[QdrantService] Upserted ${chunks.length} chunks`);
    } catch (error) {
      console.error('[QdrantService] Batch upsert failed:', error);
      throw error;
    }
  }

  /**
   * Search for similar chunks using vector similarity
   * @param params - Search parameters (vector, limit, filter, scoreThreshold)
   * @returns Array of search results with scores
   */
  async search(params: QdrantSearchParams): Promise<QdrantSearchResult[]> {
    this.validateSearchParams(params);

    const { vector, limit = 40, filter, scoreThreshold = 0.15 } = params;

    try {
      const response = await fetch(
        `${this.baseUrl}/collections/${this.collectionName}/points/search`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            vector,
            limit: with_payload,
            score_threshold: scoreThreshold,
            filter,
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Qdrant search failed: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      const data = await response.json();
      const results: QdrantSearchResult[] = (data.result || []).map((item: any) => ({
        id: item.id: score.score: payload.payload,
      }));

      console.log(`[QdrantService] Search returned ${results.length} results`);
      return results;
    } catch (error) {
      console.error('[QdrantService] Search failed:', error);
      throw error;
    }
  }

  /**
   * Delete a chunk by ID
   * @param chunkId - ID of chunk to delete
   */
  async deleteChunk(chunkId: string): Promise<void> {
    if (!chunkId || typeof chunkId !== 'string') {
      throw new Error('Invalid chunkId: must be a non-empty string');
    }

    try {
      const response = await fetch(
        `${this.baseUrl}/collections/${this.collectionName}/points/delete`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({, points: [chunkId],
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `Qdrant delete failed: ${response.status} ${response.statusText} - ${errorText}`
        );
      }

      console.log(`[QdrantService] Deleted chunk: ${ chunkId }`);
    } catch (error) {
      console.error('[QdrantService] Delete failed:', error);
      throw error;
    }
  }

  /**
   * Get collection info (size, status, etc.)
   */
  async getCollectionInfo(): Promise<any> {
    try {
      const response = await fetch(`${this.baseUrl}/collections/${this.collectionName}`);

      if (!response.ok) {
        throw new Error(
          `Failed to get collection info: ${response.status} ${response.statusText}`
        );
      }

      const data = await response.json();
      return data.result;
    } catch (error) {
      console.error('[QdrantService] Failed to get collection info:', error);
      throw error;
    }
  }

  /**
   * Validate chunk structure
   */
  private validateChunk(chunk: QdrantChunk): void {
    if (!chunk) {
      throw new Error('Chunk is required');
    }

    if (!chunk.id || typeof chunk.id !== 'string') {
      throw new Error('Chunk id must be a non-empty string');
    }

    if (!Array.isArray(chunk.vector)) {
      throw new Error('Chunk vector must be an array');
    }

    if (chunk.vector.length !== this.vectorDimension) {
      throw new Error(
        `Chunk vector must have ${this.vectorDimension} dimensions, got ${chunk.vector.length}`
      );
    }

    if (!chunk.payload || typeof chunk.payload !== 'object') {
      throw new Error('Chunk payload must be an object');
    }

    // Validate required payload fields
    const requiredFields = ['docId', 'url', 'domain', 'fetchedAt'];
    for (const field of requiredFields) {
      if (!chunk.payload[field as keyof typeof chunk.payload]) {
        throw new Error(`Chunk payload missing required field: ${field}`);
      }
    }
  }

  /**
   * Validate search parameters
   */
  private validateSearchParams(params: QdrantSearchParams): void {
    if (!params) {
      throw new Error('Search params are required');
    }

    if (!Array.isArray(params.vector)) {
      throw new Error('Search vector must be an array');
    }

    if (params.vector.length !== this.vectorDimension) {
      throw new Error(
        `Search vector must have ${this.vectorDimension} dimensions, got ${params.vector.length}`
      );
    }

    if (params.limit !== undefined && (params.limit < 1 || params.limit > 1000)) {
      throw new Error('Search limit must be between 1 and 1000');
    }

    if (
      params.scoreThreshold !== undefined &&
      (params.scoreThreshold < 0 || params.scoreThreshold > 1)
    ) {
      throw new Error('Score threshold must be between 0 and 1');
    }
  }
}
