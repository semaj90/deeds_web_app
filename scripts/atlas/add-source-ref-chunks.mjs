#!/usr/bin/env node
/**
 * Add source_ref to codebase_chunk_index for bridge joins
 * 
 * This allows the qdrant-point-id-bridge to join:
 *   atlas_packets (source_ref) ← codebase_chunk_index (source_ref) → Qdrant points
 */

import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const env = loadRepoEnv(process.env);
const POSTGRES_URL = resolveDatabaseUrl(env);
const pgPool = new pg.Pool({ connectionString: POSTGRES_URL });

async function addSourceRef() {
  try {
    console.log('⚙️  Adding source_ref to codebase_chunk_index...\n');

    // Step 1: Add column if not exists
    await pgPool.query(`
      ALTER TABLE codebase_chunk_index 
      ADD COLUMN IF NOT EXISTS source_ref TEXT;
    `);
    console.log('✅ Column added (or already exists)');

    // Step 2: Populate from relative_path
    const updateRes = await pgPool.query(`
      UPDATE codebase_chunk_index
      SET source_ref = relative_path
      WHERE source_ref IS NULL AND relative_path IS NOT NULL;
    `);
    console.log(`✅ Updated ${updateRes.rowCount} rows from relative_path`);

    // Step 3: Create index
    await pgPool.query(`
      CREATE INDEX IF NOT EXISTS idx_codebase_chunk_source_ref 
      ON codebase_chunk_index (source_ref);
    `);
    console.log('✅ Index created');

    // Step 4: Verify
    const verifyRes = await pgPool.query(`
      SELECT 
        COUNT(*) total,
        COUNT(CASE WHEN source_ref IS NOT NULL THEN 1 END) with_source_ref
      FROM codebase_chunk_index;
    `);
    const { total, with_source_ref } = verifyRes.rows[0];
    console.log(`\n📊 Chunks: ${with_source_ref}/${total} have source_ref (${(100 * with_source_ref / total).toFixed(1)}%)`);

  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  } finally {
    await pgPool.end();
  }
}

addSourceRef();
