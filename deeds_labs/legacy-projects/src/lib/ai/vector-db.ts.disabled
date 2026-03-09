// PostgreSQL + pgvector integration for embedding storage and vector search
import { Pool, type PoolClient } from 'pg';
import type { Document, SearchResult, EmbeddingSearchOptions } from './types';

export class VectorDatabase {
  private pool: Pool;
  
  constructor(connectionString?: string) {
    this.pool = new Pool({
      connectionString: connectionString || process.env.DATABASE_URL,
      max: 20,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
  }

  /**
   * Initialize database with pgvector extension and required tables
   */
  async initialize() {
    const client = await this.pool.connect();
    try {
      // Enable pgvector extension
      await client.query('CREATE EXTENSION IF NOT EXISTS vector');
      
      // Create documents table with vector column
      await client.query(`
        CREATE TABLE IF NOT EXISTS documents (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          content TEXT NOT NULL,
          metadata JSONB DEFAULT '{}',
          embedding vector(768), -- Adjust dimension based on your model
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create indexes for efficient search
      await client.query(`
        CREATE INDEX IF NOT EXISTS documents_embedding_idx 
        ON documents USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 100)
      `);

      await client.query(`
        CREATE INDEX IF NOT EXISTS documents_metadata_idx 
        ON documents USING GIN (metadata)
      `);

      // Create legal cases table
      await client.query(`
        CREATE TABLE IF NOT EXISTS legal_cases (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          title VARCHAR(255) NOT NULL,
          description TEXT,
          client_name VARCHAR(255),
          case_type VARCHAR(100) NOT NULL,
          status VARCHAR(50) DEFAULT 'active',
          notes TEXT,
          tags TEXT[],
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create case-document relationship
      await client.query(`
        CREATE TABLE IF NOT EXISTS case_documents (
          case_id UUID REFERENCES legal_cases(id) ON DELETE CASCADE,
          document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
          PRIMARY KEY (case_id, document_id)
        )
      `);

      // Create chat history table
      await client.query(`
        CREATE TABLE IF NOT EXISTS chat_history (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          case_id UUID REFERENCES legal_cases(id) ON DELETE CASCADE,
          role VARCHAR(20) NOT NULL,
          content TEXT NOT NULL,
          context JSONB DEFAULT '{}',
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
      `);

    } finally {
      client.release();
    }
  }

  /**
   * Store document with embeddings
   */
  async storeDocument(
    content: string, 
    embedding: number[], 
    metadata: Record<string, any> = {}
  ): Promise<Document> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `INSERT INTO documents (content, embedding, metadata)
         VALUES ($1, $2, $3)
         RETURNING *`,
        [content, JSON.stringify(embedding), metadata]
      );
      
      return this.parseDocument(result.rows[0]);
    } finally {
      client.release();
    }
  }

  /**
   * Batch store multiple documents
   */
  async storeDocuments(
    documents: Array<{
      content: string;
      embedding: number[];
      metadata?: Record<string, any>;
    }>
  ): Promise<Document[]> {
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      
      const storedDocs: Document[] = [];
      for (const doc of documents) {
        const result = await client.query(
          `INSERT INTO documents (content, embedding, metadata)
           VALUES ($1, $2, $3)
           RETURNING *`,
          [doc.content, JSON.stringify(doc.embedding), doc.metadata || {}]
        );
        storedDocs.push(this.parseDocument(result.rows[0]));
      }
      
      await client.query('COMMIT');
      return storedDocs;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Search documents by vector similarity
   */
  async searchByVector(
    queryEmbedding: number[],
    options: EmbeddingSearchOptions = {}
  ): Promise<SearchResult[]> {
    const { limit = 10, threshold = 0.7, filter = {} } = options;
    
    const client = await this.pool.connect();
    try {
      // Build filter conditions
      const filterConditions = Object.entries(filter)
        .map(([key, value], index) => `metadata->>'${key}' = $${index + 3}`)
        .join(' AND ');
      
      const whereClause = filterConditions ? `AND ${filterConditions}` : '';
      const filterValues = Object.values(filter);
      
      const query = `
        SELECT 
          *,
          1 - (embedding <=> $1::vector) as similarity
        FROM documents
        WHERE 1 - (embedding <=> $1::vector) > $2
        ${whereClause}
        ORDER BY embedding <=> $1::vector
        LIMIT ${limit}
      `;
      
      const result = await client.query(
        query,
        [JSON.stringify(queryEmbedding), threshold, ...filterValues]
      );
      
      return result.rows.map(row => ({
        document: this.parseDocument(row),
        score: row.similarity,
      }));
    } finally {
      client.release();
    }
  }

  /**
   * Hybrid search combining vector similarity and keyword search
   */
  async hybridSearch(
    queryEmbedding: number[],
    keywords: string,
    options: EmbeddingSearchOptions = {}
  ): Promise<SearchResult[]> {
    const { limit = 10, threshold = 0.5 } = options;
    
    const client = await this.pool.connect();
    try {
      const query = `
        WITH vector_search AS (
          SELECT 
            *,
            1 - (embedding <=> $1::vector) as vector_score
          FROM documents
          WHERE 1 - (embedding <=> $1::vector) > $3
        ),
        text_search AS (
          SELECT 
            *,
            ts_rank(to_tsvector('english', content), plainto_tsquery('english', $2)) as text_score
          FROM documents
          WHERE to_tsvector('english', content) @@ plainto_tsquery('english', $2)
        )
        SELECT 
          COALESCE(v.id, t.id) as id,
          COALESCE(v.content, t.content) as content,
          COALESCE(v.metadata, t.metadata) as metadata,
          COALESCE(v.embedding, t.embedding) as embedding,
          COALESCE(v.created_at, t.created_at) as created_at,
          COALESCE(v.updated_at, t.updated_at) as updated_at,
          COALESCE(v.vector_score, 0) * 0.7 + COALESCE(t.text_score, 0) * 0.3 as combined_score
        FROM vector_search v
        FULL OUTER JOIN text_search t ON v.id = t.id
        ORDER BY combined_score DESC
        LIMIT $4
      `;
      
      const result = await client.query(
        query,
        [JSON.stringify(queryEmbedding), keywords, threshold, limit]
      );
      
      return result.rows.map(row => ({
        document: this.parseDocument(row),
        score: row.combined_score,
      }));
    } finally {
      client.release();
    }
  }

  /**
   * Get document by ID
   */
  async getDocument(id: string): Promise<Document | null> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        'SELECT * FROM documents WHERE id = $1',
        [id]
      );
      
      return result.rows[0] ? this.parseDocument(result.rows[0]) : null;
    } finally {
      client.release();
    }
  }

  /**
   * Update document embedding
   */
  async updateEmbedding(id: string, embedding: number[]): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        'UPDATE documents SET embedding = $1, updated_at = CURRENT_TIMESTAMP WHERE id = $2',
        [JSON.stringify(embedding), id]
      );
    } finally {
      client.release();
    }
  }

  /**
   * Delete document
   */
  async deleteDocument(id: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('DELETE FROM documents WHERE id = $1', [id]);
    } finally {
      client.release();
    }
  }

  /**
   * Store chat message
   */
  async storeChatMessage(
    caseId: string,
    role: 'user' | 'assistant' | 'system',
    content: string,
    context?: Record<string, any>
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query(
        `INSERT INTO chat_history (case_id, role, content, context)
         VALUES ($1, $2, $3, $4)`,
        [caseId, role, content, context || {}]
      );
    } finally {
      client.release();
    }
  }

  /**
   * Get chat history for a case
   */
  async getChatHistory(caseId: string, limit = 50): Promise<any[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT * FROM chat_history 
         WHERE case_id = $1 
         ORDER BY created_at DESC 
         LIMIT $2`,
        [caseId, limit]
      );
      return result.rows.reverse();
    } finally {
      client.release();
    }
  }

  /**
   * Parse database row to Document type
   */
  private parseDocument(row: any): Document {
    return {
      id: row.id,
      content: row.content,
      metadata: row.metadata || {},
      embedding: row.embedding,
    };
  }

  /**
   * Close database connection
   */
  async close() {
    await this.pool.end();
  }
}

// Singleton instance
export const vectorDB = new VectorDatabase();
