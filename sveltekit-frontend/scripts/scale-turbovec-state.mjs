/**
 * scripts/scale-turbovec-state.mjs
 *
 * High-performance ingestion pipeline for TurboVec 10M documents.
 * Implements int8 scalar quantization + on-disk HNSW + parallel batch workers
 * + checkpoint/resume + hyperedge-compatible payload schema.
 *
 * ENV overrides:
 *   QDRANT_URL      default http://localhost:6333
 *   BATCH_SIZE      default 2000
 *   TOTAL_DOCS      default 1000000
 *   CONCURRENCY     default 8  (concurrent Qdrant upsert requests)
 *
 * Checkpoint file: tmp/checkpoint-codebase_chunks_10m.json
 * Cleared on clean completion; re-used on resume (TOTAL_DOCS unchanged).
 */

import { QdrantClient } from '@qdrant/js-client-rest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const COLLECTION = 'codebase_chunks_10m';
const BATCH_SIZE = parseInt(process.env.BATCH_SIZE || '2000', 10);
const TOTAL_DOCS = parseInt(process.env.TOTAL_DOCS || '1000000', 10);
const CONCURRENCY = parseInt(process.env.CONCURRENCY || '8', 10);

const CHECKPOINT_FILE = path.join(__dirname, `../tmp/checkpoint-${COLLECTION}.json`);
const CHECKPOINT_EVERY = 50_000; // docs between checkpoint saves

// Topo classes match the real topology system used by ACE/hypergraph retrieval
const TOPO_CLASSES = [
  'server-api',
  'ui-component',
  'db-schema',
  'service-layer',
  'test',
  'config',
  'script',
];
const HG_GRADES = ['A', 'B', 'C'];

// ── Checkpoint helpers ────────────────────────────────────────────────────────

function loadCheckpoint() {
  try {
    if (fs.existsSync(CHECKPOINT_FILE)) {
      const { processed, savedAt } = JSON.parse(fs.readFileSync(CHECKPOINT_FILE, 'utf8'));
      console.log(`📂 Resuming from checkpoint: ${processed} docs (saved ${savedAt})`);
      return processed;
    }
  } catch {
    /* corrupt checkpoint — ignore and restart */
  }
  return 0;
}

function saveCheckpoint(processed) {
  const dir = path.dirname(CHECKPOINT_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(
    CHECKPOINT_FILE,
    JSON.stringify({ processed, savedAt: new Date().toISOString(), collection: COLLECTION })
  );
}

function clearCheckpoint() {
  if (fs.existsSync(CHECKPOINT_FILE)) fs.unlinkSync(CHECKPOINT_FILE);
}

// ── Collection setup ──────────────────────────────────────────────────────────

async function setupScaleCollection(client) {
  console.log(`🏗️  Setting up 10M scale collection: ${COLLECTION}...`);
  try {
    await client.createCollection(COLLECTION, {
      vectors: { size: 768, distance: 'Cosine' },
      quantization_config: {
        scalar: { type: 'int8', quantile: 0.99, always_ram: true },
      },
      hnsw_config: { ef_construct: 128, m: 16, on_disk: true }, // CRITICAL for 10M
    });
    console.log('✅ Collection created (on-disk HNSW + int8 scalar quant).');
  } catch {
    console.log('ℹ️  Collection already exists — continuing.');
  }
}

// ── Batch generation ──────────────────────────────────────────────────────────

function makeBatch(startId, size) {
  const points = [];
  for (let j = 0; j < size; j++) {
    const id = startId + j;
    points.push({
      id,
      vector: Array.from({ length: 768 }, () => Math.random() * 2 - 1),
      payload: {
        chunk_id: `synthetic-${id}`,
        source: 'turbovec-scale-test',
        // Hyperedge-compatible fields (mirrors real codebase_chunks_768 schema)
        topo_class: TOPO_CLASSES[id % TOPO_CLASSES.length],
        cluster_id: Math.floor(id / 1000) % 100, // 100 synthetic clusters (0-99)
        hg_grade: HG_GRADES[id % HG_GRADES.length],
        timestamp: new Date().toISOString(),
      },
    });
  }
  return points;
}

// ── Parallel ingestion ────────────────────────────────────────────────────────

async function parallelIngestion() {
  const client = new QdrantClient({ url: QDRANT_URL });
  await setupScaleCollection(client);

  const startOffset = loadCheckpoint();
  console.log(
    `🚀 Ingesting ${TOTAL_DOCS} docs | CONCURRENCY=${CONCURRENCY} | BATCH_SIZE=${BATCH_SIZE}` +
      (startOffset > 0 ? ` | resuming from ${startOffset}` : '')
  );

  const wallStart = Date.now();
  const stats = { processed: startOffset, errors: 0 };
  let lastCheckpoint = startOffset;

  // Build queue of batch start offsets
  const queue = [];
  for (let i = startOffset; i < TOTAL_DOCS; i += BATCH_SIZE) queue.push(i);

  // Progress / checkpoint reporter (every 10 s)
  const progressTimer = setInterval(() => {
    const elapsed = (Date.now() - wallStart) / 1000;
    const done = stats.processed - startOffset;
    const rate = done / Math.max(elapsed, 0.001);
    const eta = (TOTAL_DOCS - stats.processed) / Math.max(rate, 1);
    console.log(
      `📈 ${stats.processed}/${TOTAL_DOCS} | ${rate.toFixed(0)} docs/s | ETA ${eta.toFixed(0)}s | errors ${stats.errors}`
    );
    // Periodic checkpoint
    if (stats.processed - lastCheckpoint >= CHECKPOINT_EVERY) {
      saveCheckpoint(stats.processed);
      lastCheckpoint = stats.processed;
    }
  }, 10_000);

  // Worker: pulls from shared queue (safe in single-threaded Node.js event loop)
  async function worker(idx) {
    while (queue.length > 0) {
      const batchStart = queue.shift();
      if (batchStart === undefined) break;

      const batchSize = Math.min(BATCH_SIZE, TOTAL_DOCS - batchStart);
      const points = makeBatch(batchStart, batchSize);

      try {
        await client.upsert(COLLECTION, { wait: false, points });
        stats.processed += batchSize;
      } catch (e) {
        console.error(`[w${idx}] ❌ upsert @${batchStart}: ${e.message}`);
        stats.errors++;
        // Re-queue failed batch for one retry
        queue.push(batchStart);
      }
    }
  }

  // Launch N concurrent workers
  await Promise.all(Array.from({ length: CONCURRENCY }, (_, i) => worker(i)));

  clearInterval(progressTimer);

  const elapsed = (Date.now() - wallStart) / 1000;
  const total = stats.processed - startOffset;
  const rate = total / Math.max(elapsed, 0.001);
  console.log(
    `\n✅ Done: ${stats.processed} docs in ${elapsed.toFixed(1)}s (${rate.toFixed(0)} docs/s, ${stats.errors} errors)`
  );

  if (stats.errors === 0) {
    clearCheckpoint();
  } else {
    console.warn(`⚠️  ${stats.errors} batch errors — checkpoint kept for resume`);
    saveCheckpoint(stats.processed);
  }

  // Verify via collection info
  try {
    const info = await client.getCollection(COLLECTION);
    const pts = info.points_count ?? info.vectors_count ?? 'unknown';
    console.log(`📊 Collection "${COLLECTION}": ${pts} points indexed`);
  } catch (e) {
    console.log(`ℹ️  Collection info unavailable: ${e.message}`);
  }
}

parallelIngestion().catch((err) => {
  console.error('❌ Fatal:', err.message);
  process.exit(1);
});
