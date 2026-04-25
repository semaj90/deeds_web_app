#!/usr/bin/env node
/**
 * Phase 89: Build Top-K Inverse Index
 *
 * Pre-compute the top-K most similar errors for each error
 * for instant similarity queries without vector search
 */

import pg from 'pg';
import { createClient } from 'redis';

const { Pool } = pg;

const CONFIG = {
  postgres: {
    host: '127.0.0.1',
    port: 5434,
    database: 'legal',
    user: 'user',
    password: 'pass'
  },
  redis: {
    host: '127.0.0.1',
    port: 6379
  },
  topK: parseInt(process.argv[2]) || 20,
  batchSize: 100
};

let db, redis;

async function main() {
  console.log('🔗 Phase 89: Building Top-K Inverse Index\n');
  console.log(`   Top-K: ${CONFIG.topK} neighbors per error`);

  db = new Pool(CONFIG.postgres);
  redis = createClient({
    socket: {
      host: CONFIG.redis.host,
      port: CONFIG.redis.port
    }
  });

  await redis.connect();
  console.log('✅ Connected to services\n');

  // Create index table
  await createIndexTable();

  // Get all errors with embeddings
  const { rows: errors } = await db.query(`
    SELECT id, embedding, source
    FROM raw_error_embeddings
    WHERE embedding IS NOT NULL
    ORDER BY id
  `);

  console.log(`📊 Found ${errors.length} errors to index`);

  // Clear existing index
  await db.query('TRUNCATE error_topk_index');

  // Build index in batches
  const batches = [];
  for (let i = 0; i < errors.length; i += CONFIG.batchSize) {
    batches.push(errors.slice(i, i + CONFIG.batchSize));
  }

  let totalProcessed = 0;
  const startTime = Date.now();

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx];

    for (const error of batch) {
      await buildIndexForError(error);
      totalProcessed++;

      if (totalProcessed % 50 === 0) {
        const elapsed = (Date.now() - startTime) / 1000;
        const rate = totalProcessed / elapsed;
        const remaining = errors.length - totalProcessed;
        const eta = remaining / rate;

        process.stdout.write(`\r   Processed: ${totalProcessed}/${errors.length} | Rate: ${rate.toFixed(1)}/s | ETA: ${Math.ceil(eta)}s`);
      }
    }
  }

  console.log('\n\n✅ Top-K index built successfully!');

  // Print statistics
  await printStatistics();

  await redis.quit();
  await db.end();
}

async function createIndexTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS error_topk_index (
      error_id INTEGER NOT NULL,
      similar_id INTEGER NOT NULL,
      similarity FLOAT NOT NULL,
      rank INTEGER NOT NULL,
      source_match BOOLEAN NOT NULL DEFAULT FALSE,
      created_at TIMESTAMP DEFAULT NOW(),
      PRIMARY KEY (error_id, rank)
    )
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_topk_error_id
    ON error_topk_index(error_id)
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_topk_similarity
    ON error_topk_index(similarity DESC)
  `);

  await db.query(`
    CREATE INDEX IF NOT EXISTS idx_topk_matches
    ON error_topk_index(source_match)
  `);

  console.log('✅ Index table ready\n');
}async function buildIndexForError(error) {
  // Find top-K similar errors
  const { rows: similar } = await db.query(`
    SELECT
      e.id,
      e.source,
      1 - (e.embedding <=> $1::vector) AS similarity
    FROM raw_error_embeddings e
    WHERE e.id != $2
      AND e.embedding IS NOT NULL
    ORDER BY e.embedding <=> $1::vector
    LIMIT $3
  `, [error.embedding, error.id, CONFIG.topK]);

  // Insert into index with metadata
  for (let rank = 0; rank < similar.length; rank++) {
    const sim = similar[rank];
    const sourceMatch = error.source === sim.source;

    await db.query(`
      INSERT INTO error_topk_index (error_id, similar_id, similarity, rank, source_match)
      VALUES ($1, $2, $3, $4, $5)
    `, [error.id, sim.id, sim.similarity, rank + 1, sourceMatch]);
  }

  // Cache top-5 in Redis for instant access
  const top5 = similar.slice(0, 5).map(s => ({
    id: s.id,
    similarity: s.similarity,
    source: s.source
  }));

  const cacheKey = `topk:${error.id}`;
  await redis.setEx(cacheKey, 86400, JSON.stringify(top5)); // 1 day TTL
}

async function printStatistics() {
  const stats = await db.query(`
    SELECT
      COUNT(DISTINCT error_id) as total_errors,
      COUNT(*) as total_relationships,
      AVG(similarity) as avg_similarity,
      MIN(similarity) as min_similarity,
      MAX(similarity) as max_similarity,
      SUM(CASE WHEN source_match THEN 1 ELSE 0 END) as same_source
    FROM error_topk_index
  `);

  const row = stats.rows[0];

  console.log('📊 Index Statistics:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`Total errors indexed: ${row.total_errors}`);
  console.log(`Total relationships: ${row.total_relationships}`);
  console.log(`Avg neighbors per error: ${(row.total_relationships / row.total_errors).toFixed(1)}`);
  console.log(`\nSimilarity Range:`);
  console.log(`  Min: ${parseFloat(row.min_similarity).toFixed(4)}`);
  console.log(`  Avg: ${parseFloat(row.avg_similarity).toFixed(4)}`);
  console.log(`  Max: ${parseFloat(row.max_similarity).toFixed(4)}`);
  console.log(`\nMatch Statistics:`);
  console.log(`  Same source: ${row.same_source} (${((row.same_source / row.total_relationships) * 100).toFixed(1)}%)`);

  const cacheSize = await redis.dbSize();
  console.log(`\nRedis cache: ${cacheSize} keys`);
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
