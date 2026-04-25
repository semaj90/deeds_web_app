#!/usr/bin/env node
/**
 * Knowledge Base Database Setup
 *
 * Creates PostgreSQL table for knowledge base metadata + vector storage
 * Ensures Qdrant collection with dense + BM42 sparse vector support
 *
 * Usage:
 *   node scripts/knowledge-base-setup.mjs
 *
 * Environment:
 *   DATABASE_URL   (default: postgresql://legal_admin:123456@127.0.0.1:5432/legal_ai_db)
 *   QDRANT_URL     (default: http://localhost:6333)
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import postgres from 'postgres';

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5432/legal_ai_db';
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';

const sql = postgres(DATABASE_URL, { max: 3 });
const qdrant = new QdrantClient({ url: QDRANT_URL });

const COLLECTION = 'knowledge_base';
const VECTOR_DIM = 768;

async function setupDatabase() {
  console.log('Setting up Knowledge Base...\n');

  try {
    // 1. Create PostgreSQL table (comprehensive schema)
    console.log('1. Creating PostgreSQL table...');
    await sql`
      CREATE TABLE IF NOT EXISTS knowledge_base (
        id SERIAL PRIMARY KEY,
        doc_name VARCHAR(255) NOT NULL,
        chunk_idx INTEGER NOT NULL DEFAULT 0,
        chunk_id VARCHAR(255) UNIQUE,
        content TEXT NOT NULL,
        source VARCHAR(100),
        source_file VARCHAR(500),
        embedding_id VARCHAR(255),
        chunk_type VARCHAR(50) DEFAULT 'text',
        metadata JSONB DEFAULT '{}',
        file_hash VARCHAR(64),
        word_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
    `;
    console.log('   Table created\n');

    // 2. Add pgvector column if extension exists
    console.log('2. Adding vector column...');
    try {
      await sql`CREATE EXTENSION IF NOT EXISTS vector`;
      await sql`
        DO $$ BEGIN
          ALTER TABLE knowledge_base ADD COLUMN IF NOT EXISTS embedding vector(768);
        EXCEPTION WHEN others THEN NULL;
        END $$;
      `;
      console.log('   Vector column added\n');
    } catch (e) {
      console.log(`   Skipped vector column: ${e.message.slice(0, 60)}\n`);
    }

    // 3. Create indexes
    console.log('3. Creating indexes...');
    await sql`CREATE INDEX IF NOT EXISTS idx_kb_embedding_id ON knowledge_base(embedding_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_kb_doc_name ON knowledge_base(doc_name)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_kb_source ON knowledge_base(source)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_kb_chunk_id ON knowledge_base(chunk_id)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_kb_source_file ON knowledge_base(source_file)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_kb_file_hash ON knowledge_base(file_hash)`;
    console.log('   Indexes created\n');

    // 4. Ensure Qdrant collection with BM42 sparse vectors
    console.log('4. Checking Qdrant collection...');
    let collectionExists = false;
    try {
      const info = await qdrant.getCollection(COLLECTION);
      console.log(`   Collection exists: ${info.points_count} vectors`);
      collectionExists = true;
    } catch {
      // Will create below
    }

    if (!collectionExists) {
      console.log('   Creating collection with dense + BM42 sparse vectors...');
      await qdrant.createCollection(COLLECTION, {
        vectors: {
          size: VECTOR_DIM,
          distance: 'Cosine'
        },
        sparse_vectors: {
          bm25: {}
        },
        quantization_config: {
          scalar: { type: 'int8', always_ram: true }
        }
      });
      console.log('   Collection created\n');
    } else {
      // Ensure sparse vectors are configured on existing collection
      console.log('   Ensuring BM42 sparse vector config...');
      try {
        await qdrant.updateCollection(COLLECTION, {
          sparse_vectors: { bm25: {} }
        });
        console.log('   Sparse vectors configured\n');
      } catch (e) {
        console.log(`   Sparse config: ${e.message?.slice(0, 60) || 'already configured'}\n`);
      }
    }

    // 5. Summary
    const countResult = await sql`SELECT COUNT(*) as cnt FROM knowledge_base`;
    const rowCount = countResult[0]?.cnt || 0;

    let qdrantCount = 0;
    try {
      const info = await qdrant.getCollection(COLLECTION);
      qdrantCount = info.points_count || 0;
    } catch { /* ignore */ }

    console.log('==================================================');
    console.log('Knowledge Base Setup Complete\n');
    console.log('Stats:');
    console.log(`   PostgreSQL: knowledge_base (${rowCount} rows)`);
    console.log(`   Qdrant: ${COLLECTION} (${qdrantCount} points, ${VECTOR_DIM}-dim, Cosine + BM42)`);
    console.log('   Status: Ready for document ingestion\n');

    await sql.end();
    process.exit(0);
  } catch (err) {
    console.error('Setup failed:', err);
    await sql.end().catch(() => {});
    process.exit(1);
  }
}

setupDatabase();
