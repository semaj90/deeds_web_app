#!/usr/bin/env node

/**
 * Phase 106: Add content_embedding_768 column to codebase_chunk_index
 *
 * This migration adds the canonical 768-dim embedding column and indexes
 * without modifying existing data.
 */

import pg from 'pg';

const { Pool } = pg;

const pool = new Pool({
  host: '127.0.0.1',
  port: 5434,
  user: 'legal_admin',
  password: '123456',
  database: 'legal_ai_db',
});

const runMigration = async () => {
  try {
    console.log('🔨 Adding content_embedding_768 column...');

    // Add the column if it doesn't exist
    await pool.query(`
      ALTER TABLE codebase_chunk_index
      ADD COLUMN IF NOT EXISTS content_embedding_768 vector(768);
    `);
    console.log('✅ Column added (or already exists)');

    // Create HNSW index for vector search
    console.log('🔨 Creating HNSW index for vector search...');
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_codebase_chunk_content_embedding_768_hnsw
      ON codebase_chunk_index
      USING hnsw (content_embedding_768 vector_cosine_ops)
      WITH (m = 16, ef_construction = 64);
    `);
    console.log('✅ HNSW index created');

    console.log('\n✅ Migration complete!');
    console.log('\nNext steps:');
    console.log('  1. Run: npm run atlas:backfill:embedding:dry --limit=100');
    console.log('  2. If dry-run passes, run: npm run atlas:backfill:embedding:apply --batch-size=32 --concurrency=4');
  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
};

runMigration();
