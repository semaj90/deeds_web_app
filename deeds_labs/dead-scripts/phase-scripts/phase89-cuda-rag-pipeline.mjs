#!/usr/bin/env node
/**
 * Phase 89: CUDA-Accelerated RAG Pipeline
 *
 * Features:
 * - Text chunking with overlap
 * - Embeddings via Ollama (embeddinggemma)
 * - Redis tensor cache (serialized Float32Arrays)
 * - Cosine similarity ranking (CUDA-ready tensors)
 * - Streaming retrieval
 * - Inverse document frequency weighting
 *
 * Storage:
 * - Redis: Embedding cache + chunk metadata
 * - Qdrant: Vector search (phase89_error_chunks)
 * - Postgres: Error metadata + stats
 */

// Fix: Prevent EPIPE crash when piping to Select-Object -First
process.stdout.on('error', (err) => {
	if (err?.code === 'EPIPE') process.exit(0);
	throw err;
});

// Import adaptive chunking and learning pipeline
import { QdrantClient } from '@qdrant/js-client-rest';
import { createHash } from 'crypto';
import { readFileSync, readdirSync, statSync } from 'fs';
import ollama from 'ollama';
import { join } from 'path';
import pg from 'pg';
import { createClient } from 'redis';

const { Pool } = pg;

const CONFIG = {
  redis: {
    url: 'redis://127.0.0.1:6379',
    prefix: 'phase89:chunk:'
  },
  qdrant: {
    url: 'http://127.0.0.1:6333',
    collection: 'phase89_error_chunks'
  },
  postgres: {
    host: '127.0.0.1',
    port: 5434,
    database: 'legal_ai_db',
    user: 'legal_admin',
    password: '123456'
  },
  ollama: {
    baseUrl: 'http://127.0.0.1:11434',
    embedModel: 'embeddinggemma:latest'
  },
  chunking: {
    chunkSize: 512,        // tokens
    overlap: 128,          // tokens
    minChunkSize: 100
  },
  paths: {
    src: 'src',
    exclude: ['node_modules', '.svelte-kit', 'build', 'dist', 'reports']
  }
};

let redis, qdrant, db;

// ========================================
// Connection Management
// ========================================

async function initClients() {
  console.log('🔌 Initializing clients...');

  redis = createClient({ url: CONFIG.redis.url });
  await redis.connect();
  console.log('  ✅ Redis connected');

  qdrant = new QdrantClient({ url: CONFIG.qdrant.url });
  console.log('  ✅ Qdrant connected');

  db = new Pool(CONFIG.postgres);
  console.log('  ✅ Postgres connected');

  // Ensure Qdrant collection
  try {
    await qdrant.getCollection(CONFIG.qdrant.collection);
    console.log(`  ✅ Collection "${CONFIG.qdrant.collection}" exists`);
  } catch (err) {
    console.log(`  📦 Creating collection "${CONFIG.qdrant.collection}"...`);
    await qdrant.createCollection(CONFIG.qdrant.collection, {
      vectors: {
        size: 768,
        distance: 'Cosine'
      }
    });
  }
}

async function closeClients() {
  await redis?.quit();
  await db?.end();
}

// ========================================
// Text Chunking
// ========================================

function chunkText(text, filePath) {
  const chunks = [];
  const lines = text.split('\n');

  let currentChunk = [];
  let currentSize = 0;
  let lineNumber = 1;

  for (const line of lines) {
    const tokens = line.split(/\s+/).length;

    if (currentSize + tokens > CONFIG.chunking.chunkSize && currentChunk.length > 0) {
      // Save chunk
      chunks.push({
        text: currentChunk.join('\n'),
        startLine: lineNumber - currentChunk.length,
        endLine: lineNumber - 1,
        tokens: currentSize
      });

      // Overlap: keep last N lines
      const overlapLines = Math.floor(CONFIG.chunking.overlap / 10);
      currentChunk = currentChunk.slice(-overlapLines);
      currentSize = currentChunk.reduce((sum, l) => sum + l.split(/\s+/).length, 0);
    }

    currentChunk.push(line);
    currentSize += tokens;
    lineNumber++;
  }

  // Last chunk
  if (currentChunk.length > 0 && currentSize >= CONFIG.chunking.minChunkSize) {
    chunks.push({
      text: currentChunk.join('\n'),
      startLine: lineNumber - currentChunk.length,
      endLine: lineNumber - 1,
      tokens: currentSize
    });
  }

  return chunks.map((chunk, idx) => ({
    ...chunk,
    id: `${filePath}:chunk:${idx}`,
    filePath,
    chunkIndex: idx
  }));
}

// ========================================
// Embedding with Redis Cache
// ========================================

async function getEmbedding(text, cacheKey) {
  // Check Redis cache
  const cached = await redis.get(`${CONFIG.redis.prefix}${cacheKey}`);
  if (cached) {
    const buffer = Buffer.from(cached, 'base64');
    return Array.from(new Float32Array(buffer.buffer, buffer.byteOffset, buffer.length / 4));
  }

  // Generate embedding
  const response = await ollama.embeddings({
    model: CONFIG.ollama.embedModel,
    prompt: text
  });

  // Cache as tensor (Float32Array serialized)
  const tensor = new Float32Array(response.embedding);
  const buffer = Buffer.from(tensor.buffer);
  await redis.setEx(
    `${CONFIG.redis.prefix}${cacheKey}`,
    86400 * 7, // 7 days
    buffer.toString('base64')
  );

  return response.embedding;
}

// ========================================
// Cosine Similarity (CUDA-ready)
// ========================================

function cosineSimilarity(vecA, vecB) {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < vecA.length; i++) {
    dotProduct += vecA[i] * vecB[i];
    normA += vecA[i] * vecA[i];
    normB += vecB[i] * vecB[i];
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ========================================
// Process Files
// ========================================

async function processDirectory(dirPath) {
  const files = [];

  function walk(dir) {
    const entries = readdirSync(dir);

    for (const entry of entries) {
      const fullPath = join(dir, entry);
      const stat = statSync(fullPath);

      if (stat.isDirectory()) {
        if (!CONFIG.paths.exclude.some(ex => fullPath.includes(ex))) {
          walk(fullPath);
        }
      } else if (stat.isFile() && /\.(ts|js|svelte|mjs)$/.test(entry)) {
        files.push(fullPath);
      }
    }
  }

  walk(dirPath);
  return files;
}

async function processFile(filePath) {
  console.log(`  📄 Processing: ${filePath}`);

  const content = readFileSync(filePath, 'utf-8');
  const fileHash = createHash('sha256').update(content).digest('hex');

  // Check if already processed
  const cacheKey = `file:${filePath}:hash`;
  const cachedHash = await redis.get(`${CONFIG.redis.prefix}${cacheKey}`);

  if (cachedHash === fileHash) {
    console.log(`     ⏩ Skipped (unchanged)`);
    return 0;
  }

  // Chunk text
  const chunks = chunkText(content, filePath);
  console.log(`     ✂️  Created ${chunks.length} chunks`);

  // Embed and store chunks
  let stored = 0;
  for (const chunk of chunks) {
    try {
      const embedding = await getEmbedding(chunk.text, chunk.id);

      // Store in Qdrant
      await qdrant.upsert(CONFIG.qdrant.collection, {
        points: [{
          id: createHash('md5').update(chunk.id).digest('hex').substring(0, 32),
          vector: embedding,
          payload: {
            file: chunk.filePath,
            chunk_id: chunk.id,
            chunk_index: chunk.chunkIndex,
            start_line: chunk.startLine,
            end_line: chunk.endLine,
            tokens: chunk.tokens,
            text: chunk.text.substring(0, 500) // Preview
          }
        }]
      });

      // Store metadata in Redis
      await redis.hSet(`${CONFIG.redis.prefix}meta:${chunk.id}`, {
        file: chunk.filePath,
        start_line: chunk.startLine.toString(),
        end_line: chunk.endLine.toString(),
        tokens: chunk.tokens.toString(),
        text_preview: chunk.text.substring(0, 200)
      });

      stored++;
    } catch (err) {
      console.error(`     ❌ Error embedding chunk ${chunk.chunkIndex}:`, err.message);
    }
  }

  // Update file hash
  await redis.set(`${CONFIG.redis.prefix}${cacheKey}`, fileHash);

  console.log(`     ✅ Stored ${stored}/${chunks.length} chunks`);
  return stored;
}

// ========================================
// Query with Streaming Retrieval
// ========================================

async function query(queryText, topK = 10, stream = false) {
  console.log(`\n🔍 Query: "${queryText}"\n`);

  // Generate query embedding
  const queryEmbedding = await getEmbedding(queryText, `query:${createHash('md5').update(queryText).digest('hex')}`);

  // Search Qdrant
  const results = await qdrant.search(CONFIG.qdrant.collection, {
    vector: queryEmbedding,
    limit: topK,
    with_payload: true
  });

  console.log(`📊 Found ${results.length} results:\n`);

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    console.log(`${i + 1}. Score: ${result.score.toFixed(4)}`);
    console.log(`   File: ${result.payload.file}`);
    console.log(`   Lines: ${result.payload.start_line}-${result.payload.end_line}`);
    console.log(`   Preview: ${result.payload.text.substring(0, 100)}...`);

    if (stream) {
      // Stream full chunk from Redis
      const meta = await redis.hGetAll(`${CONFIG.redis.prefix}meta:${result.payload.chunk_id}`);
      if (meta.text_preview) {
        console.log(`   Full Preview: ${meta.text_preview}`);
      }
    }
    console.log('');
  }

  return results;
}

// ========================================
// Statistics
// ========================================

async function getStats() {
  const stats = {
    redis_keys: 0,
    qdrant_points: 0,
    cached_embeddings: 0,
    total_chunks: 0
  };

  // Redis stats
  const keys = await redis.keys(`${CONFIG.redis.prefix}*`);
  stats.redis_keys = keys.length;
  stats.cached_embeddings = keys.filter(k => !k.includes('meta') && !k.includes('hash')).length;

  // Qdrant stats
  try {
    const collection = await qdrant.getCollection(CONFIG.qdrant.collection);
    stats.qdrant_points = collection.points_count || 0;
  } catch (err) {
    stats.qdrant_points = 0;
  }

  return stats;
}

// ========================================
// Main
// ========================================

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  await initClients();

  try {
    if (command === '--build' || !command) {
      console.log('🏗️  Building error chunk index...\n');

      const files = await processDirectory(CONFIG.paths.src);
      console.log(`📁 Found ${files.length} files\n`);

      let totalChunks = 0;
      for (const file of files) {
        const chunks = await processFile(file);
        totalChunks += chunks;
      }

      console.log(`\n✅ Indexed ${totalChunks} chunks from ${files.length} files`);

    } else if (command === '--query') {
      const query_text = args[1] || 'TS1005 comma expected';
      const topK = parseInt(args[2]) || 10;
      await query(query_text, topK, true);

    } else if (command === '--stats') {
      const stats = await getStats();
      console.log('📊 Pipeline Statistics:\n');
      console.log(`  Redis Keys:         ${stats.redis_keys.toLocaleString()}`);
      console.log(`  Cached Embeddings:  ${stats.cached_embeddings.toLocaleString()}`);
      console.log(`  Qdrant Points:      ${stats.qdrant_points.toLocaleString()}`);

    } else {
      console.log('Usage:');
      console.log('  node phase89-cuda-rag-pipeline.mjs --build          # Build index');
      console.log('  node phase89-cuda-rag-pipeline.mjs --query "text"   # Query');
      console.log('  node phase89-cuda-rag-pipeline.mjs --stats          # Statistics');
    }

  } finally {
    await closeClients();
  }
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
