#!/usr/bin/env node
/**
 * SOM training on codebase_chunk_index.content_embedding (384-dim)
 *
 * Reads content_embedding vectors from codebase_chunk_index,
 * trains a 20×20 SOM, then backfills atlas_packets with
 * som_row, som_col, som_index joined by source_ref.
 * Also writes gpu:som:cell:{row}:{col} keys to Redis.
 *
 * Does NOT require latent_64 (archived AE research path).
 * Uses pure-JS CPU SOM — no native addon required.
 *
 * Usage:
 *   node scripts/atlas/run-som-on-chunks.mjs --dry-run
 *   node scripts/atlas/run-som-on-chunks.mjs --apply
 *   node scripts/atlas/run-som-on-chunks.mjs --apply --sample 5000
 */

import pg from 'pg';
import { Redis } from 'ioredis';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve('.', '.env') });
config({ path: resolve('.', 'sveltekit-frontend/.env.local'), override: false });

const APPLY      = process.argv.includes('--apply');
const DRY_RUN    = !APPLY;
const SAMPLE_ARG = process.argv.indexOf('--sample');
const MAX_SAMPLE = SAMPLE_ARG >= 0 ? parseInt(process.argv[SAMPLE_ARG + 1]) : 40000;
const ITER_ARG   = process.argv.indexOf('--iterations');

const GRID_W     = 20;
const GRID_H     = 20;
const ITERATIONS = ITER_ARG >= 0 ? parseInt(process.argv[ITER_ARG + 1]) : parseInt(process.env.ATLAS_SOM_ITERATIONS || '30');
const INIT_LR    = 0.5;
const INIT_RADIUS = Math.max(GRID_W, GRID_H) / 2;
const DIM        = 384;
const REDIS_TTL  = 7 * 24 * 3600; // 7 days

const pgPool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db',
});

const redis = new Redis({
  host: process.env.REDIS_HOST || '127.0.0.1',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || 'redis',
  lazyConnect: true,
  maxRetriesPerRequest: 1,
  enableOfflineQueue: false,
  retryStrategy: () => null,
});
redis.on('error', () => {});

console.log('\n╔══════════════════════════════════════════════════════════════════╗');
console.log('║  SOM 20×20 Training on content_embedding_384                     ║');
console.log(`║  Mode: ${(APPLY ? 'APPLY' : 'DRY-RUN').padEnd(57)}║`);
console.log(`║  Grid: ${GRID_W}×${GRID_H}=${GRID_W*GRID_H} cells, ${ITERATIONS} iterations, max ${MAX_SAMPLE} samples  ║`);
console.log('╚══════════════════════════════════════════════════════════════════╝\n');

// --- SOM implementation (pure JS, no native addon) ---

function randomCodebook(rows, cols, dim) {
  const cells = rows * cols;
  const codebook = new Float32Array(cells * dim);
  for (let i = 0; i < codebook.length; i++) codebook[i] = (Math.random() * 2 - 1) * 0.1;
  return codebook;
}

function euclideanBMU(codebook, vec, rows, cols) {
  let bestIdx = 0, bestDist = Infinity;
  for (let i = 0; i < rows * cols; i++) {
    let dist = 0;
    const base = i * vec.length;
    for (let d = 0; d < vec.length; d++) {
      const diff = codebook[base + d] - vec[d];
      dist += diff * diff;
    }
    if (dist < bestDist) { bestDist = dist; bestIdx = i; }
  }
  return bestIdx;
}

function trainEpoch(codebook, vectors, rows, cols, lr, radius) {
  const dim = vectors[0].length;
  const r2 = radius * radius * 2;
  for (const vec of vectors) {
    const bmu = euclideanBMU(codebook, vec, rows, cols);
    const bmuRow = Math.floor(bmu / cols);
    const bmuCol = bmu % cols;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const dr = r - bmuRow, dc = c - bmuCol;
        const d2 = dr * dr + dc * dc;
        const h = Math.exp(-d2 / r2);
        if (h < 0.001) continue;
        const base = (r * cols + c) * dim;
        for (let d = 0; d < dim; d++) codebook[base + d] += h * lr * (vec[d] - codebook[base + d]);
      }
    }
  }
}

async function main() {
  await redis.connect().catch(() => {});

  // Step 1: Load embeddings from codebase_chunk_index
  console.log('  Step 1: Load 384-dim embeddings from codebase_chunk_index...\n');

  const rows = await pgPool.query(`
    SELECT ci.source_ref, ci.content_embedding::text AS emb_text
    FROM codebase_chunk_index ci
    WHERE ci.content_embedding IS NOT NULL
    LIMIT $1
  `, [MAX_SAMPLE]);

  console.log(`  Loaded ${rows.rows.length} embeddings\n`);

  if (rows.rows.length < 100) {
    console.log('  ❌ Too few embeddings — run embedding backfill first');
    process.exit(1);
  }

  // Parse postgres vector string "[0.1,0.2,...]" → Float32Array
  const vectors = rows.rows.map(r => {
    const vals = r.emb_text.slice(1, -1).split(',').map(Number);
    return new Float32Array(vals);
  });
  const sourceRefs = rows.rows.map(r => r.source_ref);

  if (DRY_RUN) {
    console.log(`  DRY-RUN: Would train SOM on ${vectors.length} vectors`);
    console.log(`  DRY-RUN: Would assign ${vectors.length} source_refs to SOM cells`);
    console.log(`  DRY-RUN: Would write ${GRID_W * GRID_H} Redis keys (gpu:som:cell:r:c)`);
    console.log(`  DRY-RUN: Would update atlas_packets for matching source_refs`);
    console.log('\n  Re-run with --apply to execute\n');
    await cleanup(); return;
  }

  // Step 2: Train SOM
  console.log(`  Step 2: Train SOM (${ITERATIONS} iterations)...\n`);
  const codebook = randomCodebook(GRID_H, GRID_W, DIM);

  for (let iter = 0; iter < ITERATIONS; iter++) {
    const progress = iter / ITERATIONS;
    const lr     = INIT_LR * Math.exp(-3 * progress);
    const radius = INIT_RADIUS * Math.exp(-3 * progress);
    // Shuffle
    for (let i = vectors.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [vectors[i], vectors[j]] = [vectors[j], vectors[i]];
      [sourceRefs[i], sourceRefs[j]] = [sourceRefs[j], sourceRefs[i]];
    }
    trainEpoch(codebook, vectors, GRID_H, GRID_W, lr, radius);
    if (iter % 10 === 0) process.stdout.write(`  iter ${iter}/${ITERATIONS} lr=${lr.toFixed(3)} r=${radius.toFixed(1)}\r`);
  }
  console.log(`\n  ✅ SOM trained\n`);

  // Step 3: Assign all vectors to BMU cells
  console.log('  Step 3: Assign vectors to BMU cells...\n');
  const cellMembers = new Map(); // "r:c" → [source_ref, ...]
  const assignments = []; // { source_ref, row, col, index }

  for (let i = 0; i < vectors.length; i++) {
    const bmu = euclideanBMU(codebook, vectors[i], GRID_H, GRID_W);
    const row = Math.floor(bmu / GRID_W);
    const col = bmu % GRID_W;
    const idx = row * GRID_W + col;
    assignments.push({ source_ref: sourceRefs[i], row, col, index: idx });
    const key = `${row}:${col}`;
    if (!cellMembers.has(key)) cellMembers.set(key, []);
    cellMembers.get(key).push(sourceRefs[i]);
  }

  const occupiedCells = cellMembers.size;
  console.log(`  ${occupiedCells}/${GRID_W * GRID_H} cells occupied\n`);

  // Step 4: Write Redis cell keys
  console.log('  Step 4: Write Redis gpu:som:cell:{r}:{c} keys...\n');
  let redisPipe = redis.pipeline();
  let redisCnt = 0;
  for (const [key, refs] of cellMembers) {
    const [r, c] = key.split(':');
    redisPipe.setex(`gpu:som:cell:${r}:${c}`, REDIS_TTL, JSON.stringify(refs));
    redisCnt++;
    if (redisCnt % 100 === 0) { await redisPipe.exec(); redisPipe = redis.pipeline(); }
  }
  await redisPipe.exec();
  console.log(`  ✅ Wrote ${redisCnt} Redis cell keys\n`);

  // Step 5: Backfill atlas_packets via source_ref join
  console.log('  Step 5: Backfill atlas_packets.som_row/col/index...\n');
  const BATCH = 500;
  let updated = 0;

  for (let i = 0; i < assignments.length; i += BATCH) {
    const chunk = assignments.slice(i, i + BATCH);
    const values = [], placeholders = [];
    let pi = 1;
    for (const a of chunk) {
      placeholders.push(`($${pi},$${pi+1}::smallint,$${pi+2}::smallint,$${pi+3}::smallint)`);
      values.push(a.source_ref, a.row, a.col, a.index);
      pi += 4;
    }
    const res = await pgPool.query(
      `UPDATE atlas_packets AS p
       SET som_row = v.row, som_col = v.col, som_index = v.idx,
           som_cluster = 'som20x20', updated_at = NOW()
       FROM (VALUES ${placeholders.join(',')}) AS v(source_ref, row, col, idx)
       WHERE p.source_ref = v.source_ref
          OR p.source_ref = 'sveltekit-frontend/' || v.source_ref`,
      values
    );
    updated += res.rowCount;
    if (i % 5000 === 0 && i > 0) process.stdout.write(`  updated ${updated}...\r`);
  }

  console.log(`\n  ✅ Updated ${updated} atlas_packets with SOM assignments\n`);

  await cleanup();
  console.log(`  Done. ${occupiedCells} cells populated, ${updated} packets assigned.\n`);
}

async function cleanup() {
  await pgPool.end().catch(() => {});
  await redis.quit().catch(() => {});
}

main().catch(err => { console.error('❌', err.message); process.exit(1); });
