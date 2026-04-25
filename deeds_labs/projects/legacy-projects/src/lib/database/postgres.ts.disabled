import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '$env/dynamic/private';
import * as schema from './schema/legal-documents.js';

/**
 * PostgreSQL connection with pgvector support for Legal AI System
 * Optimized for high-performance vector similarity search and legal document management
 */

// Connection configuration
const connectionString = env.DATABASE_URL || 'postgresql://legalai:password@localhost:5432/legalai_db';

// Create postgres client with optimized settings
const sql = postgres(connectionString, {
  max: parseInt(env.DATABASE_POOL_SIZE || '20'),
  idle_timeout: parseInt(env.DATABASE_POOL_TIMEOUT || '30000'),
  connect_timeout: 10,
  types: {
    // Custom type for pgvector
    vector: {
      to: 1000,
      from: 1000,
      serialize: (x: number[]) => `[${x.join(',')}]`,
      parse: (x: string) => x.slice(1, -1).split(',').map(Number),
    },
  },
  // Enable SSL in production
  ssl: env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  // Connection debugging
  debug: env.NODE_ENV === 'development',
});

// Create Drizzle instance
export const db = drizzle(sql, { schema });

// Database utility functions
export class LegalDatabaseManager {
  
  /**
   * Initialize database with required extensions and optimizations
   */
  async initializeDatabase(): Promise<void> {
    try {
      // Enable pgvector extension
      await sql`CREATE EXTENSION IF NOT EXISTS vector`;
      
      // Enable other useful extensions
      await sql`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`;
      await sql`CREATE EXTENSION IF NOT EXISTS "pg_trgm"`;
      await sql`CREATE EXTENSION IF NOT EXISTS "btree_gin"`;
      
      // Create custom vector similarity functions
      await sql`
        CREATE OR REPLACE FUNCTION cosine_similarity(a vector, b vector)
        RETURNS float8 AS $$
        BEGIN
          RETURN 1 - (a <=> b);
        END;
        $$ LANGUAGE plpgsql IMMUTABLE;
      `;
      
      // Create optimized indexes for legal document search
      await sql`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS legal_documents_content_gin_idx 
        ON legal_documents USING GIN (to_tsvector('english', content));
      `;
      
      await sql`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS legal_documents_title_gin_idx 
        ON legal_documents USING GIN (to_tsvector('english', title));
      `;
      
      // Set optimal vector index parameters
      await sql`SET ivfflat.probes = 10`;
      
      console.log('✅ Database initialized successfully with pgvector support');
    } catch (error) {
      console.error('❌ Database initialization failed:', error);
      throw error;
    }
  }

  /**
   * Perform vector similarity search on legal documents
   */
  async findSimilarDocuments(
    embedding: number[],
    limit: number = 10,
    threshold: number = 0.7,
    documentType?: string,
    jurisdiction?: string
  ): Promise<Array<schema.LegalDocument & { similarity: number }>> {
    try {
      const embeddingVector = `[${embedding.join(',')}]`;
      
      let query = sql`
        SELECT *, 
               cosine_similarity(content_embedding, ${embeddingVector}::vector) as similarity
        FROM legal_documents 
        WHERE content_embedding IS NOT NULL
          AND cosine_similarity(content_embedding, ${embeddingVector}::vector) > ${threshold}
      `;
      
      // Add filters if provided
      if (documentType) {
        query = sql`${query} AND document_type = ${documentType}`;
      }
      
      if (jurisdiction) {
        query = sql`${query} AND jurisdiction = ${jurisdiction}`;
      }
      
      query = sql`
        ${query} 
        ORDER BY cosine_similarity(content_embedding, ${embeddingVector}::vector) DESC 
        LIMIT ${limit}
      `;
      
      const results = await query;
      return results as Array<schema.LegalDocument & { similarity: number }>;
    } catch (error) {
      console.error('Vector similarity search failed:', error);
      throw error;
    }
  }

  /**
   * Perform hybrid search combining vector similarity and full-text search
   */
  async hybridSearch(
    query: string,
    embedding: number[],
    options: {
      limit?: number;
      vectorWeight?: number;
      textWeight?: number;
      documentType?: string;
      jurisdiction?: string;
      practiceArea?: string;
    } = {}
  ): Promise<Array<schema.LegalDocument & { combinedScore: number }>> {
    const {
      limit = 20,
      vectorWeight = 0.7,
      textWeight = 0.3,
      documentType,
      jurisdiction,
      practiceArea
    } = options;

    try {
      const embeddingVector = `[${embedding.join(',')}]`;
      
      let searchQuery = sql`
        SELECT *,
               (
                 ${vectorWeight} * cosine_similarity(content_embedding, ${embeddingVector}::vector) +
                 ${textWeight} * ts_rank_cd(to_tsvector('english', content), plainto_tsquery('english', ${query}))
               ) as combined_score
        FROM legal_documents 
        WHERE content_embedding IS NOT NULL
          AND (
            to_tsvector('english', content) @@ plainto_tsquery('english', ${query})
            OR cosine_similarity(content_embedding, ${embeddingVector}::vector) > 0.5
          )
      `;
      
      // Add filters
      if (documentType) {
        searchQuery = sql`${searchQuery} AND document_type = ${documentType}`;
      }
      
      if (jurisdiction) {
        searchQuery = sql`${searchQuery} AND jurisdiction = ${jurisdiction}`;
      }
      
      if (practiceArea) {
        searchQuery = sql`${searchQuery} AND practice_area = ${practiceArea}`;
      }
      
      searchQuery = sql`
        ${searchQuery}
        ORDER BY combined_score DESC
        LIMIT ${limit}
      `;
      
      const results = await searchQuery;
      return results as Array<schema.LegalDocument & { combinedScore: number }>;
    } catch (error) {
      console.error('Hybrid search failed:', error);
      throw error;
    }
  }

  /**
   * Find legal precedents based on case similarity
   */
  async findLegalPrecedents(
    caseId: string,
    embedding: number[],
    limit: number = 5
  ): Promise<Array<schema.LegalCase & { relevanceScore: number }>> {
    try {
      const embeddingVector = `[${embedding.join(',')}]`;
      
      const precedentsQuery = sql`
        WITH case_documents AS (
          SELECT ld.*
          FROM legal_documents ld
          JOIN case_documents cd ON ld.id = cd.document_id
          WHERE cd.case_id = ${caseId}
            AND ld.content_embedding IS NOT NULL
        ),
        similar_documents AS (
          SELECT DISTINCT ld2.*,
                 MAX(cosine_similarity(cd.content_embedding, ld2.content_embedding)) as max_similarity
          FROM legal_documents ld2
          CROSS JOIN case_documents cd
          WHERE ld2.content_embedding IS NOT NULL
            AND ld2.document_type IN ('case_law', 'regulation', 'precedent')
          GROUP BY ld2.id
          HAVING MAX(cosine_similarity(cd.content_embedding, ld2.content_embedding)) > 0.6
        )
        SELECT lc.*,
               sd.max_similarity as relevance_score
        FROM legal_cases lc
        JOIN case_documents cd2 ON lc.id = cd2.case_id
        JOIN similar_documents sd ON cd2.document_id = sd.id
        WHERE lc.status = 'closed'
        ORDER BY sd.max_similarity DESC
        LIMIT ${limit}
      `;
      
      const results = await precedentsQuery;
      return results as Array<schema.LegalCase & { relevanceScore: number }>;
    } catch (error) {
      console.error('Precedent search failed:', error);
      throw error;
    }
  }

  /**
   * Batch insert documents with embeddings
   */
  async batchInsertDocuments(
    documents: Array<schema.NewLegalDocument>
  ): Promise<schema.LegalDocument[]> {
    try {
      return await db.insert(schema.legalDocuments)
        .values(documents)
        .returning();
    } catch (error) {
      console.error('Batch document insert failed:', error);
      throw error;
    }
  }

  /**
   * Update document embeddings
   */
  async updateDocumentEmbeddings(
    documentId: string,
    contentEmbedding: number[],
    titleEmbedding?: number[]
  ): Promise<void> {
    try {
      const updateData: Partial<schema.LegalDocument> = {
        contentEmbedding: contentEmbedding as any,
        updatedAt: new Date(),
      };
      
      if (titleEmbedding) {
        updateData.titleEmbedding = titleEmbedding as any;
      }
      
      await db.update(schema.legalDocuments)
        .set(updateData)
        .where(sql`id = ${documentId}`);
    } catch (error) {
      console.error('Embedding update failed:', error);
      throw error;
    }
  }

  /**
   * Get database statistics and health metrics
   */
  async getDatabaseStats(): Promise<{
    documentCount: number;
    caseCount: number;
    entityCount: number;
    cacheHitRate: number;
    avgQueryTime: number;
    vectorIndexStats: any;
  }> {
    try {
      const [documentCount] = await sql`SELECT COUNT(*) as count FROM legal_documents`;
      const [caseCount] = await sql`SELECT COUNT(*) as count FROM legal_cases`;
      const [entityCount] = await sql`SELECT COUNT(*) as count FROM legal_entities`;
      
      // Get vector index statistics
      const vectorStats = await sql`
        SELECT schemaname, tablename, indexname, idx_tup_read, idx_tup_fetch
        FROM pg_stat_user_indexes 
        WHERE indexname LIKE '%embedding%'
      `;
      
      return {
        documentCount: parseInt(documentCount.count),
        caseCount: parseInt(caseCount.count),
        entityCount: parseInt(entityCount.count),
        cacheHitRate: 0, // Would need to implement cache hit tracking
        avgQueryTime: 0, // Would need query time tracking
        vectorIndexStats: vectorStats
      };
    } catch (error) {
      console.error('Failed to get database stats:', error);
      throw error;
    }
  }

  /**
   * Cleanup expired cache entries
   */
  async cleanupExpiredCache(): Promise<number> {
    try {
      const result = await db.delete(schema.agentAnalysisCache)
        .where(sql`expires_at < NOW()`)
        .returning({ id: schema.agentAnalysisCache.id });
      
      return result.length;
    } catch (error) {
      console.error('Cache cleanup failed:', error);
      throw error;
    }
  }

  /**
   * Vacuum and analyze tables for optimal performance
   */
  async optimizeDatabase(): Promise<void> {
    try {
      await sql`VACUUM ANALYZE legal_documents`;
      await sql`VACUUM ANALYZE legal_cases`;
      await sql`VACUUM ANALYZE legal_entities`;
      await sql`VACUUM ANALYZE agent_analysis_cache`;
      
      // Reindex vector indexes
      await sql`REINDEX INDEX CONCURRENTLY legal_documents_content_embedding_idx`;
      await sql`REINDEX INDEX CONCURRENTLY legal_documents_title_embedding_idx`;
      
      console.log('✅ Database optimization completed');
    } catch (error) {
      console.error('Database optimization failed:', error);
      throw error;
    }
  }
}

// Export singleton instance
export const dbManager = new LegalDatabaseManager();

// Health check function
export async function checkPostgresHealth(): Promise<boolean> {
  try {
    await sql`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

// Graceful shutdown
export async function closePostgresConnection(): Promise<void> {
  try {
    await sql.end();
  } catch (error) {
    console.error('Postgres shutdown error:', error);
  }
}