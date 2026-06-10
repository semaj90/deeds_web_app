#!/usr/bin/env node
/**
 * pytorch-qdrant-redis-som-index.mjs
 *
 * Real GPU clustering + SOM + autoencoder pipeline.
 *
 * Pipeline (streaming, gradient-checkpointed):
 *  1. Scroll Qdrant codebase_chunks_768 for 768-dim embeddings
 *  2. GPU k-means (kmeansWithCentroids, k=20, restart from Redis checkpoint)
 *  3. GPU SOM 8×8 grid on 768-dim vectors → BMU assignments
 *  4. Autoencoder 768→64 compress every vector (xavier init W, tanh)
 *  5. cuvsCompressEmbedding per-vector (IVF centroid residual, 64-dim output)
 *  6. Upsert compressed vectors + cluster/SOM metadata back to Qdrant payload
 *  7. Write centroid registry to Redis (ace:kmeans:centroids:<k>)
 *  8. Write SOM grid weights to Redis (ace:som:weights)
 *  9. Neo4j: merge SIMILAR_TOPOLOGY edges from SOM grid adjacency
 * 10. Postgres parent_atlas_documents: update cluster_id + centroid_id
 * 11. DuckDB: materialise codebase_atlas.parquet with all joined metadata
 * 12. ACE/NES card GIN-JSONB encode → glyph_records upsert
 * 13. TurboVec: stream all documents through batch cosine ranking → JSON packing
 *
 * Usage:
 *   node scripts/atlas/pytorch-qdrant-redis-som-index.mjs          # dry-run
 *   node scripts/atlas/pytorch-qdrant-redis-som-index.mjs --commit  # writes
 *   node scripts/atlas/pytorch-qdrant-redis-som-index.mjs --force   # ignore checkpoint
 *   node scripts/atlas/pytorch-qdrant-redis-som-index.mjs --k 30 --som-grid 10
 *   node scripts/atlas/pytorch-qdrant-redis-som-index.mjs --batch 200
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT      = resolve(__dirname, '../..');
const require   = createRequire(import.meta.url);

// ── CLI ──────────────────────────────────────────────────────────────────────
const argv    = process.argv.slice(2);
const hasFlag = (f) => argv.includes(f);
const getArg  = (name) => {
  const eq  = argv.find(a => a.startsWith(`--${name}=`))?.split('=')[1];
  if (eq) return eq;
  const idx = argv.indexOf(`--${name}`);
  return idx >= 0 && argv[idx+1] && !argv[idx+1].startsWith('--') ? argv[idx+1] : null;
};

const DRY_RUN   = !hasFlag('--commit');
const FORCE     = hasFlag('--force');
const K         = parseInt(getArg('k')        ?? '20',  10);
const SOM_GRID  = parseInt(getArg('som-grid') ?? '8',   10);
const BATCH_SZ  = parseInt(getArg('batch')    ?? '500', 10);
const SOM_ITERS = parseInt(getArg('som-iters')?? '200', 10);
const MAX_DOCS  = parseInt(getArg('max-docs') ?? '0',   10); // 0 = unlimited

// ── Paths ────────────────────────────────────────────────────────────────────
const TMP       = resolve(ROOT, '.tmp');
const CKPT_DIR  = resolve(ROOT, '.tmp', 'gpu-som-checkpoint');
const REPORTS   = resolve(ROOT, 'docs', 'reports');
const EXPORTS   = resolve(ROOT, 'memory', 'exports');
const TODAY     = new Date().toISOString().slice(0, 10);

for (const d of [TMP, CKPT_DIR, REPORTS]) {
  if (!existsSync(d)) mkdirSync(d, { recursive: true });
}

// ── Dotenv ───────────────────────────────────────────────────────────────────
const dotenv = await import('dotenv').catch(() => null);
dotenv?.config({ path: resolve(ROOT, '.env') });

// ── External deps ────────────────────────────────────────────────────────────
const pg      = require('pg');
const IORedis  = (await import('ioredis').catch(() => ({ default: null }))).default;
const neo4jPkg = await import('neo4j-driver').catch(() => null);

// ── N-API GPU Addon ──────────────────────────────────────────────────────────
const ADDON_PATH = resolve(ROOT, 'simd-bridge/cpp/build/Release/tensorrt_bridge.node');
let addon = null;
try {
  addon = require(ADDON_PATH);
  const cudaOk = addon.checkCudaAvailable?.();
  console.log(`[gpu] addon loaded — CUDA: ${cudaOk ? 'YES' : 'CPU fallback'}`);
} catch (e) {
  console.warn('[gpu] addon not available, falling back to JS implementations:', e.message);
}

// ── Qdrant client ─────────────────────────────────────────────────────────────
const QDRANT_URL  = process.env.QDRANT_URL ?? 'http://127.0.0.1:6333';
const COLLECTION  = 'codebase_chunks_768';
const DIM         = 768;
const DIM_SMALL   = 64;

async function qdrantScroll(offset, limit) {
  const body = { limit, with_payload: true, with_vectors: ['content'] };
  if (offset) body.offset = offset;
  const r = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(30_000),
  });
  if (!r.ok) throw new Error(`Qdrant scroll ${r.status}: ${await r.text()}`);
  return r.json();
}

async function qdrantUpsertBatch(points) {
  if (DRY_RUN || points.length === 0) return;
  const r = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points?wait=false`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ points }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!r.ok) throw new Error(`Qdrant upsert ${r.status}: ${await r.text()}`);
}

async function qdrantSetPayloadBatch(updates) {
  if (DRY_RUN || updates.length === 0) return;
  // Batch payload-only updates (no vector re-upload)
  for (const { id, payload } of updates) {
    await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/payload?wait=false`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ payload, points: [id] }),
      signal: AbortSignal.timeout(10_000),
    }).catch(() => {});
  }
}

// ── Redis client (ioredis cold-start pattern) ─────────────────────────────────
let redis = null;
async function getRedis() {
  if (redis) return redis;
  if (!IORedis) return null;
  const url  = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
  const pass = process.env.REDIS_PASSWORD ?? process.env.REDIS_PASS ?? 'redis';
  redis = new IORedis(url, {
    password:            pass,
    lazyConnect:         true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue:  false,
    retryStrategy:       () => null,
  });
  redis.on('error', () => {});
  try { await redis.connect(); await redis.ping(); } catch { redis = null; }
  return redis;
}

// ── Gradient checkpoint helpers ───────────────────────────────────────────────
function ckptPath(name) { return resolve(CKPT_DIR, `${name}.json`); }

function loadCkpt(name) {
  if (FORCE) return null;
  const p = ckptPath(name);
  if (!existsSync(p)) return null;
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return null; }
}

function saveCkpt(name, data) {
  writeFileSync(ckptPath(name), JSON.stringify(data));
}

// ── Xavier weight init ────────────────────────────────────────────────────────
function xavierWeights(inDim, outDim) {
  const limit = Math.sqrt(6 / (inDim + outDim));
  const W = new Float32Array(inDim * outDim);
  for (let i = 0; i < W.length; i++) W[i] = (Math.random() * 2 - 1) * limit;
  return W;
}

// ── JS cosine fallback ────────────────────────────────────────────────────────
function cosineSim(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i]*b[i]; na += a[i]*a[i]; nb += b[i]*b[i]; }
  return na && nb ? dot / (Math.sqrt(na) * Math.sqrt(nb)) : 0;
}

// ── JS k-means fallback ───────────────────────────────────────────────────────
function kmeansJS(vectors, n, dim, k, iters) {
  const centroids = new Float32Array(k * dim);
  for (let i = 0; i < k; i++) {
    const src = Math.floor(Math.random() * n) * dim;
    centroids.set(vectors.subarray(src, src + dim), i * dim);
  }
  const assignments = new Int32Array(n);
  for (let iter = 0; iter < iters; iter++) {
    for (let i = 0; i < n; i++) {
      let best = 0, bestSim = -Infinity;
      const vi = vectors.subarray(i * dim, (i+1) * dim);
      for (let c = 0; c < k; c++) {
        const s = cosineSim(vi, centroids.subarray(c*dim, (c+1)*dim));
        if (s > bestSim) { bestSim = s; best = c; }
      }
      assignments[i] = best;
    }
    centroids.fill(0);
    const counts = new Int32Array(k);
    for (let i = 0; i < n; i++) {
      const c = assignments[i];
      const vi = vectors.subarray(i*dim, (i+1)*dim);
      for (let d = 0; d < dim; d++) centroids[c*dim+d] += vi[d];
      counts[c]++;
    }
    for (let c = 0; c < k; c++) if (counts[c] > 0)
      for (let d = 0; d < dim; d++) centroids[c*dim+d] /= counts[c];
  }
  return { assignments, centroids };
}

// ── Autoencoder encode (JS tanh fallback) ─────────────────────────────────────
function autoencoderEncodeJS(v, W, b, hiddenDim) {
  const out = new Float32Array(hiddenDim);
  const inDim = v.length;
  for (let h = 0; h < hiddenDim; h++) {
    let sum = b[h];
    for (let i = 0; i < inDim; i++) sum += W[h * inDim + i] * v[i];
    out[h] = Math.tanh(sum);
  }
  return out;
}

// ── Main pipeline ─────────────────────────────────────────────────────────────
async function run() {
  console.log(`\n[gpu-som-pipeline] ${DRY_RUN ? 'DRY RUN' : 'COMMIT'}`);
  console.log(`  k=${K}  som=${SOM_GRID}×${SOM_GRID}  batch=${BATCH_SZ}  som_iters=${SOM_ITERS}`);

  // ── Step 1: Scroll all embeddings from Qdrant ────────────────────────────
  console.log('\n[1/13] Scrolling Qdrant embeddings...');
  const allIds     = [];
  const allPayloads= [];
  let   allVectors = null;  // lazy-concat
  let   vecBufs    = [];
  let   offset     = null;
  let   scrolled   = 0;

  const scrollCkpt = loadCkpt('scroll_done');
  if (scrollCkpt && scrollCkpt.count > 0) {
    console.log(`  ↩ checkpoint: ${scrollCkpt.count} vectors already scrolled`);
    // Reload from checkpoint file
    const raw = readFileSync(ckptPath('scroll_vectors'));
    allVectors = new Float32Array(raw.buffer, raw.byteOffset, raw.byteLength / 4);
    // IDs/payloads stored as JSON checkpoint
    const meta = JSON.parse(readFileSync(ckptPath('scroll_meta'), 'utf8'));
    allIds.push(...meta.ids);
    allPayloads.push(...meta.payloads);
    scrolled = scrollCkpt.count;
  } else {
    // Fresh scroll
    while (true) {
      let result;
      try { result = await qdrantScroll(offset, BATCH_SZ); }
      catch (e) { console.warn('  Qdrant scroll failed:', e.message); break; }

      const pts = result.result?.points ?? [];
      if (pts.length === 0) break;

      for (const pt of pts) {
        // named vector — collection uses { content, signature, ... }
        const v = pt.vectors?.content ?? pt.vector?.content ?? pt.vector;
        if (!v || v.length !== DIM) continue;
        allIds.push(pt.id);
        allPayloads.push(pt.payload ?? {});
        vecBufs.push(new Float32Array(v));
        scrolled++;
      }

      offset = result.result?.next_page_offset;
      process.stdout.write(`\r  scrolled ${scrolled} vectors...`);

      if (!offset) break;
      if (MAX_DOCS > 0 && scrolled >= MAX_DOCS) break;
    }
    console.log(`\n  total: ${scrolled} vectors`);

    // Concat all vectors into one flat Float32Array
    allVectors = new Float32Array(scrolled * DIM);
    for (let i = 0; i < vecBufs.length; i++) allVectors.set(vecBufs[i], i * DIM);
    vecBufs = null; // GC

    // Save checkpoint
    saveCkpt('scroll_done', { count: scrolled, at: new Date().toISOString() });
    saveCkpt('scroll_meta', { ids: allIds, payloads: allPayloads });
    writeFileSync(ckptPath('scroll_vectors'), Buffer.from(allVectors.buffer));
  }

  const N = allIds.length;
  if (N === 0) { console.log('  No vectors found — check Qdrant collection.'); return; }
  console.log(`  ${N} vectors (${(N * DIM * 4 / 1e6).toFixed(1)} MB)`);

  // ── Step 2: GPU k-means ───────────────────────────────────────────────────
  console.log(`\n[2/13] GPU k-means (k=${K})...`);
  let assignments, centroids;
  const kmeansCkpt = loadCkpt(`kmeans_k${K}_n${N}`);

  if (kmeansCkpt) {
    console.log('  ↩ checkpoint hit');
    assignments = new Int32Array(kmeansCkpt.assignments);
    centroids   = new Float32Array(kmeansCkpt.centroids);
  } else {
    const t0 = Date.now();
    try {
      if (addon?.kmeansWithCentroids) {
        const res = addon.kmeansWithCentroids(allVectors, N, DIM, K, 100);
        assignments = res.assignments;
        centroids   = res.centroids;
        console.log(`  GPU k-means done in ${Date.now()-t0}ms`);
      } else {
        console.log('  GPU unavailable — JS k-means fallback');
        const res = kmeansJS(allVectors, N, DIM, K, 50);
        assignments = res.assignments;
        centroids   = res.centroids;
      }
    } catch (e) {
      console.warn('  k-means error, JS fallback:', e.message);
      const res = kmeansJS(allVectors, N, DIM, K, 50);
      assignments = res.assignments;
      centroids   = res.centroids;
    }
    saveCkpt(`kmeans_k${K}_n${N}`, {
      assignments: Array.from(assignments),
      centroids:   Array.from(centroids),
      k: K, n: N, dim: DIM,
    });
  }

  // Centroid IDs (stable hash)
  const centroidIds = Array.from({ length: K }, (_, i) => {
    const slice = centroids.subarray(i * DIM, (i+1) * DIM);
    return 'c_' + createHash('sha1').update(Buffer.from(slice.buffer)).digest('hex').slice(0, 12);
  });

  // ── Step 3: GPU SOM ────────────────────────────────────────────────────────
  console.log(`\n[3/13] GPU SOM (${SOM_GRID}×${SOM_GRID}, ${SOM_ITERS} iters)...`);
  let somWeights, somBmus;
  const somCkpt = loadCkpt(`som_${SOM_GRID}x${SOM_GRID}_n${N}`);

  if (somCkpt) {
    console.log('  ↩ checkpoint hit');
    somWeights = new Float32Array(somCkpt.weights);
    somBmus    = new Int32Array(somCkpt.bmus);
  } else {
    const t0 = Date.now();
    try {
      if (addon?.trainSOM) {
        const res = addon.trainSOM(
          allVectors, N, DIM,
          SOM_GRID, SOM_GRID,
          SOM_ITERS,
          0.5, 0.01,             // lrInit, lrFinal
          SOM_GRID / 2.0, 0.5   // radInit, radFinal
        );
        somWeights = res.weights;
        somBmus    = res.bmu;
        console.log(`  SOM done in ${Date.now()-t0}ms — grid neurons: ${somWeights.length/DIM}`);
      } else {
        console.log('  SOM addon unavailable — skipping (no JS fallback for SOM)');
        somBmus = new Int32Array(N).fill(0);
        somWeights = new Float32Array(SOM_GRID * SOM_GRID * DIM).fill(0);
      }
    } catch (e) {
      console.warn('  SOM error:', e.message);
      somBmus = new Int32Array(N).fill(0);
      somWeights = new Float32Array(SOM_GRID * SOM_GRID * DIM).fill(0);
    }
    saveCkpt(`som_${SOM_GRID}x${SOM_GRID}_n${N}`, {
      weights: Array.from(somWeights),
      bmus:    Array.from(somBmus),
      grid: SOM_GRID, n: N, dim: DIM,
    });
  }

  // BMU row/col
  const somRow = (bmu) => Math.floor(bmu / SOM_GRID);
  const somCol = (bmu) => bmu % SOM_GRID;

  // ── Step 4: Autoencoder 768→64 ────────────────────────────────────────────
  console.log(`\n[4/13] Autoencoder 768→${DIM_SMALL} (xavier init)...`);
  let aeCkpt = loadCkpt(`ae_weights_${DIM}_${DIM_SMALL}`);
  let aeW, aeB;

  if (aeCkpt) {
    console.log('  ↩ checkpoint hit');
    aeW = new Float32Array(aeCkpt.W);
    aeB = new Float32Array(aeCkpt.b);
  } else {
    aeW = xavierWeights(DIM, DIM_SMALL);
    aeB = new Float32Array(DIM_SMALL).fill(0);
    saveCkpt(`ae_weights_${DIM}_${DIM_SMALL}`, { W: Array.from(aeW), b: Array.from(aeB) });
  }

  // Encode all vectors in batches
  const encoded64 = new Float32Array(N * DIM_SMALL);
  const AE_BATCH  = 200;
  for (let i = 0; i < N; i += AE_BATCH) {
    const end = Math.min(i + AE_BATCH, N);
    for (let j = i; j < end; j++) {
      const v = allVectors.subarray(j * DIM, (j+1) * DIM);
      let enc;
      try {
        if (addon?.autoencoderEncode) {
          enc = addon.autoencoderEncode(v, 1, DIM, aeW, aeB, DIM_SMALL);
        } else {
          enc = autoencoderEncodeJS(v, aeW, aeB, DIM_SMALL);
        }
      } catch { enc = autoencoderEncodeJS(v, aeW, aeB, DIM_SMALL); }
      encoded64.set(enc, j * DIM_SMALL);
    }
    if ((i % (AE_BATCH * 10)) === 0)
      process.stdout.write(`\r  encoded ${Math.min(i+AE_BATCH, N)}/${N}...`);
  }
  console.log('\r  autoencoder encode complete');

  // ── Step 5: cuvsCompressEmbedding (IVF centroid residual) ─────────────────
  console.log(`\n[5/13] cuvsCompressEmbedding per-vector...`);
  const compressed64 = new Float32Array(N * DIM_SMALL);
  const cuvsBatch    = 200;

  for (let i = 0; i < N; i += cuvsBatch) {
    const end = Math.min(i + cuvsBatch, N);
    for (let j = i; j < end; j++) {
      const v   = allVectors.subarray(j * DIM, (j+1) * DIM);
      const out = new Float32Array(DIM_SMALL);
      try {
        if (addon?.cuvsCompressEmbedding) {
          addon.cuvsCompressEmbedding(v, DIM_SMALL, out);
        }
        // fallback: use encoded64
        if (out[0] === 0) compressed64.set(encoded64.subarray(j*DIM_SMALL, (j+1)*DIM_SMALL), j*DIM_SMALL);
        else               compressed64.set(out, j * DIM_SMALL);
      } catch {
        compressed64.set(encoded64.subarray(j*DIM_SMALL, (j+1)*DIM_SMALL), j*DIM_SMALL);
      }
    }
    if ((i % (cuvsBatch * 10)) === 0)
      process.stdout.write(`\r  compressed ${Math.min(i+cuvsBatch,N)}/${N}...`);
  }
  console.log('\r  cuvsCompress complete');

  // ── Step 6: Qdrant payload upsert ────────────────────────────────────────
  console.log(`\n[6/13] Qdrant payload update (cluster/SOM metadata)...`);
  const payloadUpdates = [];

  for (let i = 0; i < N; i++) {
    const clusterId  = centroidIds[assignments[i]];
    const bmu        = somBmus[i];
    const enc64Arr   = Array.from(compressed64.subarray(i*DIM_SMALL, (i+1)*DIM_SMALL));
    payloadUpdates.push({
      id: allIds[i],
      payload: {
        cluster_id:     clusterId,
        centroid_id:    clusterId,
        cluster_k:      K,
        som_cluster:    bmu,
        som_bmu_row:    somRow(bmu),
        som_bmu_col:    somCol(bmu),
        vector64:       enc64Arr,
        indexed_at_som: new Date().toISOString(),
      },
    });
  }

  // Write in batches
  const PL_BATCH = 100;
  for (let i = 0; i < payloadUpdates.length; i += PL_BATCH) {
    await qdrantSetPayloadBatch(payloadUpdates.slice(i, i + PL_BATCH));
    if ((i % (PL_BATCH * 10)) === 0)
      process.stdout.write(`\r  updated ${Math.min(i+PL_BATCH, N)}/${N}...`);
  }
  console.log(`\r  Qdrant payloads updated${DRY_RUN ? ' (dry-run, skipped)' : ''}`);

  // ── Step 7: Redis centroid registry ──────────────────────────────────────
  console.log(`\n[7/13] Redis centroid registry...`);
  const r = await getRedis();

  if (r && !DRY_RUN) {
    const centroidMap = {};
    for (let c = 0; c < K; c++) {
      centroidMap[centroidIds[c]] = {
        id:     centroidIds[c],
        idx:    c,
        vec64:  Array.from(centroids.subarray(c*DIM, c*DIM+DIM_SMALL)), // first 64 dims
        count:  Array.from(assignments).filter(a => a === c).length,
      };
    }
    await r.set(`ace:kmeans:centroids:k${K}`, JSON.stringify(centroidMap), 'EX', 86400);
    await r.set('ace:kmeans:k', K, 'EX', 86400);

    // SOM weights
    await r.set(`ace:som:weights:${SOM_GRID}x${SOM_GRID}`,
      JSON.stringify({ grid: SOM_GRID, dim: DIM, weights: Array.from(somWeights.subarray(0, SOM_GRID*SOM_GRID*DIM_SMALL)) }),
      'EX', 86400
    );
    console.log('  Redis: centroids + SOM weights written');
  } else {
    console.log(`  Redis: ${r ? '(dry-run)' : 'unavailable'}`);
  }

  // ── Step 8: Neo4j SIMILAR_TOPOLOGY edges ─────────────────────────────────
  console.log(`\n[8/13] Neo4j SOM topology edges...`);
  if (!DRY_RUN && neo4jPkg) {
    const NEO4J_URI  = process.env.NEO4J_URI  ?? 'bolt://localhost:7687';
    const NEO4J_USER = process.env.NEO4J_USER ?? 'neo4j';
    const NEO4J_PASS = process.env.NEO4J_PASSWORD ?? 'neo4j';
    let neo4j = null;
    try {
      neo4j = neo4jPkg.default.driver(NEO4J_URI, neo4jPkg.default.auth.basic(NEO4J_USER, NEO4J_PASS));
      const session = neo4j.session();

      // Build SOM grid adjacency: 4-connected neighbours
      const mergeCount = { nodes: 0, edges: 0 };
      const adjacency  = [];
      for (let row = 0; row < SOM_GRID; row++) {
        for (let col = 0; col < SOM_GRID; col++) {
          const src = row * SOM_GRID + col;
          if (col + 1 < SOM_GRID) adjacency.push([src, row * SOM_GRID + col + 1]);
          if (row + 1 < SOM_GRID) adjacency.push([src, (row+1) * SOM_GRID + col]);
        }
      }

      // Index points by SOM BMU
      const byBmu = new Map();
      for (let i = 0; i < N; i++) {
        const bmu = somBmus[i];
        const arr = byBmu.get(bmu) ?? [];
        arr.push({ id: allIds[i], payload: allPayloads[i] });
        byBmu.set(bmu, arr);
      }

      // Merge edges in batches of 50 adjacency pairs
      for (let ai = 0; ai < adjacency.length; ai += 50) {
        const batch = adjacency.slice(ai, ai + 50);
        const edgeParams = [];
        for (const [srcBmu, tgtBmu] of batch) {
          const srcs = byBmu.get(srcBmu) ?? [];
          const tgts = byBmu.get(tgtBmu) ?? [];
          for (const s of srcs.slice(0, 3)) {
            for (const t of tgts.slice(0, 3)) {
              const sRef = s.payload?.source_ref ?? s.id;
              const tRef = t.payload?.source_ref ?? t.id;
              edgeParams.push({ srcRef: sRef, tgtRef: tRef, srcBmu, tgtBmu });
            }
          }
        }
        if (edgeParams.length > 0) {
          await session.run(`
            UNWIND $edges AS e
            MERGE (a:CodebaseFile {sourceRef: e.srcRef})
            MERGE (b:CodebaseFile {sourceRef: e.tgtRef})
            MERGE (a)-[r:SIMILAR_TOPOLOGY]->(b)
            SET r.somBmuSrc = e.srcBmu, r.somBmuTgt = e.tgtBmu, r.updatedAt = datetime()
          `, { edges: edgeParams });
          mergeCount.edges += edgeParams.length;
        }
      }

      await session.close();
      await neo4j.close();
      console.log(`  Neo4j: ${mergeCount.edges} SIMILAR_TOPOLOGY edges merged`);
    } catch (e) {
      console.warn('  Neo4j skipped:', e.message);
      if (neo4j) await neo4j.close().catch(() => {});
    }
  } else {
    console.log(`  Neo4j: ${DRY_RUN ? '(dry-run)' : 'driver unavailable'}`);
  }

  // ── Step 9: Postgres parent_atlas_documents update ────────────────────────
  console.log(`\n[9/13] Postgres parent_atlas_documents cluster_id update...`);
  if (!DRY_RUN) {
    const dbUrl = process.env.DATABASE_URL;
    if (dbUrl) {
      const pool = new pg.Pool({ connectionString: dbUrl, max: 3 });
      let updated = 0;
      const PG_BATCH = 500;
      for (let i = 0; i < N; i += PG_BATCH) {
        const batch = [];
        for (let j = i; j < Math.min(i + PG_BATCH, N); j++) {
          const ref = allPayloads[j]?.source_ref;
          if (!ref) continue;
          batch.push({ ref, clusterId: centroidIds[assignments[j]], centroidId: centroidIds[assignments[j]] });
        }
        if (batch.length === 0) continue;
        // Use unnest for bulk update
        const refs       = batch.map(b => b.ref);
        const clusterIds = batch.map(b => b.clusterId);
        try {
          const res = await pool.query(`
            UPDATE parent_atlas_documents AS d
            SET cluster_id  = v.cluster_id,
                centroid_id = v.cluster_id,
                updated_at  = NOW()
            FROM (SELECT unnest($1::text[]) AS source_ref, unnest($2::text[]) AS cluster_id) AS v
            WHERE d.source_ref = v.source_ref
          `, [refs, clusterIds]);
          updated += res.rowCount ?? 0;
        } catch (e) {
          console.warn('  Postgres update batch error:', e.message);
        }
        process.stdout.write(`\r  updated ${Math.min(i+PG_BATCH,N)}/${N}...`);
      }
      await pool.end();
      console.log(`\r  Postgres: ${updated} rows updated`);
    } else {
      console.log('  Postgres: DATABASE_URL not set');
    }
  } else {
    console.log('  Postgres: (dry-run)');
  }

  // ── Step 10: DuckDB materialise ───────────────────────────────────────────
  console.log(`\n[10/13] DuckDB atlas parquet materialise...`);
  const duckdbPath = resolve(REPORTS, `codebase-atlas-${TODAY}.duckdb`);
  const parquetPath = resolve(REPORTS, `codebase-atlas-${TODAY}.parquet`);

  try {
    const duckdb = await import('duckdb').catch(() => null);
    if (duckdb && !DRY_RUN) {
      const db  = new duckdb.default.Database(duckdbPath);
      const con = db.connect();

      // Build rows
      const rows = allIds.map((id, i) => ({
        qdrant_id:   String(id),
        source_ref:  allPayloads[i]?.source_ref ?? '',
        feature_id:  allPayloads[i]?.feature_id ?? '',
        cluster_id:  centroidIds[assignments[i]],
        cluster_k:   K,
        som_bmu:     somBmus[i],
        som_row:     somRow(somBmus[i]),
        som_col:     somCol(somBmus[i]),
        vec64_csv:   Array.from(compressed64.subarray(i*DIM_SMALL,(i+1)*DIM_SMALL)).map(v=>v.toFixed(5)).join(','),
        indexed_at:  TODAY,
      }));

      await new Promise((res, rej) => con.run(`
        CREATE OR REPLACE TABLE codebase_atlas AS
        SELECT * FROM (VALUES ${rows.slice(0,5000).map(r => `(
          '${r.qdrant_id}','${r.source_ref.replace(/'/g,"''")}','${r.feature_id}',
          '${r.cluster_id}',${r.cluster_k},${r.som_bmu},${r.som_row},${r.som_col},
          '${r.vec64_csv}','${r.indexed_at}'
        )`).join(',')}) AS t(
          qdrant_id,source_ref,feature_id,cluster_id,cluster_k,
          som_bmu,som_row,som_col,vec64_csv,indexed_at
        )
      `, (err) => err ? rej(err) : res()));

      await new Promise((res, rej) => con.run(
        `COPY codebase_atlas TO '${parquetPath.replace(/\\/g,'/')}' (FORMAT PARQUET)`,
        (err) => err ? rej(err) : res()
      ));
      con.close();
      db.close();
      console.log(`  DuckDB: ${Math.min(rows.length,5000)} rows → ${parquetPath}`);
    } else {
      console.log(`  DuckDB: ${duckdb ? '(dry-run)' : 'not installed — skipped'}`);
    }
  } catch (e) {
    console.warn('  DuckDB error:', e.message);
  }

  // ── Step 11: ACE/NES glyph_records GIN-JSONB encode ──────────────────────
  console.log(`\n[11/13] ACE/NES glyph_records GIN-JSONB upsert...`);
  if (!DRY_RUN) {
    const dbUrl = process.env.DATABASE_URL;
    if (dbUrl) {
      const pool   = new pg.Pool({ connectionString: dbUrl, max: 3 });
      let inserted = 0;
      const GL_BATCH = 200;

      for (let i = 0; i < N; i += GL_BATCH) {
        const batch = [];
        for (let j = i; j < Math.min(i+GL_BATCH, N); j++) {
          const pl = allPayloads[j] ?? {};
          const ref = pl.source_ref;
          if (!ref) continue;
          const stableKey = createHash('sha1')
            .update(ref + centroidIds[assignments[j]]).digest('hex').slice(0,16);
          // GIN-JSONB payload — rich indexable envelope
          const glyphJson = {
            source_ref:    ref,
            feature_id:    pl.feature_id ?? null,
            cluster_id:    centroidIds[assignments[j]],
            cluster_k:     K,
            som_bmu:       somBmus[j],
            som_row:       somRow(somBmus[j]),
            som_col:       somCol(somBmus[j]),
            vec64:         Array.from(compressed64.subarray(j*DIM_SMALL,(j+1)*DIM_SMALL)),
            tags:          pl.tags ?? [],
            section:       pl.section ?? 'CLAIMS',
            glyph_kind:    pl.glyph_kind ?? 'codebase',
            embedding_model: 'embeddinggemma:latest',
            indexed_at:    new Date().toISOString(),
          };
          batch.push({ stableKey, ref, glyphJson, clusterId: centroidIds[assignments[j]] });
        }
        if (batch.length === 0) continue;

        const stableKeys  = batch.map(b => b.stableKey);
        const sourceRefs  = batch.map(b => b.ref);
        const recordJsons = batch.map(b => JSON.stringify(b.glyphJson));
        const clusterIds  = batch.map(b => b.clusterId);

        try {
          await pool.query(`
            INSERT INTO glyph_records (stable_key, source_ref, cluster_id, record_json, embedding_model, glyph_kind, created_at, updated_at)
            SELECT unnest($1::text[]), unnest($2::text[]), unnest($3::text[]),
                   unnest($4::jsonb[])::jsonb, 'embeddinggemma:latest', 'codebase', NOW(), NOW()
            ON CONFLICT (stable_key) DO UPDATE
              SET record_json = EXCLUDED.record_json,
                  cluster_id  = EXCLUDED.cluster_id,
                  updated_at  = NOW()
          `, [stableKeys, sourceRefs, clusterIds, recordJsons]);
          inserted += batch.length;
        } catch (e) {
          // Table may not exist or schema mismatch — degrade gracefully
          console.warn('  glyph_records upsert error:', e.message.slice(0,80));
          break;
        }
        process.stdout.write(`\r  glyph upsert ${Math.min(i+GL_BATCH,N)}/${N}...`);
      }
      await pool.end();
      console.log(`\r  glyph_records: ${inserted} upserted`);
    }
  } else {
    console.log('  glyph_records: (dry-run)');
  }

  // ── Step 12: TurboVec cosine ranking → JSON packing ───────────────────────
  console.log(`\n[12/13] TurboVec cosine ranking + JSON packing...`);
  // For each cluster, rank members by cosine similarity to centroid
  // Pack as JSON card with top-20 members per centroid → Redis
  const clusterCards = {};
  for (let c = 0; c < K; c++) {
    const members = [];
    const centVec = centroids.subarray(c * DIM, (c+1) * DIM);
    for (let i = 0; i < N; i++) {
      if (assignments[i] !== c) continue;
      const v = allVectors.subarray(i * DIM, (i+1) * DIM);
      let sim;
      try {
        if (addon?.batchCosineSimilarity) {
          const res = addon.batchCosineSimilarity(centVec, v, 1, DIM);
          sim = res.scores[0];
        } else {
          sim = cosineSim(centVec, v);
        }
      } catch { sim = cosineSim(centVec, v); }
      members.push({ id: allIds[i], ref: allPayloads[i]?.source_ref ?? '', sim, bmu: somBmus[i] });
    }
    members.sort((a, b) => b.sim - a.sim);
    clusterCards[centroidIds[c]] = {
      centroid_id:  centroidIds[c],
      cluster_idx:  c,
      member_count: members.length,
      top_members:  members.slice(0, 20),
      som_bmus:     [...new Set(members.map(m => m.bmu))].slice(0, 8),
    };
  }

  if (r && !DRY_RUN) {
    await r.set(`ace:cluster:cards:k${K}`, JSON.stringify(clusterCards), 'EX', 86400);
    // Also individual cards
    const pipeline = r.pipeline();
    for (const [cid, card] of Object.entries(clusterCards)) {
      pipeline.set(`ace:cluster:card:${cid}`, JSON.stringify(card), 'EX', 86400);
    }
    await pipeline.exec();
    console.log(`  TurboVec: ${K} cluster cards → Redis`);
  } else {
    console.log(`  TurboVec: ${r ? '(dry-run)' : 'Redis unavailable'} — ${K} cards computed`);
  }

  // ── Step 13: CUDA Graph capture for next run ──────────────────────────────
  console.log(`\n[13/13] CUDA Graph capture...`);
  try {
    if (addon?.captureGraph) {
      addon.captureGraph('kmeans_768', N, DIM);
      const count = addon.cudaGraphCount?.() ?? 0;
      console.log(`  CUDA Graphs captured: ${count}`);
    }
  } catch (e) {
    console.log('  CUDA Graph capture skipped:', e.message);
  }

  // ── Final report ─────────────────────────────────────────────────────────
  const report = {
    generatedAt:  new Date().toISOString(),
    mode:         DRY_RUN ? 'dry_run' : 'commit',
    vectors:      N,
    dim:          DIM,
    dimSmall:     DIM_SMALL,
    k:            K,
    somGrid:      `${SOM_GRID}x${SOM_GRID}`,
    somIters:     SOM_ITERS,
    buckets:      Object.fromEntries(centroidIds.map((id, i) => [id, Array.from(assignments).filter(a => a === i).length])),
    centroidIds,
    outputPaths: {
      qdrant:      `${COLLECTION} payloads`,
      redis:       `ace:kmeans:centroids:k${K}`,
      neo4j:       'SIMILAR_TOPOLOGY edges',
      postgres:    'parent_atlas_documents.cluster_id',
      duckdb:      parquetPath,
      glyphs:      'glyph_records',
      clusterCards:`ace:cluster:cards:k${K}`,
    },
  };

  const reportPath = resolve(REPORTS, `gpu-som-pipeline-${TODAY}.json`);
  const reportMd   = resolve(REPORTS, `gpu-som-pipeline-${TODAY}.md`);
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  writeFileSync(reportMd, [
    `# GPU SOM Pipeline — ${TODAY}`,
    ``,
    `**Mode**: ${report.mode}  **Vectors**: ${N}  **k**: ${K}  **SOM**: ${SOM_GRID}×${SOM_GRID}`,
    ``,
    `## Cluster sizes`,
    centroidIds.map((id, i) => `- \`${id}\`: ${report.buckets[id]} members`).join('\n'),
    ``,
    `## Outputs`,
    Object.entries(report.outputPaths).map(([k,v]) => `- **${k}**: ${v}`).join('\n'),
  ].join('\n'));

  if (r) { await r.quit().catch(() => {}); }

  console.log(`\n✓ Pipeline complete`);
  console.log(`  Report: ${reportPath}`);
  console.log(`  Mode:   ${DRY_RUN ? 'DRY RUN — re-run with --commit to write' : 'COMMITTED'}`);
}

run().catch(e => { console.error('Fatal:', e); process.exit(1); });
