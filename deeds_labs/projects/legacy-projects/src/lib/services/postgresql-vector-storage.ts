/**
 * PostgreSQL JSONB Vector Storage Service
 * Integrates with existing database schema using pgvector for embeddings storage
 * Optimizes JSONB metadata storage with GIN indexing as per CLAUDE.md instructions
 */

import { db } from '../../../sveltekit-frontend/src/lib/server/database.js';
import {
  legalDocumentsJsonb,
  documentChunks,
  vectorEmbeddings,
  legalDocuments,
  evidenceVectors,
  caseEmbeddingsOptimized,
} from '../../../sveltekit-frontend/drizzle/schema.js';
import { eq, sql, cosineDistance, desc, and, gte, lte, inArray } from 'drizzle-orm';
import type { VectorizedDocument, VectorizedChunk } from './gemma-embedding-service.js';
import type { RankedResult } from './rag-ranking-system.js';
import type { QLoRATrainingData } from './auto-document-fetcher.js';

export interface StoredDocument {
  id: string;
  title: string;
  content: string;
  metadata: {
    document_type: string;
    practice_area: string;
    jurisdiction: string;
    confidentiality_level: string;
    urgency: string;
    source: string;
    legal_area: string;
    date_extracted: string;
    word_count: number;
    confidence_score: number;
    processing_status: string;
    tags: string[];
    ai_metadata: {
      model_used: string;
      embedding_model: string;
      processing_time_ms: number;
      chunk_count: number;
    };
  };
  title_embedding?: number[];
  content_embedding?: number[];
  created_at: string;
  updated_at: string;
}

export interface StoredChunk {
  id: string;
  document_id: string;
  chunk_index: number;
  content: string;
  embedding: number[];
  metadata: {
    chunk_type: string;
    legal_concepts: string[];
    entities: any;
    similarity_threshold: number;
    source_chunk_id: string;
  };
  created_at: string;
}

export interface QueryResult {
  document: StoredDocument;
  chunk: StoredChunk | null;
  similarity_score: number;
  rank: number;
}

export interface StorageStatistics {
  total_documents: number;
  total_chunks: number;
  total_embeddings: number;
  storage_size_mb: number;
  index_efficiency: number;
  avg_query_time_ms: number;
  by_document_type: Record<string, number>;
  by_practice_area: Record<string, number>;
  by_jurisdiction: Record<string, number>;
}

export class PostgreSQLVectorStorage {
  private defaultEmbeddingDimensions = 768; // Gemma embeddings
  private maxBatchSize = 100;
  private queryTimeout = 30000; // 30 seconds

  constructor() {}

  /**
   * Initialize storage with extensions and indexes
   */
  async initialize(): Promise<void> {
    console.log('🔄 Initializing PostgreSQL Vector Storage...');

    try {
      // Ensure pgvector extension is installed
      await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);
      console.log('✅ pgvector extension enabled');

      // Ensure pg_trgm for text search
      await db.execute(sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`);
      console.log('✅ pg_trgm extension enabled');

      // Create optimized indexes for JSONB metadata (as per CLAUDE.md)
      await this.createOptimizedIndexes();

      console.log('🎯 PostgreSQL Vector Storage initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize PostgreSQL Vector Storage:', error);
      throw error;
    }
  }

  /**
   * Create optimized indexes for JSONB metadata and vector similarity
   */
  private async createOptimizedIndexes(): Promise<void> {
    const indexes = [
      // JSONB GIN indexes for fast metadata queries
      {
        name: 'idx_legal_docs_metadata_gin_optimized',
        sql: sql`CREATE INDEX IF NOT EXISTS idx_legal_docs_metadata_gin_optimized
                ON legal_documents_jsonb USING gin (metadata jsonb_path_ops)`,
      },

      // Composite indexes for common query patterns
      {
        name: 'idx_legal_docs_type_area_jurisdiction',
        sql: sql`CREATE INDEX IF NOT EXISTS idx_legal_docs_type_area_jurisdiction
                ON legal_documents_jsonb (document_type, practice_area, jurisdiction)`,
      },

      // Vector similarity indexes with HNSW for better performance
      {
        name: 'idx_legal_docs_title_embedding_hnsw',
        sql: sql`CREATE INDEX IF NOT EXISTS idx_legal_docs_title_embedding_hnsw
                ON legal_documents_jsonb USING hnsw (title_embedding vector_cosine_ops)
                WITH (m = 16, ef_construction = 64)`,
      },

      {
        name: 'idx_legal_docs_content_embedding_hnsw',
        sql: sql`CREATE INDEX IF NOT EXISTS idx_legal_docs_content_embedding_hnsw
                ON legal_documents_jsonb USING hnsw (content_embedding vector_cosine_ops)
                WITH (m = 16, ef_construction = 64)`,
      },

      // Document chunks embedding index
      {
        name: 'idx_document_chunks_embedding_hnsw_optimized',
        sql: sql`CREATE INDEX IF NOT EXISTS idx_document_chunks_embedding_hnsw_optimized
                ON document_chunks USING hnsw (embedding vector_cosine_ops)
                WITH (m = 16, ef_construction = 64)`,
      },

      // Full-text search indexes
      {
        name: 'idx_legal_docs_fulltext_search',
        sql: sql`CREATE INDEX IF NOT EXISTS idx_legal_docs_fulltext_search
                ON legal_documents_jsonb USING gin(to_tsvector('english', title || ' ' || content))`,
      },

      // Metadata path indexes for fast filtering
      {
        name: 'idx_legal_docs_metadata_paths',
        sql: sql`CREATE INDEX IF NOT EXISTS idx_legal_docs_metadata_paths
                ON legal_documents_jsonb USING btree ((metadata->>'confidence_score')::float)`,
      },
    ];

    for (const index of indexes) {
      try {
        await db.execute(index.sql);
        console.log(`✅ Created index: ${index.name}`);
      } catch (error) {
        console.log(`⚠️ Index ${index.name} may already exist:`, error.message);
      }
    }
  }

  /**
   * Store vectorized documents with JSONB optimization
   */
  async storeDocuments(
    vectorizedDocs: VectorizedDocument[],
    options: {
      upsert?: boolean;
      batchSize?: number;
      includeChunks?: boolean;
    } = {}
  ): Promise<{ stored: number; updated: number; errors: number }> {
    const { upsert = true, batchSize = this.maxBatchSize, includeChunks = true } = options;

    console.log(`💾 Storing ${vectorizedDocs.length} vectorized documents...`);

    let stored = 0;
    let updated = 0;
    let errors = 0;

    // Process documents in batches
    const batches = this.chunkArray(vectorizedDocs, batchSize);

    for (const batch of batches) {
      try {
        const batchResults = await this.processBatch(batch, { upsert, includeChunks });
        stored += batchResults.stored;
        updated += batchResults.updated;
        errors += batchResults.errors;

        console.log(
          `📦 Batch complete: +${batchResults.stored} stored, +${batchResults.updated} updated`
        );
      } catch (error) {
        console.error('❌ Batch processing failed:', error);
        errors += batch.length;
      }
    }

    console.log(`✅ Storage complete: ${stored} stored, ${updated} updated, ${errors} errors`);
    return { stored, updated, errors };
  }

  /**
   * Process a batch of documents
   */
  private async processBatch(
    docs: VectorizedDocument[],
    options: { upsert: boolean; includeChunks: boolean }
  ): Promise<{ stored: number; updated: number; errors: number }> {
    let stored = 0;
    let updated = 0;
    let errors = 0;

    for (const doc of docs) {
      try {
        // Prepare document data for JSONB storage
        const documentData = {
          id: doc.id,
          title: doc.title,
          content: doc.content,
          metadata: {
            document_type: doc.metadata.document_type,
            practice_area: doc.metadata.legal_area,
            jurisdiction: doc.metadata.jurisdiction,
            confidentiality_level: 'standard',
            urgency: 'normal',
            source: doc.metadata.source,
            legal_area: doc.metadata.legal_area,
            date_extracted: doc.metadata.date_extracted,
            word_count: doc.metadata.word_count,
            confidence_score: doc.metadata.confidence_score,
            processing_status: 'completed',
            tags: [],
            ai_metadata: {
              model_used: doc.embedding_model,
              embedding_model: doc.embedding_model,
              processing_time_ms: 0,
              chunk_count: doc.chunks.length,
            },
          },
          titleEmbedding: doc.document_embedding?.length > 0 ? doc.document_embedding : null,
          contentEmbedding: doc.document_embedding?.length > 0 ? doc.document_embedding : null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };

        // Check if document exists
        const existing = await db
          .select()
          .from(legalDocumentsJsonb)
          .where(eq(legalDocumentsJsonb.id, doc.id))
          .limit(1);

        if (existing.length > 0 && options.upsert) {
          // Update existing document
          await db
            .update(legalDocumentsJsonb)
            .set({
              title: documentData.title,
              content: documentData.content,
              metadata: documentData.metadata,
              titleEmbedding: documentData.titleEmbedding,
              contentEmbedding: documentData.contentEmbedding,
              updatedAt: documentData.updatedAt,
            })
            .where(eq(legalDocumentsJsonb.id, doc.id));
          updated++;
        } else {
          // Insert new document
          await db.insert(legalDocumentsJsonb).values(documentData);
          stored++;
        }

        // Store document chunks if requested
        if (options.includeChunks && doc.chunks?.length > 0) {
          await this.storeDocumentChunks(doc.id, doc.chunks as VectorizedChunk[]);
        }
      } catch (error) {
        console.error(`❌ Error storing document ${doc.id}:`, error);
        errors++;
      }
    }

    return { stored, updated, errors };
  }

  /**
   * Store document chunks with embeddings
   */
  private async storeDocumentChunks(documentId: string, chunks: VectorizedChunk[]): Promise<void> {
    const chunkData = chunks.map((chunk, index) => ({
      id: chunk.id,
      documentId: documentId,
      documentType: 'legal',
      chunkIndex: index,
      content: chunk.content,
      embedding: chunk.embedding || [],
      metadata: {
        chunk_type: 'content',
        legal_concepts: chunk.legal_concepts || [],
        entities: chunk.entities || {},
        similarity_threshold: chunk.cosine_similarity_threshold || 0.7,
        source_chunk_id: chunk.id,
        source_metadata: chunk.metadata,
      },
      createdAt: new Date().toISOString(),
    }));

    // Delete existing chunks for this document
    await db.delete(documentChunks).where(eq(documentChunks.documentId, documentId));

    // Insert new chunks in batches
    const chunkBatches = this.chunkArray(chunkData, 50);
    for (const batch of chunkBatches) {
      await db.insert(documentChunks).values(batch);
    }
  }

  /**
   * Semantic search with vector similarity and JSONB filtering
   */
  async semanticSearch(
    queryEmbedding: number[],
    options: {
      limit?: number;
      threshold?: number;
      filters?: {
        document_type?: string[];
        practice_area?: string[];
        jurisdiction?: string[];
        confidence_min?: number;
      };
      includeContent?: boolean;
    } = {}
  ): Promise<QueryResult[]> {
    const { limit = 10, threshold = 0.5, filters = {}, includeContent = true } = options;

    console.log(`🔍 Performing semantic search with ${queryEmbedding.length}D embedding...`);

    try {
      // Build the base query
      let query = db
        .select({
          id: legalDocumentsJsonb.id,
          title: legalDocumentsJsonb.title,
          content: includeContent ? legalDocumentsJsonb.content : sql`''::text`.as('content'),
          metadata: legalDocumentsJsonb.metadata,
          titleEmbedding: legalDocumentsJsonb.titleEmbedding,
          contentEmbedding: legalDocumentsJsonb.contentEmbedding,
          createdAt: legalDocumentsJsonb.createdAt,
          updatedAt: legalDocumentsJsonb.updatedAt,
          similarity:
            sql<number>`1 - (content_embedding <=> ${JSON.stringify(queryEmbedding)}::vector)`.as(
              'similarity'
            ),
        })
        .from(legalDocumentsJsonb);

      // Apply JSONB filters using optimized queries
      const conditions = [];

      if (filters.document_type?.length) {
        conditions.push(
          <any>(<any>sql`metadata->>'document_type' = ANY(${filters.document_type})`)
        );
      }

      if (filters.practice_area?.length) {
        conditions.push(
          <any>(<any>sql`metadata->>'practice_area' = ANY(${filters.practice_area})`)
        );
      }

      if (filters.jurisdiction?.length) {
        conditions.push(<any>(<any>sql`metadata->>'jurisdiction' = ANY(${filters.jurisdiction})`));
      }

      if (filters.confidence_min !== undefined) {
        conditions.push(
          <any>(<any>sql`(metadata->>'confidence_score')::float >= ${filters.confidence_min}`)
        );
      }

      // Add similarity threshold
      conditions.push(
        <any>(
          (<any>(
            sql`1 - (content_embedding <=> ${JSON.stringify(queryEmbedding)}::vector) >= ${threshold}`
          ))
        )
      );

      // Apply conditions
      if (conditions.length > 0) {
        query = query.where(and(...conditions));
      }

      // Order by similarity and limit
      const results = await query
        .orderBy(sql`content_embedding <=> ${JSON.stringify(queryEmbedding)}::vector`)
        .limit(limit);

      console.log(`🎯 Found ${results.length} similar documents`);

      // Convert to QueryResult format
      const queryResults: QueryResult[] = results.map((row, index) => ({
        document: {
          id: row.id,
          title: row.title,
          content: row.content,
          metadata: row.metadata as StoredDocument['metadata'],
          title_embedding: row.titleEmbedding,
          content_embedding: row.contentEmbedding,
          created_at: row.createdAt,
          updated_at: row.updatedAt,
        },
        chunk: null, // Will be populated if chunk search is requested
        similarity_score: row.similarity,
        rank: index + 1,
      }));

      return queryResults;
    } catch (error) {
      console.error('❌ Semantic search failed:', error);
      throw error;
    }
  }

  /**
   * Search document chunks with vector similarity
   */
  async searchChunks(
    queryEmbedding: number[],
    options: {
      limit?: number;
      threshold?: number;
      documentIds?: string[];
    } = {}
  ): Promise<QueryResult[]> {
    const { limit = 20, threshold = 0.5, documentIds } = options;

    console.log(`🧩 Searching document chunks...`);

    try {
      let query = db
        .select({
          id: documentChunks.id,
          documentId: documentChunks.documentId,
          chunkIndex: documentChunks.chunkIndex,
          content: documentChunks.content,
          embedding: documentChunks.embedding,
          metadata: documentChunks.metadata,
          createdAt: documentChunks.createdAt,
          similarity: sql<number>`1 - (embedding <=> ${JSON.stringify(queryEmbedding)}::vector)`.as(
            'similarity'
          ),
        })
        .from(documentChunks);

      const conditions = [];

      // Filter by document IDs if provided
      if (documentIds?.length) {
        conditions.push(<any>(<any>inArray(documentChunks.documentId, documentIds)));
      }

      // Add similarity threshold
      conditions.push(
        <any>(
          (<any>sql`1 - (embedding <=> ${JSON.stringify(queryEmbedding)}::vector) >= ${threshold}`)
        )
      );

      if (conditions.length > 0) {
        query = query.where(and(...conditions));
      }

      const results = await query
        .orderBy(sql`embedding <=> ${JSON.stringify(queryEmbedding)}::vector`)
        .limit(limit);

      console.log(`🎯 Found ${results.length} similar chunks`);

      // Convert to QueryResult format with chunk data
      const queryResults: QueryResult[] = results.map((row, index) => ({
        document: {
          id: row.documentId,
          title: 'Chunk Result',
          content: row.content,
          metadata: {} as StoredDocument['metadata'],
          created_at: row.createdAt,
          updated_at: row.createdAt,
        },
        chunk: {
          id: row.id,
          document_id: row.documentId,
          chunk_index: row.chunkIndex,
          content: row.content,
          embedding: row.embedding,
          metadata: row.metadata as StoredChunk['metadata'],
          created_at: row.createdAt,
        },
        similarity_score: row.similarity,
        rank: index + 1,
      }));

      return queryResults;
    } catch (error) {
      console.error('❌ Chunk search failed:', error);
      throw error;
    }
  }

  /**
   * Export documents for QLoRA training
   */
  async exportForQLoRATraining(
    filters: {
      document_types?: string[];
      practice_areas?: string[];
      confidence_min?: number;
      limit?: number;
    } = {}
  ): Promise<QLoRATrainingData[]> {
    const { limit = 1000, confidence_min = 0.7 } = filters;

    console.log('📚 Exporting documents for QLoRA training...');

    try {
      let query = db
        .select({
          id: legalDocumentsJsonb.id,
          title: legalDocumentsJsonb.title,
          content: legalDocumentsJsonb.content,
          metadata: legalDocumentsJsonb.metadata,
        })
        .from(legalDocumentsJsonb);

      const conditions = [];

      if (filters.document_types?.length) {
        conditions.push(
          <any>(<any>sql`metadata->>'document_type' = ANY(${filters.document_types})`)
        );
      }

      if (filters.practice_areas?.length) {
        conditions.push(
          <any>(<any>sql`metadata->>'practice_area' = ANY(${filters.practice_areas})`)
        );
      }

      if (confidence_min) {
        conditions.push(
          <any>(<any>sql`(metadata->>'confidence_score')::float >= ${confidence_min}`)
        );
      }

      if (conditions.length > 0) {
        query = query.where(and(...conditions));
      }

      const documents = await query.limit(limit);

      console.log(`📖 Retrieved ${documents.length} documents for training export`);

      // Convert to QLoRA training format
      const trainingData: QLoRATrainingData[] = [];

      for (const doc of documents) {
        const metadata = doc.metadata as any;
        const practiceArea = metadata.practice_area || 'general';

        // Generate instruction-input-output triplets
        trainingData.push(<any>(<any>{
          instruction: `Analyze this ${metadata.document_type || 'legal document'} and provide key insights.`,
          input: `Document Title: ${doc.title}\n\nContent: ${doc.content.substring(0, 1000)}...`,
          output: `This ${metadata.document_type || 'document'} pertains to ${practiceArea}. Key legal concepts include: ${this.extractKeyLegalConcepts(doc.content).join(', ')}. The document's jurisdiction is ${metadata.jurisdiction || 'unspecified'} and it relates to ${metadata.legal_area || 'general legal matters'}.`,
          metadata: {
            document_id: doc.id,
            legal_area: practiceArea,
            difficulty_level: this.calculateDifficultyLevel(doc.content),
            token_count: this.estimateTokenCount(doc.content),
          },
        }));
      }

      console.log(`🎓 Generated ${trainingData.length} training examples`);
      return trainingData;
    } catch (error) {
      console.error('❌ QLoRA export failed:', error);
      throw error;
    }
  }

  /**
   * Get storage statistics
   */
  async getStorageStatistics(): Promise<StorageStatistics> {
    console.log('📊 Calculating storage statistics...');

    try {
      // Get document counts
      const docStats = await db.execute(sql`
        SELECT
          COUNT(*) as total_documents,
          COUNT(CASE WHEN content_embedding IS NOT NULL THEN 1 END) as total_embeddings,
          AVG(LENGTH(content)) as avg_content_length,
          SUM(LENGTH(content)) as total_content_size
        FROM legal_documents_jsonb
      `);

      const chunkStats = await db.execute(sql`
        SELECT COUNT(*) as total_chunks
        FROM document_chunks
      `);

      // Get distribution by document type
      const typeStats = await db.execute(sql`
        SELECT
          metadata->>'document_type' as document_type,
          COUNT(*) as count
        FROM legal_documents_jsonb
        GROUP BY metadata->>'document_type'
      `);

      // Get distribution by practice area
      const areaStats = await db.execute(sql`
        SELECT
          metadata->>'practice_area' as practice_area,
          COUNT(*) as count
        FROM legal_documents_jsonb
        GROUP BY metadata->>'practice_area'
      `);

      // Get distribution by jurisdiction
      const jurisdictionStats = await db.execute(sql`
        SELECT
          metadata->>'jurisdiction' as jurisdiction,
          COUNT(*) as count
        FROM legal_documents_jsonb
        GROUP BY metadata->>'jurisdiction'
      `);

      const docRow = docStats[0] as any;
      const chunkRow = chunkStats[0] as any;

      const statistics: StorageStatistics = {
        total_documents: parseInt(docRow.total_documents) || 0,
        total_chunks: parseInt(chunkRow.total_chunks) || 0,
        total_embeddings: parseInt(docRow.total_embeddings) || 0,
        storage_size_mb: Math.round((parseInt(docRow.total_content_size) || 0) / (1024 * 1024)),
        index_efficiency: 0.85, // Placeholder - would need more complex calculation
        avg_query_time_ms: 150, // Placeholder - would need query performance monitoring
        by_document_type: {},
        by_practice_area: {},
        by_jurisdiction: {},
      };

      // Process distribution statistics
      for (const row of typeStats as any[]) {
        statistics.by_document_type[row.document_type || 'unknown'] = parseInt(row.count);
      }

      for (const row of areaStats as any[]) {
        statistics.by_practice_area[row.practice_area || 'unknown'] = parseInt(row.count);
      }

      for (const row of jurisdictionStats as any[]) {
        statistics.by_jurisdiction[row.jurisdiction || 'unknown'] = parseInt(row.count);
      }

      console.log(
        `📈 Statistics calculated: ${statistics.total_documents} docs, ${statistics.total_chunks} chunks`
      );
      return statistics;
    } catch (error) {
      console.error('❌ Failed to get storage statistics:', error);
      throw error;
    }
  }

  /**
   * Utility methods
   */
  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(<any>(<any>array.slice(i, i + size)));
    }
    return chunks;
  }

  private extractKeyLegalConcepts(content: string): string[] {
    const concepts = [
      'contract',
      'tort',
      'negligence',
      'liability',
      'damages',
      'breach',
      'jurisdiction',
      'precedent',
      'statute',
      'regulation',
      'constitutional',
      'due process',
      'evidence',
      'discovery',
      'motion',
      'appeal',
    ];

    return concepts.filter((concept) => new RegExp(`\\b${concept}\\b`, 'i').test(content));
  }

  private calculateDifficultyLevel(content: string): number {
    const complexTerms = ['notwithstanding', 'pursuant', 'heretofore', 'whereas'];
    const citationCount = (content.match(/\d+\s+U\.S\.|\d+\s+F\.\d+d/g) || []).length;
    const complexTermCount = complexTerms.reduce(
      (count, term) => count + (content.toLowerCase().includes(term) ? 1 : 0),
      0
    );

    return Math.min(Math.floor((complexTermCount + citationCount) / 3), 5);
  }

  private estimateTokenCount(content: string): number {
    return Math.ceil(content.split(/\s+/).length * 1.3); // Rough estimate
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{
    status: 'healthy' | 'unhealthy';
    connection: boolean;
    indexes: boolean;
    vector_extension: boolean;
    document_count: number;
  }> {
    try {
      // Test database connection
      const connectionTest = await db.execute(sql`SELECT 1 as test`);
      const connection = connectionTest.length > 0;

      // Test vector extension
      const vectorTest = await db.execute(sql`SELECT '[12,3]'::vector as test_vector`);
      const vector_extension = vectorTest.length > 0;

      // Check document count
      const docCount = await db.execute(sql`SELECT COUNT(*) as count FROM legal_documents_jsonb`);
      const document_count = parseInt((docCount[0] as any).count) || 0;

      // Check indexes (simplified)
      const indexCheck = await db.execute(sql`
        SELECT COUNT(*) as index_count
        FROM pg_indexes
        WHERE tablename = 'legal_documents_jsonb'
      `);
      const indexes = parseInt((indexCheck[0] as any).index_count) > 0;

      const status = connection && vector_extension && indexes ? 'healthy' : 'unhealthy';

      return {
        status,
        connection,
        indexes,
        vector_extension,
        document_count,
      };
    } catch (error) {
      console.error('PostgreSQL Vector Storage health check failed:', error);
      return {
        status: 'unhealthy',
        connection: false,
        indexes: false,
        vector_extension: false,
        document_count: 0,
      };
    }
  }
}

// Export singleton
export const postgresqlVectorStorage = new PostgreSQLVectorStorage();
export default postgresqlVectorStorage;
