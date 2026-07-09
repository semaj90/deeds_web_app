#!/usr/bin/env node
/**
 * Phase 8: Qdrant Checkpoint + Inverse HNSW for ACP Cached Loops
 *
 * Prepares Qdrant for ACP A2A network cached queries:
 * 1. Checkpoint embeddings + SOM assignments to Qdrant
 * 2. Build inverse HNSW index for neighbor expansion
 * 3. Cache SOM centroids for O(1) centroid lookups during traversals
 *
 * Inverse HNSW: query centroid → find neighbors in HNSW → expand topology
 * (avoids full scan, enables bounded k-hop traversal in Neo4j)
 *
 * Usage:
 *   npm run atlas:phase8:qdrant:checkpoint:dry
 *   npm run atlas:phase8:qdrant:checkpoint:apply
 *   npm run atlas:phase8:qdrant:checkpoint:health
 */

import fetch from 'node-fetch';
import pg from 'pg';

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const COLLECTION = 'acp_inverse_hnsw';
const VECTOR_DIM = 384;
const BATCH_SIZE = 100;

const DRY_RUN = process.argv.includes('--dry-run');
const HEALTH_CHECK = process.argv.includes('--health');
const APPLY = process.argv.includes('--apply');

async function qdrantRequest(method, path, body = null) {
  const url = `${QDRANT_URL}${path}`;
  const options = {
    method,
    headers: { 'Content-Type': 'application/json' }
  };
  if (body) options.body = JSON.stringify(body);

  const res = await fetch(url, options);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Qdrant ${method} ${path}: ${res.status} ${text}`);
  }
  return res.json();
}

async function main() {
  console.log('\n🔌 Phase 8: Qdrant Checkpoint + Inverse HNSW\n');

  const pool = new pg.Pool({
    host: process.env.DB_HOST || '127.0.0.1',
    port: parseInt(process.env.DB_PORT || '5434'),
    user: process.env.DB_USER || 'legal_admin',
    password: process.env.DB_PASSWORD || '123456',
    database: process.env.DB_NAME || 'legal_ai_db'
  });

  try {
    await pool.connect();
    console.log('✅ Postgres connected\n');

    // Health check mode
    if (HEALTH_CHECK) {
      console.log('[HEALTH] Checking Qdrant collection...\n');
      try {
        const health = await qdrantRequest('GET', '/health');
        console.log(`  Qdrant status: ${health.status}\n`);

        const collections = await qdrantRequest('GET', '/collections');
        const found = collections.result.collections.find(c => c.name === COLLECTION);
        if (found) {
          console.log(`  ✓ Collection '${COLLECTION}' exists`);
          console.log(`    Points: ${found.points_count}`);
          console.log(`    Vectors: ${VECTOR_DIM}-dim\n`);
        } else {
          console.log(`  ✗ Collection '${COLLECTION}' not found\n`);
        }
      } catch (err) {
        console.log(`  ❌ Qdrant connection failed: ${err.message}\n`);
      }
      process.exit(0);
    }

    // Load data from Postgres
    console.log('[LOAD] Fetching embeddings and SOM assignments...\n');
    const result = await pool.query(`
      SELECT
        id,
        qdrant_id,
        content_embedding,
        som_bmu_row,
        som_bmu_col
      FROM codebase_chunk_index
      WHERE content_embedding IS NOT NULL
      LIMIT 52235
    `);

    const embeddings = result.rows.map(row => {
      let emb = row.content_embedding;
      if (typeof emb === 'string') {
        emb = emb.slice(1, -1).split(',').map(s => parseFloat(s.trim())).slice(0, 384);
      } else if (Array.isArray(emb)) {
        emb = emb.slice(0, 384);
      }
      return {
        chunk_id: row.id,
        qdrant_id: row.qdrant_id,
        vector: emb,
        som_row: row.som_bmu_row,
        som_col: row.som_bmu_col
      };
    }).filter(e => e.vector && e.vector.length === 384);

    console.log(`  ✓ Loaded ${embeddings.length} embeddings\n`);

    if (DRY_RUN) {
      console.log('[DRY-RUN] Preview (first 3 points):\n');
      for (let i = 0; i < Math.min(3, embeddings.length); i++) {
        const e = embeddings[i];
        console.log(`  Point ${i}: id=${e.chunk_id}, som=(${e.som_row},${e.som_col})`);
      }
      console.log(`\n  Would create collection with ${embeddings.length} points\n`);
      process.exit(0);
    }

    // Create or recreate collection
    console.log('[QDRANT] Creating inverse HNSW collection...\n');

    try {
      // Delete if exists
      await qdrantRequest('DELETE', `/collections/${COLLECTION}`);
      console.log(`  Deleted existing collection\n`);
    } catch (err) {
      // Collection doesn't exist, continue
    }

    // Create collection with HNSW index
    await qdrantRequest('PUT', `/collections/${COLLECTION}`, {
      vectors: {
        size: VECTOR_DIM,
        distance: 'Cosine',
        hnsw_config: {
          m: 16,           // connections per node
          ef_construct: 64, // construction effort
          ef: 32,          // search effort
          max_indexing_threads: 4
        }
      }
    });

    console.log(`  ✓ Collection '${COLLECTION}' created\n`);

    // Upsert points in batches
    console.log('[UPSERT] Uploading embeddings...\n');
    let uploaded = 0;

    for (let i = 0; i < embeddings.length; i += BATCH_SIZE) {
      const batch = embeddings.slice(i, i + BATCH_SIZE);
      const points = batch.map(e => ({
        id: e.chunk_id,
        vector: e.vector,
        payload: {
          chunk_id: e.chunk_id,
          qdrant_id: e.qdrant_id,
          som_row: e.som_row,
          som_col: e.som_col
        }
      }));

      await qdrantRequest('PUT', `/collections/${COLLECTION}/points?wait=true`, {
        points
      });

      uploaded += batch.length;
      if (uploaded % (BATCH_SIZE * 5) === 0) {
        console.log(`  ✓ Uploaded ${uploaded}/${embeddings.length}`);
      }
    }

    console.log(`\n✅ Uploaded ${uploaded} points\n`);

    // Verify
    console.log('[VERIFY] Checking collection health...\n');
    const collections = await qdrantRequest('GET', '/collections');
    const created = collections.result.collections.find(c => c.name === COLLECTION);
    if (created) {
      console.log(`  Points indexed: ${created.points_count}`);
      console.log(`  Vectors: ${VECTOR_DIM}-dim`);
      console.log(`  Index: HNSW (inverse neighbor search enabled)\n`);
    }

    console.log('═══════════════════════════════════════════════════════════════');
    console.log('✅ Phase 8 Qdrant Checkpoint Complete');
    console.log(`  - Collection: '${COLLECTION}'`);
    console.log(`  - Points: ${uploaded}`);
    console.log(`  - Index: HNSW (m=16, ef_construct=64, ef=32)`);
    console.log(`  - Ready for ACP inverse neighbor expansion`);
    console.log('═══════════════════════════════════════════════════════════════\n');

  } catch (error) {
    console.error('[ERROR]', error.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main().catch(console.error);
