// src/lib/server/vectordb/dual-vector-store.ts
import { QdrantClient } from '@qdrant/js-client-rest';
import type { Drizzle } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import type { Party, LegalDate } from '$lib/server/langextract/legal-parser'; // Import Party and LegalDate

export interface SearchResult {
  id: string;
  text: string;
  similarity: number;
  metadata: any; // Define a proper interface for metadata if needed
}

export class DualVectorStore {
  private qdrant: QdrantClient;
  private db: Drizzle;

  constructor(qdrant: QdrantClient, db: Drizzle) {
    this.qdrant = qdrant;
    this.db = db;
  }

  async indexDocument(doc: {
    id: string;
    text: string;
    embedding: number[];
    metadata: {
      tags: string[];
      document_type: string;
      risk_level: string;
      parties: Party[];
      dates: LegalDate[];
    };
  }): Promise<void> {
    // Index in Qdrant (fast ANN search)
    await this.qdrant.upsert('legal_documents', {
      wait: true,
      points: [
        {
          id: doc.id,
          vector: doc.embedding,
          payload: {
            text: doc.text.slice(0, 1000), // First 1K chars
            ...doc.metadata
          }
        }
      ]
    });

    // Index in pgvector (ACID compliance + JSONB metadata)
    await this.db.execute(sql`
      INSERT INTO legal_documents (id, content, embedding_768, metadata)
      VALUES (
        ${doc.id},
        ${doc.text},
        ${sql`ARRAY[${doc.embedding.join(',')}]::vector(768)`},
        ${sql`${JSON.stringify(doc.metadata)}::jsonb`}
      )
      ON CONFLICT (id) DO UPDATE SET
        content = EXCLUDED.content,
        embedding_768 = EXCLUDED.embedding_768,
        metadata = EXCLUDED.metadata,
        updated_at = NOW()
    `);

    console.log(`✅ Indexed document ${doc.id} in Qdrant + pgvector`);
  }

  async search(query: {
    embedding: number[];
    filters?: {
      tags?: string[];
      document_type?: string;
      risk_level?: string;
    };
    limit?: number;
  }): Promise<SearchResult[]> {
    const limit = query.limit || 20;

    // Search Qdrant (fast ANN)
    const qdrantResults = await this.qdrant.search('legal_documents', {
      vector: query.embedding,
      limit: limit * 2, // Over-fetch for re-ranking
      filter: query.filters ? this.buildQdrantFilter(query.filters) : undefined
    });

    // Re-rank with pgvector (exact cosine similarity)
    const qdrantIds = qdrantResults.map(r => r.id);

    const pgResults = await this.db.execute(sql`
      SELECT
        id,
        content,
        metadata,
        1 - (embedding_768 <=> ${sql`ARRAY[${query.embedding.join(',')}]::vector(768)`}) AS similarity
      FROM legal_documents
      WHERE id = ANY(${qdrantIds})
      ORDER BY similarity DESC
      LIMIT ${limit}
    `);

    return pgResults.rows.map(row => ({
      id: row.id,
      text: row.content,
      similarity: row.similarity,
      metadata: row.metadata
    }));
  }

  private buildQdrantFilter(filters: {
    tags?: string[];
    document_type?: string;
    risk_level?: string;
  }): any {
    const must: any[] = [];
    if (filters.tags && filters.tags.length > 0) {
      must.push({
        has_id: filters.tags
      });
    }
    if (filters.document_type) {
      must.push({
        key: 'document_type',
        match: {
          value: filters.document_type
        }
      });
    }
    if (filters.risk_level) {
      must.push({
        key: 'risk_level',
        match: {
          value: filters.risk_level
        }
      });
    }
    return { must };
  }
}