#!/usr/bin/env node
/**
 * Phase 89: Robust Svelte Incremental Embedder
 *
 * Features:
 * 1. Incremental embedding (no deletion)
 * 2. Redis-cached embeddings
 * 3. Batch processing with progress tracking
 * 4. Uses Phase 14 Master Env defaults
 */

import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import ollama from 'ollama';
import pg from 'pg';
import { createClient } from 'redis';

const { Pool } = pg;

const CONFIG = {
  postgres: {
    host: process.env.PGHOST || '127.0.0.1',
    port: parseInt(process.env.PGPORT || '5434'),
    database: process.env.PGDATABASE || 'legal_ai_db',
    user: process.env.PGUSER || 'legal_admin',
    password: process.env.PGPASSWORD || '123456'
  },
  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379')
  },
  ollama: {
    host: process.env.OLLAMA_URL || 'http://localhost:11434',
    embeddingModel: process.env.EMBEDDING_MODEL || 'embeddinggemma:latest'
  },
  batchSize: 50,
  checkpointInterval: 1000,
  checkpointFile: 'reports/svelte-reembed-checkpoint.json'
};

let db, redis;

async function main() {
  console.log('🚀 Phase 89: Robust Svelte Incremental Embedder\n');

  // Connect
  db = new Pool(CONFIG.postgres);

  try {
    redis = createClient({
      url: `redis://${CONFIG.redis.host}:${CONFIG.redis.port}`
    });
    await redis.connect();
    console.log('✅ Connected to Postgres & Redis\n');
  } catch (err) {
    console.warn('⚠️  Redis connection failed, continuing without cache:', err.message);
  }

  // Parse all errors from JSON
  console.log('📂 Parsing svelte-check-errors.json...');
  const errors = parseErrorFile();
  console.log(`   ✅ Parsed ${errors.length.toLocaleString()} errors\n`);

  // Ensure schema
  await ensureSchema();

  // Load existing hashes to avoid duplicates
  const existingHashes = await loadExistingHashes();
  console.log(`📊 Found ${existingHashes.size.toLocaleString()} existing embeddings in database\n`);

  // Filter out unchanged errors
  const toProcess = errors.filter(error => {
    const hash = hashError(error);
    return !existingHashes.has(hash);
  });

  console.log(`📈 Change Analysis:`);
  console.log(`   🆕 New/Changed errors: ${toProcess.length.toLocaleString()}`);
  console.log(`   ✅ Unchanged: ${(errors.length - toProcess.length).toLocaleString()}\n`);

  if (toProcess.length === 0) {
    console.log('✅ All embeddings up to date!\n');
    await printStats();
    await cleanup();
    return;
  }

  // Process in batches
  console.log(`🔄 Embedding ${toProcess.length.toLocaleString()} errors...\n`);

  let totalEmbedded = 0;
  let cacheHits = 0;
  let cacheMisses = 0;
  const startTime = Date.now();

  for (let i = 0; i < toProcess.length; i += CONFIG.batchSize) {
    const batch = toProcess.slice(i, i + CONFIG.batchSize);

    await Promise.all(batch.map(async (error) => {
      const hash = hashError(error);

      // Generate embedding (cached)
      let embedding;
      if (redis) {
        const cached = await redis.get(`emb:${hash}`);
        if (cached) {
          embedding = JSON.parse(cached);
          cacheHits++;
        }
      }

      if (!embedding) {
        try {
          const result = await ollama.embeddings({
            model: CONFIG.ollama.embeddingModel,
            prompt: error.fullText
          });
          embedding = result.embedding;
          cacheMisses++;

          if (redis && embedding) {
            await redis.set(`emb:${hash}`, JSON.stringify(embedding));
          }
        } catch (err) {
          console.warn(`\n⚠️  Embedding failed for ${error.filePath}: ${err.message}`);
          return;
        }
      }

      // Insert into database
      try {
        await db.query(`
          INSERT INTO raw_error_embeddings (source, file_path, line, message, raw_text, embedding, content_hash, tags)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
          ON CONFLICT (source, file_path, line, content_hash) DO NOTHING
        `, [
          'svelte-check',
          error.filePath,
          error.line,
          error.message,
          error.fullText,
          JSON.stringify(embedding),
          hash,
          error.tags || []
        ]);

        totalEmbedded++;
      } catch (err) {
        console.warn(`\n⚠️  DB insert failed: ${err.message}`);
      }
    }));

    // Progress
    const progress = ((i + batch.length) / toProcess.length * 100).toFixed(2);
    const elapsed = (Date.now() - startTime) / 1000;
    const rate = (totalEmbedded / elapsed).toFixed(1);
    const remaining = toProcess.length - totalEmbedded;
    const eta = Math.ceil(remaining / rate);
    const cacheRate = (cacheHits + cacheMisses) > 0 ? ((cacheHits / (cacheHits + cacheMisses)) * 100).toFixed(1) : 0;

    process.stdout.write(`\r   ${progress}% | ${totalEmbedded.toLocaleString()} / ${toProcess.length.toLocaleString()} | ${rate}/s | ETA: ${eta}s | Cache: ${cacheRate}%`);
  }

  console.log('\n');
  await printStats();
  await cleanup();
}

async function ensureSchema() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS raw_error_embeddings (
      id SERIAL PRIMARY KEY,
      source TEXT NOT NULL,
      file_path TEXT NOT NULL,
      line INTEGER,
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
  `);
}

async function loadExistingHashes() {
  const result = await db.query(`SELECT content_hash FROM raw_error_embeddings WHERE source = 'svelte-check'`);
  return new Set(result.rows.map(r => r.content_hash));
}

function hashError(error) {
  return createHash('sha256').update(`${error.filePath}:${error.line}:${error.fullText}`).digest('hex');
}

function parseErrorFile() {
  console.log('   Reading file...');
  const content = readFileSync('svelte-check-errors.json', 'utf-8');
  console.log(`   File read, length: ${content.length.toLocaleString()} chars`);
  const lines = content.split(/\r?\n/);
  console.log(`   Split into ${lines.length.toLocaleString()} lines`);
  const errors = [];

  let currentFile = null;
  let currentLine = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    if (i < 20) console.log(`   Line ${i}: [${line}]`);

    // Format 1: path:line:col
    // Error: message
    const pathMatch = line.match(/(.+):(\d+):(\d+)$/);
    if (i === 3) console.log(`   Line 3 Match: ${pathMatch ? 'YES' : 'NO'}`);
    if (pathMatch && !line.includes(' ')) {
      currentFile = pathMatch[1].replace(/\\\\/g, '/');
      currentLine = parseInt(pathMatch[2]);

      // Look ahead for the error message
      let j = i + 1;
      while (j < lines.length && j < i + 5) {
        const nextLine = lines[j].trim();
        if (nextLine.startsWith('Error:') || nextLine.startsWith('Warning:')) {
          errors.push({
            filePath: currentFile,
            line: currentLine,
            message: nextLine,
            fullText: `${currentFile}:${currentLine} ${nextLine}`,
            tags: [nextLine.split(':')[0].toLowerCase()]
          });
          break;
        }
        j++;
      }
      continue;
    }

    // Format 2: path:line:col - error TSXXXX: message
    const altMatch = line.match(/^([^\s:]+):(\d+):(\d+)\s+-\s+(error|warning)\s+(.*)$/);
    if (altMatch) {
      errors.push({
        filePath: altMatch[1].replace(/\\\\/g, '/'),
        line: parseInt(altMatch[2]),
        message: altMatch[5],
        fullText: line,
        tags: [altMatch[4]]
      });
    }
  }

  return errors;
}
async function printStats() {
  const stats = await db.query(`
    SELECT
      source,
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE embedding IS NOT NULL) as embedded
    FROM raw_error_embeddings
    GROUP BY source
    ORDER BY source
  `);

  console.log('\n📊 Final Statistics:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Source         | Total   | Embedded');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  for (const row of stats.rows) {
    const src = (row.source || '').padEnd(14);
    const total = row.total.toString().padStart(7);
    const embedded = row.embedded.toString().padStart(8);
    console.log(`${src} | ${total} | ${embedded}`);
  }
}

async function cleanup() {
  if (redis) await redis.quit();
  if (db) await db.end();
}

main().catch(async err => {
  console.error('\n❌ Error:', err);
  await cleanup();
  process.exit(1);
});
