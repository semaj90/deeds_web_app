#!/usr/bin/env node
/**
 * Phase 89: Enhanced Raw Text Embedder with Caching
 *
 * Features:
 * 1. Redis cache for embeddings (avoid re-embedding same text)
 * 2. Language-specific caching (TS vs Svelte patterns)
 * 3. Top-K inverse index for fast similarity lookup
 * 4. Web search integration metadata
 * 5. Batch processing with progress tracking
 */

import { createHash } from 'crypto';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import ollama from 'ollama';
import pg from 'pg';
import { createClient } from 'redis';

const { Pool } = pg;

const CONFIG = {
  postgres: {
    host: '127.0.0.1',
    port: 5434,
    database: 'legal_ai_db',
    user: 'legal_admin',
    password: '123456'
  },
  redis: {
    url: 'redis://127.0.0.1:6379',
    prefix: 'phase89:',
    ttl: 86400 * 7 // 7 days cache
  },
  ollama: {
    host: 'http://localhost:11434',
    embeddingModel: 'embeddinggemma'
  },
  chunking: {
    minLineLength: 10,
    batchSize: 100
  },
  indexing: {
    topK: 100, // Store top-100 similar errors for each error
    rebuildInterval: 1000 // Rebuild index every 1000 new embeddings
  }
};

let db;
let redis;
let cacheHits = 0;
let cacheMisses = 0;

async function main() {
  console.log('🧮 Phase 89: Enhanced Raw Text Embedder with Caching\n');

  // Connect to databases
  db = new Pool(CONFIG.postgres);
  console.log('✅ Connected to Postgres (legal_ai_db @ 5434)');

  redis = createClient({ url: CONFIG.redis.url });
  redis.on('error', (err) => console.warn('Redis connection error:', err.message));
  await redis.connect();
  console.log('✅ Connected to Redis (127.0.0.1:6379)\n');

  // Create enhanced schema
  await createEnhancedSchema();

  // Process errors
  await processErrorFiles();

  // Build top-K index
  await buildTopKIndex();

  // Show stats
  await showStatistics();

  await redis.quit();
  await db.end();
  console.log('\n✅ Enhanced embedding complete!');
}

/**
 * Create enhanced schema with metadata and indexes
 */
async function createEnhancedSchema() {
  console.log('📋 Creating enhanced schema...');

  // Main embeddings table
  await db.query(`
    CREATE TABLE IF NOT EXISTS raw_error_embeddings (
      id SERIAL PRIMARY KEY,
      source TEXT NOT NULL,
      line_number INTEGER,
      raw_text TEXT NOT NULL,
      text_hash TEXT NOT NULL,
      language TEXT,
      error_code TEXT,
      file_path TEXT,
      embedding vector(768),
      metadata JSONB,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(text_hash)
    )
  `);

  // Top-K similarity index (precomputed neighbors)
  await db.query(`
    CREATE TABLE IF NOT EXISTS error_similarity_index (
      error_id INTEGER REFERENCES raw_error_embeddings(id) ON DELETE CASCADE,
      similar_error_id INTEGER REFERENCES raw_error_embeddings(id) ON DELETE CASCADE,
      similarity_score FLOAT NOT NULL,
      rank INTEGER NOT NULL,
      PRIMARY KEY (error_id, similar_error_id)
    )
  `);

  // Language statistics
  await db.query(`
    CREATE TABLE IF NOT EXISTS language_stats (
      language TEXT PRIMARY KEY,
      total_errors INTEGER DEFAULT 0,
      unique_patterns INTEGER DEFAULT 0,
      avg_similarity FLOAT,
      last_updated TIMESTAMP DEFAULT NOW()
    )
  `);

  // Create indexes
  await db.query(`CREATE INDEX IF NOT EXISTS idx_raw_error_source ON raw_error_embeddings(source)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_raw_error_language ON raw_error_embeddings(language)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_raw_error_code ON raw_error_embeddings(error_code)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_raw_error_hash ON raw_error_embeddings(text_hash)`);
  await db.query(`CREATE INDEX IF NOT EXISTS idx_similarity_rank ON error_similarity_index(error_id, rank)`);

  // Vector index (ivfflat for fast cosine similarity)
  try {
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_raw_error_embedding_cosine
      ON raw_error_embeddings
      USING ivfflat (embedding vector_cosine_ops)
      WITH (lists = 100)
    `);
  } catch (err) {
    // Index might already exist or vector extension not ready
    console.warn('   ⚠️  Vector index creation deferred:', err.message.split('\n')[0]);
  }

  console.log('   ✅ Schema ready\n');
}

/**
 * Process error files with caching
 */
async function processErrorFiles() {
  // TSC errors
  console.log('📂 Reading TSC errors from reports/tsc-errors.txt...');
  const tscContent = readFileSync('reports/tsc-errors.txt', 'utf-8');
  const tscLines = tscContent.split('\n').filter(line => line.trim().length > CONFIG.chunking.minLineLength);
  console.log(`   Found ${tscLines.length} non-empty lines`);
  await ingestAndEmbedWithCache('tsc', tscLines, 'typescript');

  // Svelte-check errors
  console.log('\n📂 Reading svelte-check errors from reports/svelte-check-errors.json...');
  const svelteContent = readFileSync('reports/svelte-check-errors.json', 'utf-8');
  const svelteLines = svelteContent.split('\n').filter(line => line.trim().length > CONFIG.chunking.minLineLength);
  console.log(`   Found ${svelteLines.length} non-empty lines`);
  await ingestAndEmbedWithCache('svelte-check', svelteLines, 'svelte');
}

/**
 * Ingest with Redis caching
 */
async function ingestAndEmbedWithCache(source, lines, language) {
  const batches = [];
  for (let i = 0; i < lines.length; i += CONFIG.chunking.batchSize) {
    batches.push(lines.slice(i, i + CONFIG.chunking.batchSize));
  }

  console.log(`   Processing ${batches.length} batches (${CONFIG.chunking.batchSize} errors/batch)...`);

  for (let batchIdx = 0; batchIdx < batches.length; batchIdx++) {
    const batch = batches[batchIdx];

    for (let lineIdx = 0; lineIdx < batch.length; lineIdx++) {
      const line = batch[lineIdx];
      const textHash = createHash('sha256').update(line).digest('hex').substring(0, 16);

      // Extract metadata
      const metadata = extractMetadata(line, source);

      // Check if already embedded (by hash)
      const existing = await db.query(
        'SELECT id, embedding FROM raw_error_embeddings WHERE text_hash = $1',
        [textHash]
      );

      if (existing.rows.length > 0) {
        continue; // Skip duplicates
      }

      // Check Redis cache
      const cacheKey = `${CONFIG.redis.prefix}embed:${textHash}`;
      let embedding;

      try {
        const cached = await redis.get(cacheKey);
        if (cached) {
          embedding = JSON.parse(cached);
          cacheHits++;
        } else {
          // Generate new embedding
          const result = await ollama.embeddings({
            model: CONFIG.ollama.embeddingModel,
            prompt: line
          });
          embedding = result.embedding;
          cacheMisses++;

          // Cache for future use
          await redis.setEx(cacheKey, CONFIG.redis.ttl, JSON.stringify(embedding));
        }
      } catch (err) {
        console.warn(`      ⚠️  Cache error for line ${lineIdx}: ${err.message}`);
        // Fallback to direct embedding
        const result = await ollama.embeddings({
          model: CONFIG.ollama.embeddingModel,
          prompt: line
        });
        embedding = result.embedding;
        cacheMisses++;
      }

      // Insert to database
      await db.query(`
        INSERT INTO raw_error_embeddings
        (source, line_number, raw_text, text_hash, language, error_code, file_path, embedding, metadata)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (text_hash) DO NOTHING
      `, [
        source,
        (batchIdx * CONFIG.chunking.batchSize) + lineIdx,
        line,
        textHash,
        metadata.language || language,
        metadata.errorCode,
        metadata.filePath,
        JSON.stringify(embedding),
        JSON.stringify(metadata)
      ]);
    }

    // Progress
    const progress = ((batchIdx + 1) / batches.length * 100).toFixed(1);
    const cacheRate = cacheHits > 0 ? ((cacheHits / (cacheHits + cacheMisses)) * 100).toFixed(1) : 0;
    process.stdout.write(`\r   Progress: ${progress}% (${batchIdx + 1}/${batches.length} batches) | Cache: ${cacheRate}% hits`);
  }

  console.log('\n   ✅ Batch complete');
}

/**
 * Extract metadata from error line
 */
function extractMetadata(line, source) {
  const metadata = { source };

  // Extract error code (TS1234 or just ERROR)
  const codeMatch = line.match(/\b(TS\d+|ERROR)\b/);
  if (codeMatch) {
    metadata.errorCode = codeMatch[1];
  }

  // Extract file path
  const fileMatch = line.match(/"([^"]+\.(ts|svelte|js|mjs))"/);
  if (fileMatch) {
    metadata.filePath = fileMatch[1];
  } else {
    const pathMatch = line.match(/([\w\/-]+\.(ts|svelte|js|mjs))/);
    if (pathMatch) {
      metadata.filePath = pathMatch[1];
    }
  }

  // Detect language from context
  if (line.includes('.svelte')) {
    metadata.language = 'svelte';
  } else if (line.includes('.ts')) {
    metadata.language = 'typescript';
  } else if (line.includes('.js') || line.includes('.mjs')) {
    metadata.language = 'javascript';
  }

  // Extract line:col
  const lineColMatch = line.match(/(\d+):(\d+)/);
  if (lineColMatch) {
    metadata.line = parseInt(lineColMatch[1]);
    metadata.col = parseInt(lineColMatch[2]);
  }

  return metadata;
}

/**
 * Build top-K similarity index for fast lookups
 */
async function buildTopKIndex() {
  console.log('\n🔗 Building top-K similarity index...');

  const result = await db.query('SELECT COUNT(*) FROM raw_error_embeddings WHERE embedding IS NOT NULL');
  const totalErrors = parseInt(result.rows[0].count);

  if (totalErrors < 10) {
    console.log('   ⏭️  Not enough embeddings yet, skipping index build');
    return;
  }

  console.log(`   Building index for ${totalErrors} embeddings...`);

  // Clear old index
  await db.query('TRUNCATE error_similarity_index');

  // For each error, find top-K similar errors
  const errors = await db.query(`
    SELECT id, embedding
    FROM raw_error_embeddings
    WHERE embedding IS NOT NULL
    ORDER BY id
  `);

  for (let i = 0; i < errors.rows.length; i++) {
    const error = errors.rows[i];

    // Find top-K similar
    const similar = await db.query(`
      SELECT
        id,
        1 - (embedding <=> $1::vector) AS similarity
      FROM raw_error_embeddings
      WHERE id != $2 AND embedding IS NOT NULL
      ORDER BY embedding <=> $1::vector
      LIMIT $3
    `, [error.embedding, error.id, CONFIG.indexing.topK]);

    // Insert to index
    for (let rank = 0; rank < similar.rows.length; rank++) {
      await db.query(`
        INSERT INTO error_similarity_index (error_id, similar_error_id, similarity_score, rank)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (error_id, similar_error_id) DO UPDATE SET
          similarity_score = $3,
          rank = $4
      `, [error.id, similar.rows[rank].id, similar.rows[rank].similarity, rank + 1]);
    }

    if ((i + 1) % 100 === 0) {
      process.stdout.write(`\r   Indexed: ${i + 1}/${errors.rows.length} errors`);
    }
  }

  console.log(`\n   ✅ Top-K index built (${CONFIG.indexing.topK} neighbors per error)`);
}

/**
 * Show statistics
 */
async function showStatistics() {
  console.log('\n📊 Statistics:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // By source
  const bySource = await db.query(`
    SELECT
      source,
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE embedding IS NOT NULL) as embedded,
      COUNT(DISTINCT language) as languages,
      COUNT(DISTINCT error_code) as unique_codes
    FROM raw_error_embeddings
    GROUP BY source
    ORDER BY total DESC
  `);

  for (const row of bySource.rows) {
    console.log(`  ${row.source.padEnd(15)} ${row.total.toLocaleString().padStart(8)} total | ${row.embedded.toLocaleString().padStart(8)} embedded | ${row.languages} langs | ${row.unique_codes} codes`);
  }

  // Cache stats
  const cacheTotal = cacheHits + cacheMisses;
  const cacheRate = cacheTotal > 0 ? ((cacheHits / cacheTotal) * 100).toFixed(1) : 0;
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  Cache hits:     ${cacheHits.toLocaleString().padStart(8)} (${cacheRate}%)`);
  console.log(`  Cache misses:   ${cacheMisses.toLocaleString().padStart(8)}`);

  // Index stats
  const indexStats = await db.query('SELECT COUNT(DISTINCT error_id) as indexed_errors FROM error_similarity_index');
  console.log(`  Indexed errors: ${indexStats.rows[0].indexed_errors.toLocaleString().padStart(8)}`);

  const total = await db.query('SELECT COUNT(*) as total FROM raw_error_embeddings');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  TOTAL          ${total.rows[0].total.toLocaleString().padStart(8)} error chunks`);
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
