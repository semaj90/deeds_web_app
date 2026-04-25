#!/usr/bin/env node
// Phase 89: Incremental Embedder - NO DELETION, only adds/updates
// Preserves existing embeddings, maintains version history, learns from changes

import { createHash } from 'crypto';
import { readFile } from 'fs/promises';
import pg from 'pg';
import AdaptiveChunker, { ChunkStrategy } from './lib/phase89-adaptive-chunker.mjs';
import { redisFromEnv } from './lib/phase89-cache.mjs';
import { extractTags } from './lib/phase89-cuda-tags.mjs';
import { embedCached } from './lib/phase89-embed.mjs';

const { Pool } = pg;

class IncrementalEmbedder {
  constructor() {
    this.pgPool = null;
    this.redis = null;
    this.model = process.env.EMBEDDING_MODEL || 'embeddinggemma:latest';
    this.chunker = new AdaptiveChunker({
      baseChunkSize: 500,
      overlapLines: 50,
      strategy: ChunkStrategy.AST_AWARE
    });
  }

  async connect() {
    // Phase66 Docker container credentials
    this.pgPool = new Pool({
      host: process.env.PGHOST || 'localhost',
      port: parseInt(process.env.PGPORT || '5434'),
      database: process.env.PGDATABASE || 'legal_ai_db',
      user: process.env.PGUSER || 'legal_admin',
      password: process.env.PGPASSWORD || '123456'
    });

    this.redis = await redisFromEnv();
    console.log('✅ Connected to Postgres & Redis\n');
  }

  /**
   * Ensure schema includes version tracking
   */
  async ensureSchema() {
    await this.pgPool.query(`
      CREATE TABLE IF NOT EXISTS raw_error_embeddings (
        id SERIAL PRIMARY KEY,
        source TEXT NOT NULL,
        file_path TEXT NOT NULL,
        line INTEGER,
        error_code TEXT,
        message TEXT,
        raw_text TEXT NOT NULL,
        embedding vector(768),
        tags TEXT[],
        content_hash TEXT NOT NULL,
        version INTEGER DEFAULT 1,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),

        UNIQUE(source, file_path, line, content_hash)
      );

      CREATE INDEX IF NOT EXISTS idx_embeddings_source ON raw_error_embeddings(source);
      CREATE INDEX IF NOT EXISTS idx_embeddings_hash ON raw_error_embeddings(content_hash);
      CREATE INDEX IF NOT EXISTS idx_embeddings_version ON raw_error_embeddings(version);
    `);

    // Create version history table
    await this.pgPool.query(`
      CREATE TABLE IF NOT EXISTS error_embedding_history (
        id SERIAL PRIMARY KEY,
        error_id INTEGER REFERENCES raw_error_embeddings(id),
        version INTEGER NOT NULL,
        raw_text TEXT NOT NULL,
        embedding vector(768),
        tags TEXT[],
        content_hash TEXT NOT NULL,
        changed_at TIMESTAMPTZ DEFAULT NOW(),
        change_type TEXT NOT NULL -- 'created', 'updated', 'reembedded'
      );

      CREATE INDEX IF NOT EXISTS idx_history_error_id ON error_embedding_history(error_id);
    `);
  }

  /**
   * Hash error content for change detection
   */
  hashError(error) {
    const content = `${error.filePath}:${error.line}:${error.message}`;
    return createHash('sha256').update(content).digest('hex');
  }

  /**
   * Load existing errors from database
   */
  async loadExisting(source) {
    const result = await this.pgPool.query(
      `SELECT id, file_path, line, content_hash, raw_text, version, embedding IS NOT NULL as has_embedding
       FROM raw_error_embeddings
       WHERE source = $1`,
      [source]
    );

    const existing = new Map();
    for (const row of result.rows) {
      const key = `${row.file_path}:${row.line}`;
      existing.set(key, {
        id: row.id,
        contentHash: row.content_hash,
        rawText: row.raw_text,
        version: row.version,
        hasEmbedding: row.has_embedding
      });
    }

    return existing;
  }

  /**
   * Incremental embedding: only process new/changed errors
   */
  async embedIncremental(source, errorsJsonPath) {
    console.log(`🚀 Phase 89: Incremental Embedder (${source})\n`);

    // Parse new errors
    const content = await readFile(errorsJsonPath, 'utf-8');
    const newErrors = JSON.parse(content);
    console.log(`📂 Parsed ${newErrors.length} errors from JSON\n`);

    // Load existing errors
    const existing = await this.loadExisting(source);
    console.log(`📊 Found ${existing.size} existing errors in database\n`);

    // Categorize errors
    const toCreate = [];
    const toUpdate = [];
    const unchanged = [];
    const toReembed = []; // Existing but missing embeddings

    for (const error of newErrors) {
      const key = `${error.filePath}:${error.line}`;
      const hash = this.hashError(error);
      const existingError = existing.get(key);

      if (!existingError) {
        // New error
        toCreate.push({ ...error, hash });
      } else if (existingError.contentHash !== hash) {
        // Changed error
        toUpdate.push({
          ...error,
          hash,
          existingId: existingError.id,
          version: existingError.version + 1
        });
      } else if (!existingError.hasEmbedding) {
        // Unchanged but missing embedding
        toReembed.push({ ...error, hash, existingId: existingError.id });
      } else {
        // Completely unchanged
        unchanged.push(error);
      }
    }

    console.log(`📈 Change Analysis:`);
    console.log(`   🆕 New errors: ${toCreate.length}`);
    console.log(`   🔄 Updated errors: ${toUpdate.length}`);
    console.log(`   ⚡ Missing embeddings: ${toReembed.length}`);
    console.log(`   ✅ Unchanged: ${unchanged.length}\n`);

    // Process in batches
    const allToProcess = [...toCreate, ...toUpdate, ...toReembed];

    if (allToProcess.length === 0) {
      console.log('✅ All embeddings up to date!\n');
      return;
    }

    console.log(`🔄 Processing ${allToProcess.length} errors...\n`);

    let processed = 0;
    let cacheHits = 0;
    const batchSize = 50;

    for (let i = 0; i < allToProcess.length; i += batchSize) {
      const batch = allToProcess.slice(i, i + batchSize);

      await Promise.all(batch.map(async (error) => {
        try {
          // Extract tags
          const tags = extractTags(error.filePath, error.message);

          // Generate embedding (cached)
          const embeddingResult = await embedCached(
            error.message,
            this.model,
            this.redis
          );

          // Check if it's a new error or update
          if (toCreate.includes(error)) {
            // Insert new error
            await this.pgPool.query(
              `INSERT INTO raw_error_embeddings
               (source, file_path, line, error_code, message, raw_text, embedding, tags, content_hash, version)
               VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 1)`,
              [
                source,
                error.filePath,
                error.line,
                error.code || null,
                error.message,
                error.message,
                JSON.stringify(embeddingResult.embedding),
                tags,
                error.hash
              ]
            );
          } else if (toUpdate.includes(error) || toReembed.includes(error)) {
            // Update existing error
            const changeType = toUpdate.includes(error) ? 'updated' : 'reembedded';

            // Archive old version to history
            await this.pgPool.query(
              `INSERT INTO error_embedding_history (error_id, version, raw_text, embedding, tags, content_hash, change_type)
               SELECT id, version, raw_text, embedding, tags, content_hash, $1
               FROM raw_error_embeddings
               WHERE id = $2`,
              [changeType, error.existingId]
            );

            // Update current version
            await this.pgPool.query(
              `UPDATE raw_error_embeddings
               SET raw_text = $1,
                   embedding = $2,
                   tags = $3,
                   content_hash = $4,
                   version = version + 1,
                   updated_at = NOW()
               WHERE id = $5`,
              [
                error.message,
                JSON.stringify(embeddingResult.embedding),
                tags,
                error.hash,
                error.existingId
              ]
            );
          }

          if (embeddingResult.cached) cacheHits++;
          processed++;

        } catch (err) {
          console.error(`   ❌ Error processing ${error.filePath}:${error.line}: ${err.message}`);
        }
      }));

      // Progress
      const pct = ((i + batch.length) / allToProcess.length * 100).toFixed(2);
      const rate = (processed / ((Date.now() - this.startTime) / 1000)).toFixed(1);
      const cachePct = ((cacheHits / processed) * 100).toFixed(1);

      process.stdout.write(`\r   ${pct}% | ${processed} / ${allToProcess.length} | ${rate}/s | Cache: ${cachePct}%`);
    }

    console.log('\n\n✅ Incremental embedding complete!\n');

    // Summary
    const stats = await this.pgPool.query(
      `SELECT
         COUNT(*) as total,
         COUNT(DISTINCT file_path) as files,
         AVG(version) as avg_version,
         MAX(version) as max_version
       FROM raw_error_embeddings
       WHERE source = $1`,
      [source]
    );

    console.log('📊 Final Statistics:');
    console.log(`   Total errors: ${stats.rows[0].total}`);
    console.log(`   Files: ${stats.rows[0].files}`);
    console.log(`   Avg version: ${parseFloat(stats.rows[0].avg_version).toFixed(2)}`);
    console.log(`   Max version: ${stats.rows[0].max_version}\n`);
  }

  /**
   * Get version history for an error
   */
  async getHistory(filePath, line) {
    const result = await this.pgPool.query(
      `SELECT
         h.version,
         h.raw_text,
         h.change_type,
         h.changed_at
       FROM error_embedding_history h
       JOIN raw_error_embeddings e ON h.error_id = e.id
       WHERE e.file_path = $1 AND e.line = $2
       ORDER BY h.version ASC`,
      [filePath, line]
    );

    return result.rows;
  }

  async close() {
    await this.pgPool?.end();
    await this.redis?.quit();
  }
}

// Main execution
const embedder = new IncrementalEmbedder();

try {
  embedder.startTime = Date.now();

  await embedder.connect();
  await embedder.ensureSchema();

  const source = process.argv[2] || 'svelte-check';
  const jsonPath = process.argv[3] || '../svelte-check-errors.json';

  await embedder.embedIncremental(source, jsonPath);

} catch (error) {
  console.error('❌ Fatal error:', error);
  process.exit(1);
} finally {
  await embedder.close();
}
