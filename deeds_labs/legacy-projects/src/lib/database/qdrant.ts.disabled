import { QdrantClient } from '@qdrant/js-client-rest';
import { env } from '$env/dynamic/private';
import { cacheManager } from './redis.js';

/**
 * Qdrant Vector Database Integration for Legal AI System
 * High-performance vector similarity search for legal documents
 */

export interface QdrantPoint {
  id: string | number;
  vector: number[];
  payload: {
    documentId: string;
    title: string;
    documentType: string;
    jurisdiction: string;
    practiceArea?: string;
    content: string;
    metadata: Record<string, any>;
    timestamp: number;
  };
}

export interface SearchResult {
  id: string | number;
  score: number;
  payload: QdrantPoint['payload'];
}

export interface SearchOptions {
  limit?: number;
  threshold?: number;
  filter?: Record<string, any>;
  withPayload?: boolean;
  withVector?: boolean;
}

export class QdrantManager {
  private client: QdrantClient;
  private collectionName: string;
  private vectorSize: number;

  constructor() {
    this.client = new QdrantClient({
      url: env.QDRANT_URL || 'http://localhost:6333',
      apiKey: env.QDRANT_API_KEY,
    });
    
    this.collectionName = env.QDRANT_COLLECTION_NAME || 'legal_documents';
    this.vectorSize = parseInt(env.VECTOR_DIMENSIONS || '384');
  }

  /**
   * Initialize Qdrant collection with optimal settings for legal documents
   */
  async initializeCollection(): Promise<void> {
    try {
      // Check if collection exists
      const collections = await this.client.getCollections();
      const collectionExists = collections.collections.some(
        (col) => col.name === this.collectionName
      );

      if (!collectionExists) {
        await this.client.createCollection(this.collectionName, {
          vectors: {
            size: this.vectorSize,
            distance: 'Cosine',
            on_disk: true, // Store vectors on disk for better memory usage
          },
          // Optimize for legal document search patterns
          optimizers_config: {
            deleted_threshold: 0.2,
            vacuum_min_vector_number: 1000,
            default_segment_number: 4,
            max_segment_size: 200000,
            memmap_threshold: 50000,
            indexing_threshold: 10000,
            flush_interval_sec: 30,
            max_optimization_threads: 2,
          },
          // Quantization for better performance
          quantization_config: {
            scalar: {
              type: 'int8',
              quantile: 0.99,
              always_ram: false,
            },
          },
          // High-performance indexing
          hnsw_config: {
            m: 16,
            ef_construct: 200,
            full_scan_threshold: 10000,
            max_indexing_threads: 4,
            on_disk: true,
          },
        });

        // Create indexes for common filter fields
        await this.createIndexes();
        
        console.log(`✅ Qdrant collection '${this.collectionName}' created successfully`);
      } else {
        console.log(`✅ Qdrant collection '${this.collectionName}' already exists`);
      }
    } catch (error) {
      console.error('Qdrant collection initialization failed:', error);
      throw error;
    }
  }

  /**
   * Create field indexes for efficient filtering
   */
  private async createIndexes(): Promise<void> {
    try {
      // Index for document type filtering
      await this.client.createPayloadIndex(this.collectionName, {
        field_name: 'documentType',
        field_schema: 'keyword',
      });

      // Index for jurisdiction filtering
      await this.client.createPayloadIndex(this.collectionName, {
        field_name: 'jurisdiction',
        field_schema: 'keyword',
      });

      // Index for practice area filtering
      await this.client.createPayloadIndex(this.collectionName, {
        field_name: 'practiceArea',
        field_schema: 'keyword',
      });

      // Index for timestamp-based queries
      await this.client.createPayloadIndex(this.collectionName, {
        field_name: 'timestamp',
        field_schema: 'integer',
      });

      console.log('✅ Qdrant payload indexes created');
    } catch (error) {
      console.error('Failed to create Qdrant indexes:', error);
    }
  }

  /**
   * Insert or update a document vector
   */
  async upsertDocument(point: QdrantPoint): Promise<void> {
    try {
      await this.client.upsert(this.collectionName, {
        wait: true,
        points: [point],
      });
    } catch (error) {
      console.error('Failed to upsert document:', error);
      throw error;
    }
  }

  /**
   * Batch insert documents for better performance
   */
  async batchUpsertDocuments(points: QdrantPoint[]): Promise<void> {
    try {
      // Process in batches of 100 for optimal performance
      const batchSize = 100;
      const batches = [];
      
      for (let i = 0; i < points.length; i += batchSize) {
        batches.push(points.slice(i, i + batchSize));
      }

      for (const batch of batches) {
        await this.client.upsert(this.collectionName, {
          wait: true,
          points: batch,
        });
      }

      console.log(`✅ Batch upserted ${points.length} documents to Qdrant`);
    } catch (error) {
      console.error('Failed to batch upsert documents:', error);
      throw error;
    }
  }

  /**
   * Perform vector similarity search
   */
  async searchSimilar(
    queryVector: number[],
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    const {
      limit = 10,
      threshold = 0.7,
      filter,
      withPayload = true,
      withVector = false,
    } = options;

    try {
      // Check cache first
      const cacheKey = this.generateSearchCacheKey(queryVector, options);
      const cached = await cacheManager.getCachedTokens(cacheKey);
      if (cached) {
        return JSON.parse(cached[0]?.text || '[]');
      }

      const searchResult = await this.client.search(this.collectionName, {
        vector: queryVector,
        limit,
        score_threshold: threshold,
        filter,
        with_payload: withPayload,
        with_vector: withVector,
      });

      const results: SearchResult[] = searchResult.map((point) => ({
        id: point.id,
        score: point.score,
        payload: point.payload as QdrantPoint['payload'],
      }));

      // Cache results for 30 minutes
      await cacheManager.cacheTokens(cacheKey, [{ text: JSON.stringify(results) }], 1800);

      return results;
    } catch (error) {
      console.error('Vector similarity search failed:', error);
      throw error;
    }
  }

  /**
   * Search with complex filters for legal-specific queries
   */
  async searchLegalDocuments(
    queryVector: number[],
    filters: {
      documentTypes?: string[];
      jurisdictions?: string[];
      practiceAreas?: string[];
      dateRange?: { start: number; end: number };
      excludeDocuments?: string[];
    } = {},
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    const filter: any = {
      must: [],
    };

    // Document type filter
    if (filters.documentTypes?.length) {
      filter.must.push({
        key: 'documentType',
        match: {
          any: filters.documentTypes,
        },
      });
    }

    // Jurisdiction filter
    if (filters.jurisdictions?.length) {
      filter.must.push({
        key: 'jurisdiction',
        match: {
          any: filters.jurisdictions,
        },
      });
    }

    // Practice area filter
    if (filters.practiceAreas?.length) {
      filter.must.push({
        key: 'practiceArea',
        match: {
          any: filters.practiceAreas,
        },
      });
    }

    // Date range filter
    if (filters.dateRange) {
      filter.must.push({
        key: 'timestamp',
        range: {
          gte: filters.dateRange.start,
          lte: filters.dateRange.end,
        },
      });
    }

    // Exclude specific documents
    if (filters.excludeDocuments?.length) {
      filter.must_not = [
        {
          key: 'documentId',
          match: {
            any: filters.excludeDocuments,
          },
        },
      ];
    }

    return this.searchSimilar(queryVector, {
      ...options,
      filter: filter.must.length > 0 || filter.must_not ? filter : undefined,
    });
  }

  /**
   * Find legal precedents based on document similarity
   */
  async findLegalPrecedents(
    queryVector: number[],
    caseType: string,
    jurisdiction: string,
    limit: number = 5
  ): Promise<SearchResult[]> {
    return this.searchLegalDocuments(
      queryVector,
      {
        documentTypes: ['case_law', 'regulation', 'precedent'],
        jurisdictions: [jurisdiction, 'federal'], // Include federal precedents
      },
      {
        limit,
        threshold: 0.75, // Higher threshold for precedent matching
      }
    );
  }

  /**
   * Semantic search with text query (requires embeddings generation)
   */
  async semanticSearch(
    query: string,
    embeddings: number[],
    options: SearchOptions & {
      documentTypes?: string[];
      jurisdiction?: string;
    } = {}
  ): Promise<SearchResult[]> {
    const { documentTypes, jurisdiction, ...searchOptions } = options;

    const filters: any = {};
    if (documentTypes?.length) {
      filters.documentTypes = documentTypes;
    }
    if (jurisdiction) {
      filters.jurisdictions = [jurisdiction];
    }

    return this.searchLegalDocuments(embeddings, filters, searchOptions);
  }

  /**
   * Get collection statistics
   */
  async getCollectionStats(): Promise<{
    vectorsCount: number;
    indexedVectorsCount: number;
    pointsCount: number;
    segmentsCount: number;
    status: string;
    optimizerStatus: any;
  }> {
    try {
      const info = await this.client.getCollection(this.collectionName);
      return {
        vectorsCount: info.vectors_count || 0,
        indexedVectorsCount: info.indexed_vectors_count || 0,
        pointsCount: info.points_count || 0,
        segmentsCount: info.segments_count || 0,
        status: info.status,
        optimizerStatus: info.optimizer_status,
      };
    } catch (error) {
      console.error('Failed to get collection stats:', error);
      throw error;
    }
  }

  /**
   * Delete documents by IDs
   */
  async deleteDocuments(documentIds: (string | number)[]): Promise<void> {
    try {
      await this.client.delete(this.collectionName, {
        wait: true,
        points: documentIds,
      });
    } catch (error) {
      console.error('Failed to delete documents:', error);
      throw error;
    }
  }

  /**
   * Delete documents by filter
   */
  async deleteDocumentsByFilter(filter: Record<string, any>): Promise<void> {
    try {
      await this.client.delete(this.collectionName, {
        wait: true,
        filter,
      });
    } catch (error) {
      console.error('Failed to delete documents by filter:', error);
      throw error;
    }
  }

  /**
   * Optimize collection for better performance
   */
  async optimizeCollection(): Promise<void> {
    try {
      await this.client.updateCollection(this.collectionName, {
        optimizers_config: {
          deleted_threshold: 0.2,
          vacuum_min_vector_number: 1000,
          default_segment_number: 4,
          max_segment_size: 200000,
          memmap_threshold: 50000,
          indexing_threshold: 10000,
          flush_interval_sec: 30,
          max_optimization_threads: 4,
        },
      });

      console.log('✅ Qdrant collection optimized');
    } catch (error) {
      console.error('Collection optimization failed:', error);
      throw error;
    }
  }

  /**
   * Create a snapshot for backup
   */
  async createSnapshot(): Promise<string> {
    try {
      const snapshot = await this.client.createSnapshot(this.collectionName);
      return snapshot.name;
    } catch (error) {
      console.error('Snapshot creation failed:', error);
      throw error;
    }
  }

  /**
   * Generate cache key for search results
   */
  private generateSearchCacheKey(vector: number[], options: SearchOptions): string {
    const keyData = {
      vector: vector.slice(0, 10), // Use first 10 dimensions for key
      options: {
        limit: options.limit,
        threshold: options.threshold,
        filter: options.filter,
      },
    };
    
    const hash = this.hashObject(keyData);
    return `qdrant:search:${hash}`;
  }

  private hashObject(obj: any): string {
    const str = JSON.stringify(obj);
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = (hash << 5) - hash + str.charCodeAt(i);
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }
}

// Export singleton instance
export const qdrantManager = new QdrantManager();

// Health check function
export async function checkQdrantHealth(): Promise<boolean> {
  try {
    await qdrantManager.getCollectionStats();
    return true;
  } catch {
    return false;
  }
}

// Utility function to generate embeddings cache key
export function generateEmbeddingsCacheKey(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = (hash << 5) - hash + text.charCodeAt(i);
    hash = hash & hash;
  }
  return `embeddings:${Math.abs(hash).toString(36)}`;
}