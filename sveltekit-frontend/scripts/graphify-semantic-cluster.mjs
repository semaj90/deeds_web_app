#!/usr/bin/env node
/**
 * graphify-semantic-cluster.mjs — Phase B: Semantic cluster mapping
 *
 * After Gemma4 LLM summaries are embedded into glyph_atlas/codebase_chunks_768,
 * this script:
 *   1. Scrolls Qdrant for directory glyph points (gemma4Summary + vector)
 *   2. GPU k-means via tensorrt_bridge.node (kmeansWithCentroids, k=20)
 *      → falls back to JS k-means when CUDA unavailable
 *   3. SOM projection of centroids (trainSOM, 4×5 grid)
 *   4. Redis cache — centroids, BMU coords, per-dir assignments (24h TTL)
 *   5. Qdrant payload writeback — gpuCluster, somRow, somCol, clusterLabel
 *   6. Backfill codebase_chunks_768 — tag file chunks with gpuCluster by dir
 *   7. 4D manifold coords — [topoClass/7, somRow/4, somCol/5, pageRank] per cluster
 *
 * Usage:
 *   node scripts/graphify-semantic-cluster.mjs
 *   node scripts/graphify-semantic-cluster.mjs --k 20 --dry-run
 *   node scripts/graphify-semantic-cluster.mjs --skip-qdrant   # Redis-only (no Qdrant writes)
 *   node scripts/graphify-semantic-cluster.mjs --skip-backfill # skip file-chunk tagging
 *   node scripts/graphify-semantic-cluster.mjs --force         # re-cluster even if cache fresh
 *
 * Deps: ioredis (npm), tensorrt_bridge.node (simd-bridge/cpp/build/Release/)
 */

import 'dotenv/config';
import { createHash }  from 'node:crypto';
import { createRequire } from 'node:module';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ── CLI ───────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
function flag(name) { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : null; }
function has(name)  { return args.includes(name); }

const K              = parseInt(flag('--k') ?? flag('-k') ?? '20', 10);
const SOM_W          = parseInt(flag('--som-w') ?? '5', 10);
const SOM_H          = parseInt(flag('--som-h') ?? '4', 10);
const DRY_RUN        = has('--dry-run');
const SKIP_QDRANT    = has('--skip-qdrant') || DRY_RUN;
const SKIP_BACKFILL  = has('--skip-backfill') || DRY_RUN;
const FORCE          = has('--force');
const QUIET          = has('--quiet');

const QDRANT_URL  = process.env.QDRANT_URL  ?? 'http://127.0.0.1:6333';
const REDIS_URL   = process.env.REDIS_URL   ?? 'redis://127.0.0.1:6379';
const GLYPH_ATLAS = 'glyph_atlas';
const CHUNKS_COL  = 'codebase_chunks_768';
const DIM         = 768;
const REDIS_TTL   = 24 * 3600;
const SCROLL_BATCH = 250;

const log   = (...a) => !QUIET && console.log(...a);
const warn  = (...a) => console.warn(...a);
const c     = { g: s=>`\x1b[32m${s}\x1b[0m`, y: s=>`\x1b[33m${s}\x1b[0m`, r: s=>`\x1b[31m${s}\x1b[0m`, b: s=>`\x1b[1m${s}\x1b[0m`, d: s=>`\x1b[2m${s}\x1b[0m` };

function normalizeSourceRef(value) {
  return String(value ?? '')
    .replace(/\\/g, '/')
    .replace(/^\/+/, '')
    .replace(/^(\.\.\/)+/, '')
    .replace(/^\.\/+/, '')
    .replace(/^sveltekit-frontend\//, '');
}

function dirOfSourceRef(value) {
  const clean = normalizeSourceRef(value);
  if (!clean) return '';
  return clean.includes('/') ? clean.split('/').slice(0, -1).join('/') : '.';
}

function dirKeyVariants(value) {
  const clean = normalizeSourceRef(value);
  const variants = new Set([clean]);
  if (clean && clean !== '.') variants.add(`../${clean}`);
  if (clean.startsWith('scripts/')) variants.add(clean.replace(/^scripts\//, '../scripts/'));
  if (clean.startsWith('../scripts/')) variants.add(clean.replace(/^\.\.\//, ''));
  return [...variants].filter(Boolean);
}

// ── Topo label table (mirrors topology-byte-mapper.ts) ────────────────────────

const TOPO_LABELS = ['unclassified','legal-evidence','api-route','ui-component',
  'database-schema','trace-retrieval','graph-gpu-topology','test-audit-devtool'];

function topoClass(dir) {
  const p = (dir ?? '').toLowerCase();
  if (/\/(tests?|spec|__tests?__|scripts?|audit|devtools?)/.test(p)) return 7;
  if (/\/(db|schema|drizzle|migrations?)\//.test(p) || /schema[-_]postgres/.test(p)) return 4;
  if (/\/(graph|hypergraph|tensor|topology|som|neo4j|gpu)\//.test(p) || /gpu|libtorch|cuda|simd/.test(p)) return 6;
  if (/\/(ace|rag|kag|retrieval|indexer|vector|qdrant|embed)/.test(p)) return 5;
  if (/\/routes\/api\//.test(p) || /\+server\.ts$/.test(p)) return 2;
  if (/\/(evidence|legal|citations?|statutes?|cases?)\//.test(p)) return 1;
  if (/\.svelte$/.test(p) || /\/components?\//.test(p) || /\/routes\/\(app\)/.test(p)) return 3;
  return 0;
}

// ── Redis ─────────────────────────────────────────────────────────────────────

const { default: Redis } = await import('ioredis');
const redis = new Redis(REDIS_URL, {
  password: process.env.REDIS_PASSWORD || undefined,
  lazyConnect: true,
  connectTimeout: 4000,
  maxRetriesPerRequest: 1
});
try {
  await redis.ping();
  log(`${c.g('✓')} Redis connected`);
} catch {
  warn(`${c.r('✗')} Redis unavailable — aborting`);
  process.exit(1);
}

// ── Check cache freshness ──────────────────────────────────────────────────────

if (!FORCE) {
  const cacheKey = `cluster:kmeans:k${K}:centroids`;
  const cached = await redis.exists(cacheKey).catch(() => 0);
  if (cached) {
    const ttl = await redis.ttl(cacheKey).catch(() => 0);
    log(`${c.g('✓')} Cluster cache fresh (TTL ${ttl}s). Use --force to re-cluster.`);
    await redis.quit().catch(() => {});
    process.exit(0);
  }
}

// ── Load GPU addon ─────────────────────────────────────────────────────────────

const addonPath = resolve(ROOT, '../simd-bridge/cpp/build/Release/tensorrt_bridge.node');
let addon = null;
let cudaAvailable = false;

try {
  const req = createRequire(import.meta.url);
  addon = req(addonPath);
  cudaAvailable = addon.checkCudaAvailable?.() === 1;
  log(`${c.g('✓')} GPU addon loaded — CUDA=${cudaAvailable}`);
} catch (err) {
  warn(`${c.y('⚠')} GPU addon unavailable (${err.message}) — using JS fallback`);
}

// ── JS k-means fallback (k-means++ init, Lloyd's iter) ─────────────────────────

function jsMeansCluster(data, n, dim, k, maxIters = 300) {
  // k-means++ seeding
  const centroids = new Float32Array(k * dim);
  const used = new Set();
  // Pick first centroid randomly
  let ci = Math.floor(Math.random() * n);
  used.add(ci);
  centroids.set(data.slice(ci * dim, ci * dim + dim), 0);

  for (let c = 1; c < k; c++) {
    // Compute D² distances from nearest centroid
    const dists = new Float32Array(n);
    let total = 0;
    for (let i = 0; i < n; i++) {
      let minD = Infinity;
      for (let j = 0; j < c; j++) {
        let d = 0;
        for (let d2 = 0; d2 < dim; d2++) {
          const diff = data[i * dim + d2] - centroids[j * dim + d2];
          d += diff * diff;
        }
        minD = Math.min(minD, d);
      }
      dists[i] = minD;
      total += minD;
    }
    // Weighted random choice
    let r = Math.random() * total;
    let chosen = n - 1;
    for (let i = 0; i < n; i++) {
      r -= dists[i];
      if (r <= 0) { chosen = i; break; }
    }
    centroids.set(data.slice(chosen * dim, chosen * dim + dim), c * dim);
  }

  // Lloyd's iterations
  const assignments = new Int32Array(n);
  for (let iter = 0; iter < maxIters; iter++) {
    let changed = 0;
    // Assignment step
    for (let i = 0; i < n; i++) {
      let bestC = 0, bestD = Infinity;
      for (let c = 0; c < k; c++) {
        let d = 0;
        for (let d2 = 0; d2 < dim; d2++) {
          const diff = data[i * dim + d2] - centroids[c * dim + d2];
          d += diff * diff;
        }
        if (d < bestD) { bestD = d; bestC = c; }
      }
      if (assignments[i] !== bestC) { assignments[i] = bestC; changed++; }
    }
    if (changed === 0) break;
    // Update step
    const counts = new Int32Array(k);
    centroids.fill(0);
    for (let i = 0; i < n; i++) {
      const c = assignments[i];
      for (let d = 0; d < dim; d++) centroids[c * dim + d] += data[i * dim + d];
      counts[c]++;
    }
    for (let c = 0; c < k; c++) {
      if (counts[c] > 0) {
        for (let d = 0; d < dim; d++) centroids[c * dim + d] /= counts[c];
      }
    }
  }
  return { assignments, centroids };
}

// ── Scroll Qdrant for glyph points ────────────────────────────────────────────

log(`\n${c.b('Stage 1')} — Scroll Qdrant glyph_atlas for directory embeddings`);

const glyphPoints = []; // { id, dir, vector: Float32Array, payload }
let offset = null;
let scrolled = 0;

async function scrollCollection(collection, withVector = true) {
  const collected = [];
  let off = null;
  while (true) {
    const body = {
      limit: SCROLL_BATCH,
      with_payload: ['dir', 'directoryPath', 'filePath', 'gemma4Summary'],
      with_vector: withVector,
      filter: { must_not: [{ is_empty: { key: 'gemma4Summary' } }] },
      ...(off ? { offset: off } : {})
    };
    const res = await fetch(`${QDRANT_URL}/collections/${collection}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) { warn(`  Qdrant scroll ${collection} HTTP ${res.status}`); break; }
    const d = await res.json();
    const pts = d.result?.points ?? [];
    collected.push(...pts);
    off = d.result?.next_page_offset;
    if (!off || pts.length === 0) break;
  }
  return collected;
}

// Try glyph_atlas first, fall back to codebase_chunks_768 (filtered to glyph points)
let rawPoints = [];
try {
  const infoRes = await fetch(`${QDRANT_URL}/collections/${GLYPH_ATLAS}`, { signal: AbortSignal.timeout(5000) });
  if (infoRes.ok) {
    const info = await infoRes.json();
    const count = info.result?.points_count ?? 0;
    log(`  glyph_atlas has ${count} points`);
    if (count > 0) rawPoints = await scrollCollection(GLYPH_ATLAS, true);
  }
} catch { /* will try fallback */ }

if (rawPoints.length < K) {
  log(`  ${c.y('⚠')} glyph_atlas has <${K} points — scrolling codebase_chunks_768 for dir glyphs`);
  try {
    const allChunks = await scrollCollection(CHUNKS_COL, true);
    // Keep only dir-level glyph points (those with gemma4Summary in payload)
    rawPoints = allChunks.filter(p => p.payload?.gemma4Summary);
  } catch (err) {
    warn(`  ${c.r('✗')} Qdrant unavailable: ${err.message}`);
    await redis.quit().catch(() => {});
    process.exit(1);
  }
}

log(`  ${c.g('✓')} Loaded ${rawPoints.length} glyph points`);
if (rawPoints.length < K) {
  warn(`  ${c.y('⚠')} Only ${rawPoints.length} glyphs, K=${K} — reducing K to ${rawPoints.length}`);
}
const effectiveK = Math.min(K, rawPoints.length);

// Build flat Float32Array for k-means
const n = rawPoints.length;
const embedMatrix = new Float32Array(n * DIM);
const pointMeta = [];

for (let i = 0; i < n; i++) {
  const pt = rawPoints[i];
  const v = pt.vector;
  const arr = Array.isArray(v) ? v : Object.values(v ?? {});
  if (arr.length !== DIM) { warn(`  ${c.y('⚠')} Point ${pt.id} has dim=${arr.length} (expected ${DIM}) — skipping`); continue; }
  for (let d = 0; d < DIM; d++) embedMatrix[i * DIM + d] = arr[d];
  pointMeta.push({
    id: pt.id,
    dir: pt.payload?.dir ?? pt.payload?.directoryPath ?? pt.payload?.filePath?.split('/').slice(0, -1).join('/') ?? '',
    gemma4Summary: pt.payload?.gemma4Summary ?? '',
    collection: rawPoints === rawPoints ? GLYPH_ATLAS : CHUNKS_COL,
  });
}

// ── Stage 2: GPU k-means ───────────────────────────────────────────────────────

log(`\n${c.b('Stage 2')} — GPU k-means (k=${effectiveK}, n=${n}, dim=${DIM})`);

let assignments, centroids;

if (addon && cudaAvailable && typeof addon.kmeansWithCentroids === 'function') {
  log(`  Using CUDA kmeansWithCentroids…`);
  const t0 = Date.now();
  const result = addon.kmeansWithCentroids(embedMatrix, n, DIM, effectiveK, 300);
  assignments = result.assignments;  // Int32Array[n]
  centroids   = result.centroids;    // Float32Array[effectiveK * DIM]
  log(`  ${c.g('✓')} GPU k-means: ${Date.now() - t0}ms`);
} else {
  log(`  Using JS k-means fallback…`);
  const t0 = Date.now();
  const result = jsMeansCluster(embedMatrix, n, DIM, effectiveK, 300);
  assignments = result.assignments;
  centroids   = result.centroids;
  log(`  ${c.g('✓')} JS k-means: ${Date.now() - t0}ms`);
}

// Cluster membership counts
const clusterSizes = new Int32Array(effectiveK);
for (let i = 0; i < n; i++) clusterSizes[assignments[i]]++;
log(`  Cluster sizes: ${Array.from(clusterSizes).join(', ')}`);

// ── Stage 3: SOM projection on centroids ──────────────────────────────────────

log(`\n${c.b('Stage 3')} — SOM projection (${SOM_W}×${SOM_H} grid, k=${effectiveK} centroids)`);

let somBmu = null;  // Int32Array[effectiveK]: BMU index (flat) per centroid

if (addon && cudaAvailable && typeof addon.trainSOM === 'function') {
  try {
    const t0 = Date.now();
    const somResult = addon.trainSOM(centroids, effectiveK, DIM, SOM_W, SOM_H,
      /* iters */ 200, /* lrInit */ 0.5, /* lrFinal */ 0.01,
      /* radInit */ 3.0, /* radFinal */ 0.5);
    somBmu = somResult.bmu;  // Int32Array[effectiveK]
    log(`  ${c.g('✓')} SOM trained: ${Date.now() - t0}ms`);
  } catch (err) {
    warn(`  ${c.y('⚠')} SOM failed: ${err.message} — using modular assignment`);
  }
}

if (!somBmu) {
  // Fallback: assign BMU by cluster index modulo grid
  somBmu = new Int32Array(effectiveK);
  for (let i = 0; i < effectiveK; i++) somBmu[i] = i % (SOM_W * SOM_H);
}

function bmuCoords(bmuIdx) {
  return { row: Math.floor(bmuIdx / SOM_W) % SOM_H, col: bmuIdx % SOM_W };
}

// ── Stage 4: Redis cache writeback ────────────────────────────────────────────

log(`\n${c.b('Stage 4')} — Redis cache writeback`);

if (!DRY_RUN) {
  const pipe = redis.pipeline();

  // Centroids: store as nested array [k][dim]
  const centroidArr = [];
  for (let i = 0; i < effectiveK; i++) {
    centroidArr.push(Array.from(centroids.slice(i * DIM, (i + 1) * DIM)));
  }
  pipe.setex(`cluster:kmeans:k${effectiveK}:centroids`, REDIS_TTL, JSON.stringify(centroidArr));

  // SOM BMU coords per centroid
  const somGrid = [];
  for (let i = 0; i < effectiveK; i++) {
    const { row, col } = bmuCoords(somBmu[i]);
    somGrid.push({ centroid: i, bmu: somBmu[i], row, col });
    pipe.setex(`cluster:kmeans:k${effectiveK}:som:${i}`, REDIS_TTL, JSON.stringify({ row, col }));
  }
  pipe.setex(`cluster:kmeans:k${effectiveK}:som:grid`, REDIS_TTL, JSON.stringify(somGrid));

  // Per-point assignments
  for (let i = 0; i < n; i++) {
    const meta = pointMeta[i];
    if (!meta) continue;
    const centroidIdx = assignments[i];
    const { row, col } = bmuCoords(somBmu[centroidIdx]);
    if (meta.dir) {
      pipe.setex(`cluster:kmeans:k${effectiveK}:dir:${meta.dir}`,
        REDIS_TTL, JSON.stringify({ centroid: centroidIdx, row, col, dir: meta.dir }));
    }
  }

  // 4D manifold coords per centroid: [topoClass/7, somRow/(H-1), somCol/(W-1), size/n]
  const manifold4 = [];
  for (let i = 0; i < effectiveK; i++) {
    const { row, col } = bmuCoords(somBmu[i]);
    // Derive representative dir for this centroid from most common dir in cluster
    const clusterDirs = pointMeta.filter((_, idx) => assignments[idx] === i).map(m => m.dir);
    const dirFreq = {};
    for (const d of clusterDirs) dirFreq[d] = (dirFreq[d] ?? 0) + 1;
    const repDir = Object.entries(dirFreq).sort((a, b) => b[1] - a[1])[0]?.[0] ?? '';
    const tClass = topoClass(repDir);
    const m4 = [
      tClass / 7,
      SOM_H > 1 ? row / (SOM_H - 1) : 0,
      SOM_W > 1 ? col / (SOM_W - 1) : 0,
      n > 0 ? clusterSizes[i] / n : 0,
    ];
    manifold4.push({ centroid: i, dir: repDir, topoClass: tClass, topoLabel: TOPO_LABELS[tClass], somRow: row, somCol: col, manifold4: m4, size: clusterSizes[i] });
    pipe.setex(`cluster:kmeans:k${effectiveK}:manifold4:${i}`, REDIS_TTL, JSON.stringify(m4));
  }
  pipe.setex(`cluster:kmeans:k${effectiveK}:manifold4:all`, REDIS_TTL, JSON.stringify(manifold4));

  await pipe.exec();
  log(`  ${c.g('✓')} Redis: centroids + BMU + dir assignments + manifold4 written (TTL ${REDIS_TTL}s)`);
} else {
  log(`  ${c.d('[dry-run] Redis writes skipped')}`);
}

// ── Stage 5: Qdrant payload writeback ─────────────────────────────────────────

log(`\n${c.b('Stage 5')} — Qdrant payload writeback (${GLYPH_ATLAS} + ${CHUNKS_COL})`);

if (!SKIP_QDRANT) {
  // Group points by cluster assignment for efficient batch set-payload calls
  const byCentroid = new Map();
  for (let i = 0; i < n; i++) {
    const meta = pointMeta[i];
    if (!meta) continue;
    const centroidIdx = assignments[i];
    if (!byCentroid.has(centroidIdx)) byCentroid.set(centroidIdx, []);
    byCentroid.get(centroidIdx).push({ id: meta.id, dir: meta.dir });
  }

  let qdrantOk = 0, qdrantFail = 0;
  for (const [centroidIdx, pts] of byCentroid) {
    const { row, col } = bmuCoords(somBmu[centroidIdx]);
    // Determine topo label from dominant dir
    const repDir = pts.reduce((acc, p) => {
      const freq = pts.filter(q => q.dir === p.dir).length;
      return freq > (pts.filter(q => q.dir === acc).length) ? p.dir : acc;
    }, pts[0]?.dir ?? '');
    const tClass = topoClass(repDir);
    const payload = {
      gpuCluster:   centroidIdx,
      som_cluster:  centroidIdx,
      centroid_id:  centroidIdx,
      somRow:       row,
      somCol:       col,
      clusterLabel: TOPO_LABELS[tClass],
      topoClass:    tClass,
    };
    const ids = pts.map(p => p.id);
    // Batch in groups of 200
    for (let b = 0; b < ids.length; b += 200) {
      const batch = ids.slice(b, b + 200);
      try {
        const res = await fetch(`${QDRANT_URL}/collections/${GLYPH_ATLAS}/points/payload`, {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ payload, points: batch }),
          signal:  AbortSignal.timeout(15_000),
        });
        if (res.ok) qdrantOk += batch.length;
        else { qdrantFail += batch.length; warn(`  Qdrant setPayload HTTP ${res.status}`); }
      } catch (err) {
        qdrantFail += batch.length;
        warn(`  Qdrant setPayload failed: ${err.message}`);
      }
    }
  }
  log(`  ${c.g('✓')} glyph_atlas: ${qdrantOk} tagged, ${qdrantFail} failed`);
} else {
  log(`  ${c.d('[skipped]')}`);
}

// ── Stage 6: Backfill codebase_chunks_768 with gpuCluster by dir ──────────────

log(`\n${c.b('Stage 6')} — Backfill ${CHUNKS_COL} file-chunks with gpuCluster`);

if (!SKIP_BACKFILL) {
  // Build dir → centroid map
  const dirToCentroid = new Map();
  for (let i = 0; i < n; i++) {
    const meta = pointMeta[i];
    if (meta?.dir) {
      const entry = { centroid: assignments[i], somRow: bmuCoords(somBmu[assignments[i]]).row, somCol: bmuCoords(somBmu[assignments[i]]).col };
      for (const key of dirKeyVariants(meta.dir)) dirToCentroid.set(key, entry);
    }
  }

  // Scroll codebase_chunks_768 to find chunks by dir, batch set gpuCluster
  let bfOk = 0, bfFail = 0;
  let bfOffset = null;

  while (true) {
    const body = { limit: SCROLL_BATCH, with_payload: ['filePath', 'relativePath', 'file_path', 'sourceRef', 'gpuCluster'], with_vector: false };
    if (bfOffset) body.offset = bfOffset;
    let res, d;
    try {
      res = await fetch(`${QDRANT_URL}/collections/${CHUNKS_COL}/points/scroll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(20_000),
      });
      if (!res.ok) { warn(`  ${CHUNKS_COL} scroll HTTP ${res.status}`); break; }
      d = await res.json();
    } catch (err) { warn(`  ${CHUNKS_COL} scroll error: ${err.message}`); break; }

    const pts = d.result?.points ?? [];
    // Group by new centroid assignment
    const byPayload = new Map();
    for (const pt of pts) {
      if (!pt.payload) continue;
      const fp = pt.payload.relativePath ?? pt.payload.filePath ?? pt.payload.file_path ?? pt.payload.sourceRef?.replace(/#chunk-\d+$/, '') ?? '';
      if (!fp) continue;
      const dir = dirOfSourceRef(fp);
      const entry = dirKeyVariants(dir).map((key) => dirToCentroid.get(key)).find(Boolean);
      if (!entry) continue;
      const key = JSON.stringify(entry);
      if (!byPayload.has(key)) byPayload.set(key, { entry, ids: [] });
      byPayload.get(key).ids.push(pt.id);
    }

    for (const { entry, ids } of byPayload.values()) {
      const payload = {
        gpuCluster:  entry.centroid,
        som_cluster: entry.centroid,
        centroid_id: entry.centroid,
        somRow:      entry.somRow,
        somCol:      entry.somCol,
      };
      for (let b = 0; b < ids.length; b += 200) {
        const batch = ids.slice(b, b + 200);
        try {
          const pr = await fetch(`${QDRANT_URL}/collections/${CHUNKS_COL}/points/payload`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ payload, points: batch }),
            signal:  AbortSignal.timeout(15_000),
          });
          if (pr.ok) bfOk += batch.length; else bfFail += batch.length;
        } catch { bfFail += ids.length; }
      }
    }

    bfOffset = d.result?.next_page_offset;
    if (!bfOffset || pts.length === 0) break;
  }

  log(`  ${c.g('✓')} ${CHUNKS_COL}: ${bfOk} file-chunks backfilled, ${bfFail} failed`);
} else {
  log(`  ${c.d('[skipped]')}`);
}

// ── Stage 7: Report ───────────────────────────────────────────────────────────

log(`\n${c.b('Stage 7')} — Cluster report`);

const manifold4All = !DRY_RUN
  ? JSON.parse(await redis.get(`cluster:kmeans:k${effectiveK}:manifold4:all`).catch(() => 'null') ?? 'null')
  : null;

log(`\n  k=${effectiveK} cluster summary:`);
for (let i = 0; i < effectiveK; i++) {
  const { row, col } = bmuCoords(somBmu[i]);
  const size = clusterSizes[i];
  const m4info = manifold4All?.[i];
  const label = m4info ? `${m4info.topoLabel} (SOM ${row},${col})` : `SOM ${row},${col}`;
  log(`  ${c.d(`[${String(i).padStart(2)}]`)} size=${String(size).padStart(3)}  ${label}`);
}

await redis.quit().catch(() => {});

log(`\n${c.g('✓')} graphify-semantic-cluster complete`);
log(`  → Run npm run graphify:cluster-summaries (if not done) for Gemma4 summaries`);
log(`  → Run npm run graphify:batch-gpu-analysis to push glyphs to ACE`);
log(`  → Run npm run tensor:topology to project manifold4 into Qdrant`);
