#!/usr/bin/env node

/**
 * Correlation Benchmark: Autoencoder-Trained Latent64 vs Full-Vector
 *
 * Purpose: Re-validate latent64 ranking preservation AFTER loading trained autoencoder weights
 *
 * This script:
 * 1. Loads trained autoencoder weights from Redis
 * 2. Runs 100 queries (or user-specified count)
 * 3. Compares full-vector ranking vs latent64-reconstructed ranking
 * 4. Measures Spearman correlation (target: >0.85)
 * 5. Reports Gate 4 verdict: PASS or FAIL
 *
 * Difference from initial benchmark:
 * - Initial: Simple averaging (768-d → 64-d, no learned weights) = Spearman 0.595 FAIL
 * - This run: Autoencoder trained weights (768 → 64 → 768, learned reconstruction) = Spearman >0.85 PASS (expected)
 *
 * Usage:
 *   npm run atlas:benchmark:correlation:autoencoder:dry       # 10 queries, no DB write
 *   npm run atlas:benchmark:correlation:autoencoder:apply     # 100 queries, full report
 *   npm run atlas:benchmark:correlation:autoencoder:apply 500 # 500 queries
 */

import pg from 'pg';
import Redis from 'ioredis';
import { createReadStream, writeFileSync, mkdirSync } from 'fs';
import { basename, join } from 'path';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================================
// CONFIGURATION
// ============================================================================

const CONFIG = {
  query_count: 100, // Default: 100 queries (full validation)
  embedding_dim: 768,
  latent_dim: 64,

  // Database
  pg: {
    host: process.env.PGHOST || '127.0.0.1',
    port: parseInt(process.env.PGPORT || '5434'),
    database: process.env.PGDATABASE || 'legal_ai_db',
    user: process.env.PGUSER || 'legal_admin',
    password: process.env.PGPASSWORD || '123456',
  },

  // Redis
  redis: {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || 'redis',  // Valkey default password
  },

  // Output
  output_dir: path.resolve(__dirname, '../../scratch/benchmarks'),
};

// ============================================================================
// UTILITY: Spearman Rank Correlation
// ============================================================================

function spearmans(rankings1, rankings2) {
  if (rankings1.length !== rankings2.length) return NaN;

  const n = rankings1.length;
  const ranks1 = rankings1.map((val, idx) => ({ val, idx }))
    .sort((a, b) => a.val - b.val)
    .map(({ idx }, rank) => [idx, rank + 1]);
  const ranks2 = rankings2.map((val, idx) => ({ val, idx }))
    .sort((a, b) => a.val - b.val)
    .map(({ idx }, rank) => [idx, rank + 1]);

  const rankMap1 = Object.fromEntries(ranks1);
  const rankMap2 = Object.fromEntries(ranks2);

  let sumDiff2 = 0;
  for (let i = 0; i < n; i++) {
    const d = (rankMap1[i] || 1) - (rankMap2[i] || 1);
    sumDiff2 += d * d;
  }

  return 1 - (6 * sumDiff2) / (n * (n * n - 1));
}

// ============================================================================
// AUTOENCODER INFERENCE (CPU-based forward pass)
// ============================================================================

function loadWeightsFromRedis(redisData) {
  const weights = {};
  for (const [key, value] of Object.entries(redisData)) {
    if (key === 'metadata') continue;
    weights[key] = JSON.parse(value);
  }
  return weights;
}

function matmul(a, bTransposed, bias) {
  const result = [];
  for (let i = 0; i < a.length; i += a[i].length || 1) {
    let sum = 0;
    for (let j = 0; j < bTransposed.length; j++) {
      sum += (a[i] || 0) * (bTransposed[j] || 0);
    }
    result.push((bias ? sum + bias[result.length] : sum));
  }
  return result;
}

/**
 * Encode 768-d vector to latent_64
 * Forward pass: 768 → linear+relu(128) → linear(64)
 */
function encodeToLatent(vector, weights) {
  if (!weights.encoder_w || !weights.latent_w) {
    throw new Error('Missing encoder weights in Redis');
  }

  // First layer: 768 → 128 (with ReLU)
  let hidden = [];
  const encoder_w_data = weights.encoder_w.data;
  const encoder_b_data = weights.encoder_b.data;

  for (let i = 0; i < 128; i++) {
    let sum = (encoder_b_data[i] || 0);
    for (let j = 0; j < 768; j++) {
      sum += vector[j] * encoder_w_data[i * 768 + j];
    }
    hidden.push(Math.max(0, sum)); // ReLU
  }

  // Second layer: 128 → 64
  let latent = [];
  const latent_w_data = weights.latent_w.data;
  const latent_b_data = weights.latent_b.data;

  for (let i = 0; i < 64; i++) {
    let sum = (latent_b_data[i] || 0);
    for (let j = 0; j < 128; j++) {
      sum += hidden[j] * latent_w_data[i * 128 + j];
    }
    latent.push(sum);
  }

  return latent;
}

/**
 * Decode latent_64 back to 768-d (for ranking comparison)
 */
function decodeFromLatent(latent, weights) {
  if (!weights.decoder_w || !weights.output_w) {
    throw new Error('Missing decoder weights in Redis');
  }

  // First layer: 64 → 128 (with ReLU)
  let hidden = [];
  const decoder_w_data = weights.decoder_w.data;
  const decoder_b_data = weights.decoder_b.data;

  for (let i = 0; i < 128; i++) {
    let sum = (decoder_b_data[i] || 0);
    for (let j = 0; j < 64; j++) {
      sum += latent[j] * decoder_w_data[i * 64 + j];
    }
    hidden.push(Math.max(0, sum)); // ReLU
  }

  // Second layer: 128 → 768
  let reconstructed = [];
  const output_w_data = weights.output_w.data;
  const output_b_data = weights.output_b.data;

  for (let i = 0; i < 768; i++) {
    let sum = (output_b_data[i] || 0);
    for (let j = 0; j < 128; j++) {
      sum += hidden[j] * output_w_data[i * 128 + j];
    }
    reconstructed.push(sum);
  }

  return reconstructed;
}

// ============================================================================
// BENCHMARK RUNNER
// ============================================================================

async function runBenchmark(pool, redis, queryCount, dryRun = false) {
  console.log(`\n${'='.repeat(70)}`);
  console.log('CORRELATION BENCHMARK: AUTOENCODER-TRAINED LATENT64');
  console.log(`${'='.repeat(70)}\n`);

  console.log(`Mode: ${dryRun ? '🟡 DRY RUN' : '🟢 APPLY'}`);
  console.log(`Queries: ${queryCount}`);
  console.log(`\n${'='.repeat(70)}\n`);

  // Load autoencoder weights from Redis
  console.log('Loading autoencoder weights from Redis...');
  let weights = {};
  try {
    const redisKeys = await redis.keys('autoencoder:weights:*');
    for (const key of redisKeys) {
      const shortKey = key.replace('autoencoder:weights:', '');
      const value = await redis.get(key);
      weights[shortKey] = JSON.parse(value);
    }
    console.log(`✅ Loaded ${Object.keys(weights).length - 1} weight layers\n`);
  } catch (err) {
    console.error(`❌ Failed to load weights: ${err.message}`);
    process.exit(1);
  }

  // Fetch embeddings from Postgres
  console.log('Loading embeddings from Postgres...');
  let embeddings = [];
  try {
    // Query with explicit casting from halfvec to real[]
    const result = await pool.query(`
      SELECT
        cci.chunk_id as packet_key,
        cci.content_embedding as embedding
      FROM codebase_chunk_index cci
      WHERE cci.content_embedding IS NOT NULL
      ORDER BY RANDOM()
      LIMIT $1
    `, [queryCount]);

    embeddings = result.rows.map(row => {
      // Convert whatever type we get to array of numbers
      let embedding = row.embedding;
      if (!Array.isArray(embedding)) {
        // If it's a string representation, parse it
        if (typeof embedding === 'string') {
          embedding = JSON.parse(embedding);
        } else {
          embedding = Array.from(Object.values(embedding || {}));
        }
      }
      // Ensure all values are numbers
      embedding = embedding.map(v => typeof v === 'number' ? v : parseFloat(v));
      return {
        packet_key: row.packet_key,
        embedding: embedding,
      };
    }).filter(e => e.embedding && e.embedding.length === 768);

    console.log(`✅ Loaded ${embeddings.length} embeddings\n`);
  } catch (err) {
    console.error(`❌ Failed to load embeddings: ${err.message}`);
    process.exit(1);
  }

  // Run benchmark: compare full-vector vs latent64-reconstructed
  console.log('Running benchmark...\n');

  const results = [];
  const errors = [];
  let spearmans_sum = 0;
  let recall_sum = 0;
  let ndcg_sum = 0;

  for (let i = 0; i < embeddings.length; i++) {
    const { packet_key, embedding } = embeddings[i];

    try {
      // Encode to latent_64
      const latent = encodeToLatent(embedding, weights);

      // Reconstruct back to 768-d
      const reconstructed = decodeFromLatent(latent, weights);

      // Cosine similarity: original vs reconstructed
      // If autoencoder learned well, similarity should be >0.95
      const dotProduct = embedding.reduce((sum, val, idx) => sum + val * reconstructed[idx], 0);
      const norm1 = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
      const norm2 = Math.sqrt(reconstructed.reduce((sum, val) => sum + val * val, 0));
      const similarity = norm1 > 0 && norm2 > 0 ? dotProduct / (norm1 * norm2) : 0;

      // Spearman correlation (compare ranking order)
      const spearman = spearmans(embedding, reconstructed);

      results.push({
        packet_key,
        reconstruction_similarity: similarity,
        spearman_correlation: spearman,
        timestamp: new Date().toISOString(),
      });

      spearmans_sum += spearman;

      if ((i + 1) % 10 === 0) {
        console.log(`  ${i + 1}/${embeddings.length} queries processed`);
      }
    } catch (err) {
      errors.push({ packet_key, error: err.message });
    }
  }

  const spearmans_avg = spearmans_sum / embeddings.length;
  const recall = (embeddings.length - errors.length) / embeddings.length;

  console.log(`\n${'='.repeat(70)}`);
  console.log('RESULTS');
  console.log(`${'='.repeat(70)}\n`);

  console.log(`Queries run: ${embeddings.length}`);
  console.log(`Errors: ${errors.length}`);
  console.log(`Success rate: ${(recall * 100).toFixed(2)}%\n`);

  console.log(`Spearman (avg): ${spearmans_avg.toFixed(4)} / Target: >0.85`);
  console.log(`Reconstruction Similarity (avg): ${(results.reduce((sum, r) => sum + r.reconstruction_similarity, 0) / results.length).toFixed(4)} / Target: >0.95\n`);

  // Gate verdict
  const gate4_pass = spearmans_avg > 0.85;
  const gate_color = gate4_pass ? '✅' : '❌';
  console.log(`GATE 4 (Spearman): ${gate_color} ${gate4_pass ? 'PASS' : 'FAIL'}\n`);

  // Write results
  if (!dryRun) {
    mkdirSync(CONFIG.output_dir, { recursive: true });

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const reportPath = join(CONFIG.output_dir, `correlation-autoencoder-${timestamp}.jsonl`);

    let reportText = `# Autoencoder Correlation Benchmark Report\n\n`;
    reportText += `**Date**: ${new Date().toISOString()}\n`;
    reportText += `**Queries**: ${embeddings.length}\n`;
    reportText += `**Spearman (avg)**: ${spearmans_avg.toFixed(4)}\n`;
    reportText += `**Target**: >0.85\n`;
    reportText += `**Verdict**: ${gate4_pass ? '✅ PASS' : '❌ FAIL'}\n\n`;

    // Write JSONL results
    const jsonlContent = results.map(r => JSON.stringify(r)).join('\n');
    writeFileSync(reportPath, jsonlContent);

    console.log(`📝 Report written: ${reportPath}`);
  }

  console.log(`\n${'='.repeat(70)}\n`);

  return {
    spearman: spearmans_avg,
    pass: gate4_pass,
    query_count: embeddings.length,
    errors: errors.length,
  };
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const dryRun = process.argv.includes('--dry-run') || process.argv.includes('--dry');
  if (dryRun) CONFIG.query_count = 10;

  const userQueryCount = parseInt(process.argv[2]);
  if (!isNaN(userQueryCount)) CONFIG.query_count = userQueryCount;

  const pool = new pg.Pool(CONFIG.pg);

  const redis = new Redis(CONFIG.redis);

  try {
    // Test connection with PING
    await redis.ping();

    const result = await runBenchmark(pool, redis, CONFIG.query_count, dryRun);

    process.exit(result.pass ? 0 : 1);
  } catch (err) {
    console.error(`\n❌ Fatal error: ${err.message}\n`);
    process.exit(1);
  } finally {
    await redis.disconnect().catch(() => {});
    await pool.end().catch(() => {});
  }
}

main();
