/**
 * PGVector Search Service
 * Semantic search using PostgreSQL pgvector
 */

import { Pool, QueryResult } from 'pg';

export interface SearchResult {
  id: string;
  title: string;
  chunk: string;
  similarity: number;
  metadata?: Record<string, unknown>;
}

export interface ChunkInput {
  text: string;
  embedding: number[];
  metadata?: Record<string, unknown>;
}

export class PGVectorSearch {
  private pool: Pool;
  private tableName: string = 'document_chunks';

  constructor(connectionString: string) {
    this.pool = new Pool({
      connectionString,
    });
  }

  /**
   * Initialize pgvector extension and create table
   */
  async initialize(): Promise<void> {
    const client = await this.pool.connect();
    try {
      // Enable pgvector extension
      await client.query('CREATE EXTENSION IF NOT EXISTS vector');

      // Create chunks table with vector column
      await client.query(`
        CREATE TABLE IF NOT EXISTS ${this.tableName} (
          id SERIAL PRIMARY KEY,
          document_id VARCHAR(255) NOT NULL,
          title VARCHAR(512) NOT NULL,
          chunk TEXT NOT NULL,
          embedding vector(768),
          metadata JSONB,
          created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT unique_chunk UNIQUE(document_id, chunk)
        )
      `);

      // Create index for vector similarity search
      await client.query(`
        CREATE INDEX IF NOT EXISTS ${this.tableName}_embedding_idx
        ON ${this.tableName}
        USING ivfflat (embedding vector_cosine_ops)
        WITH (lists = 100)
      `);

      console.log('PGVector initialized');
    } finally {
      client.release();
    }
  }

  /**
   * Insert document chunks with embeddings
   */
  async insertChunks(
    documentId: string,
    title: string,
    chunks: ChunkInput[]
  ): Promise<number> {
    const client = await this.pool.connect();
    try {
      let inserted = 0;

      for (const chunk of chunks) {
        try {
          await client.query(
            `INSERT INTO ${this.tableName} (document_id, title, chunk, embedding, metadata)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (document_id, chunk) DO NOTHING`,
            [
              documentId,
              title,
              chunk.text,
              JSON.stringify(chunk.embedding),
              JSON.stringify(chunk?.metadata || {})
            ]
          );
          inserted++;
        } catch (error) {
          console.error(`Error inserting chunk for ${documentId}:`, error);
        }
      }

      return inserted;
    } finally {
      client.release();
    }
  }

  /**
   * Semantic search using vector similarity
   */
  async search(
    queryEmbedding: number[],
    limit: number = 50,
    threshold: number = 0.5
  ): Promise<SearchResult[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `SELECT
          id,
          document_id,
          title,
          chunk,
          1 - (embedding <=> $1::vector) as similarity,
          metadata
        FROM ${this.tableName}
        WHERE 1 - (embedding <=> $1::vector) > $2
        ORDER BY similarity DESC
        LIMIT $3`,
        [JSON.stringify(queryEmbedding), threshold, limit]
      );

      return result.rows.map((row) => ({
        id: row.document_id,
        title: row.title,
        chunk: row.chunk,
        similarity: row.similarity,
        metadata: row.metadata,
      }));
    } finally {
      client.release();
    }
  }

  /**
   * Get chunk count
   */
  async getChunkCount(): Promise<number> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(`SELECT COUNT(*) as count FROM ${this.tableName}`);
      return parseInt(result.rows[0].count, 10);
    } finally {
      client.release();
    }
  }

  /**
   * Delete chunks for a document
   */
  async deleteDocument(documentId: string): Promise<number> {
    const client = await this.pool.connect();
    try {
      const result = await client.query(
        `DELETE FROM ${this.tableName} WHERE document_id = $1`,
        [documentId]
      );
      return result?.rowCount ?? 0;
    } finally {
      client.release();
    }
  }

  /**
   * Close connection pool
   */
  async close(): Promise<void> {
    await this.pool.end();
  }
}

/**
 * Create PGVector search instance
 */
export async function createPGVectorSearch(connectionString: string): Promise<PGVectorSearch> {
  const search = new PGVectorSearch(connectionString);
  await search.initialize();
  return search;
}
