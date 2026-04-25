#!/usr/bin/env node
/**
 * Phase 89: Enhanced Similarity Ranker with Redis Cache
 *
 * Features:
 * 1. Redis query cache for instant repeated searches
 * 2. Language-specific filtering
 * 3. Error code grouping
 * 4. Top-K index lookup (O(1) vs O(n))
 * 5. Web search metadata integration
 */

import { createHash } from 'crypto';
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
    prefix: 'phase89:query:',
    ttl: 3600 // 1 hour cache for queries
  },
  ollama: {
    host: 'http://localhost:11434',
    embeddingModel: 'embeddinggemma'
  },
  search: {
    topK: 50,
    minSimilarity: 0.7,
    useCache: true,
    useTopKIndex: true // Use precomputed similarity index
  }
};

let db;
let redis;
let cacheHits = 0;
let cacheMisses = 0;

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Usage: node phase89-enhanced-ranker.mjs "query text" [--language ts|svelte] [--error-code TS1234] [--top 50] [--no-cache]');
    console.log('\nExamples:');
    console.log('  node phase89-enhanced-ranker.mjs "Cannot find name" --language typescript --top 20');
    console.log('  node phase89-enhanced-ranker.mjs "TS1005" --error-code TS1005 --no-cache');
    process.exit(0);
  }

  // Parse arguments
  const query = args[0];
  const language = args.includes('--language') ? args[args.indexOf('--language') + 1] : null;
  const errorCode = args.includes('--error-code') ? args[args.indexOf('--error-code') + 1] : null;
  const topK = args.includes('--top') ? parseInt(args[args.indexOf('--top') + 1]) : CONFIG.search.topK;
  const useCache = !args.includes('--no-cache') && CONFIG.search.useCache;

  // Connect
  db = new Pool(CONFIG.postgres);
  redis = createClient({ url: CONFIG.redis.url });
  redis.on('error', (err) => console.warn('Redis warning:', err.message));
  await redis.connect();

  console.log('🔍 Phase 89: Enhanced Similarity Search\n');
  console.log(`Query: "${query}"`);
  if (language) console.log(`Filter: language = ${language}`);
  if (errorCode) console.log(`Filter: error_code = ${errorCode}`);
  console.log(`Top-K: ${topK} results\n`);

  // Search with caching
  const results = await searchWithCache(query, { language, errorCode, topK, useCache });

  // Display results
  displayResults(results, query);

  // Show stats
  console.log('\n📊 Cache Stats:');
  console.log(`   Hits:   ${cacheHits}`);
  console.log(`   Misses: ${cacheMisses}`);

  await redis.quit();
  await db.end();
}

/**
 * Search with Redis query cache
 */
async function searchWithCache(query, options) {
  const cacheKey = CONFIG.redis.prefix + createHash('sha256')
    .update(JSON.stringify({ query, options }))
    .digest('hex')
    .substring(0, 16);

  // Check cache first
  if (options.useCache) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        cacheHits++;
        console.log('✅ Cache HIT (instant result)\n');
        return JSON.parse(cached);
      }
    } catch (err) {
      console.warn('⚠️  Cache read error:', err.message);
    }
  }

  cacheMisses++;
  console.log('⏳ Cache MISS (generating embedding...)\n');

  // Try top-K index first (O(1) lookup)
  if (CONFIG.search.useTopKIndex) {
    const indexResults = await searchWithTopKIndex(query, options);
    if (indexResults && indexResults.length > 0) {
      // Cache results
      if (options.useCache) {
        await redis.setEx(cacheKey, CONFIG.redis.ttl, JSON.stringify(indexResults));
      }
      return indexResults;
    }
  }

  // Fallback to full vector search
  const vectorResults = await searchWithVector(query, options);

  // Cache results
  if (options.useCache) {
    try {
      await redis.setEx(cacheKey, CONFIG.redis.ttl, JSON.stringify(vectorResults));
    } catch (err) {
      console.warn('⚠️  Cache write error:', err.message);
    }
  }

  return vectorResults;
}

/**
 * Search using precomputed top-K index (FAST)
 */
async function searchWithTopKIndex(query, options) {
  // First, find the error that matches the query text exactly (or closest)
  const exactMatch = await db.query(`
    SELECT id
    FROM raw_error_embeddings
    WHERE raw_text ILIKE $1
    LIMIT 1
  `, [`%${query}%`]);

  if (exactMatch.rows.length === 0) {
    return null; // No match in index
  }

  const errorId = exactMatch.rows[0].id;

  // Use top-K index for instant results
  let sql = `
    SELECT
      e.id,
      e.source,
      e.raw_text,
      e.language,
      e.error_code,
      e.file_path,
      e.metadata,
      i.similarity_score as similarity,
      i.rank
    FROM error_similarity_index i
    JOIN raw_error_embeddings e ON e.id = i.similar_error_id
    WHERE i.error_id = $1
  `;

  const params = [errorId];
  let paramIndex = 2;

  // Apply filters
  if (options.language) {
    sql += ` AND e.language = $${paramIndex}`;
    params.push(options.language);
    paramIndex++;
  }

  if (options.errorCode) {
    sql += ` AND e.error_code = $${paramIndex}`;
    params.push(options.errorCode);
    paramIndex++;
  }

  sql += ` ORDER BY i.rank LIMIT $${paramIndex}`;
  params.push(options.topK);

  const result = await db.query(sql, params);

  if (result.rows.length > 0) {
    console.log('⚡ Using top-K index (O(1) lookup)');
  }

  return result.rows;
}

/**
 * Search with full vector similarity (SLOWER but comprehensive)
 */
async function searchWithVector(query, options) {
  console.log('🧮 Generating query embedding...');

  // Generate embedding for query
  const result = await ollama.embeddings({
    model: CONFIG.ollama.embeddingModel,
    prompt: query
  });

  const queryEmbedding = result.embedding;

  // Build query with filters
  let sql = `
    SELECT
      id,
      source,
      raw_text,
      language,
      error_code,
      file_path,
      metadata,
      1 - (embedding <=> $1::vector) AS similarity
    FROM raw_error_embeddings
    WHERE embedding IS NOT NULL
  `;

  const params = [JSON.stringify(queryEmbedding)];
  let paramIndex = 2;

  // Apply filters
  if (options.language) {
    sql += ` AND language = $${paramIndex}`;
    params.push(options.language);
    paramIndex++;
  }

  if (options.errorCode) {
    sql += ` AND error_code = $${paramIndex}`;
    params.push(options.errorCode);
    paramIndex++;
  }

  sql += ` AND (1 - (embedding <=> $1::vector)) >= $${paramIndex}`;
  params.push(CONFIG.search.minSimilarity);
  paramIndex++;

  sql += ` ORDER BY embedding <=> $1::vector LIMIT $${paramIndex}`;
  params.push(options.topK);

  console.log('🔎 Searching database...\n');
  const searchResult = await db.query(sql, params);

  return searchResult.rows;
}

/**
 * Display results
 */
function displayResults(results, query) {
  if (results.length === 0) {
    console.log('❌ No similar errors found');
    return;
  }

  console.log(`✅ Found ${results.length} similar errors:\n`);
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  for (let i = 0; i < Math.min(results.length, 10); i++) {
    const r = results[i];
    console.log(`\n${i + 1}. [${(r.similarity * 100).toFixed(1)}% similar] ${r.source} - ${r.error_code || 'N/A'}`);
    console.log(`   Language: ${r.language || 'unknown'}`);
    if (r.file_path) console.log(`   File: ${r.file_path}`);
    console.log(`   Text: ${r.raw_text.substring(0, 200)}${r.raw_text.length > 200 ? '...' : ''}`);
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  // Cluster analysis
  const bySimilarity = {
    'high (90-100%)': results.filter(r => r.similarity >= 0.9).length,
    'medium (80-90%)': results.filter(r => r.similarity >= 0.8 && r.similarity < 0.9).length,
    'low (70-80%)': results.filter(r => r.similarity >= 0.7 && r.similarity < 0.8).length
  };

  console.log('\n📊 Similarity Distribution:');
  for (const [range, count] of Object.entries(bySimilarity)) {
    if (count > 0) {
      console.log(`   ${range.padEnd(20)} ${count} errors`);
    }
  }

  // Language breakdown
  const byLanguage = results.reduce((acc, r) => {
    const lang = r.language || 'unknown';
    acc[lang] = (acc[lang] || 0) + 1;
    return acc;
  }, {});

  console.log('\n📚 By Language:');
  for (const [lang, count] of Object.entries(byLanguage)) {
    console.log(`   ${lang.padEnd(20)} ${count} errors`);
  }

  // Error code breakdown
  const byCodes = results.reduce((acc, r) => {
    const code = r.error_code || 'unknown';
    acc[code] = (acc[code] || 0) + 1;
    return acc;
  }, {});

  if (Object.keys(byCodes).length > 1) {
    console.log('\n🔢 Top Error Codes:');
    const sortedCodes = Object.entries(byCodes)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5);

    for (const [code, count] of sortedCodes) {
      console.log(`   ${code.padEnd(20)} ${count} errors`);
    }
  }
}

main().catch(err => {
  console.error('❌ Error:', err);
  process.exit(1);
});
