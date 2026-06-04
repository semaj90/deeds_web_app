#!/usr/bin/env node
/**
 * dir-pipeline.mjs — Directory-by-directory full atlas pipeline
 *
 * Walks the codebase tree directory-by-directory and runs the complete
 * intelligence pipeline for each directory bucket:
 *
 *   Phase 1  — Directory tree scan + file fingerprinting (MapReduce)
 *   Phase 2  — Embed (embeddinggemma :8081 → Ollama fallback)
 *   Phase 3  — k-means clustering (tensorrt_bridge.kmeansWithCentroids)
 *   Phase 4  — SOM 4D manifold (tensorrt_bridge.trainSOM)
 *   Phase 5  — Autoencoder 768→64 (tensorrt_bridge.autoencoderEncodeGPU)
 *   Phase 6  — Attention + reward scoring (attentionScoreGPU / rewardScoreGPU)
 *   Phase 7  — Postgres JSONB upsert (parent_atlas_documents + gpu_cluster_centroids)
 *   Phase 8  — Qdrant upsert (codebase_chunks_768 with som/cluster/ae payload)
 *   Phase 9  — Neo4j contextual tree edges (BELONGS_TO_DIR / SIMILAR_TOPOLOGY)
 *   Phase 10 — Redis collections (ace:dir:*, taxonomy:clusters:gpu:*)
 *   Phase 11 — NES/CHROM ACE packet assembly (ace:packet:* via inject-ndjson shape)
 *   Phase 12 — Engram bigram index (ace:engram:bigram:*)
 *
 * Designed to be resumable: each directory writes a `.done` sentinel to
 * .tmp/dir-pipeline/<dir-hash>.done so --resume skips completed dirs.
 *
 * Usage:
 *   node scripts/atlas/dir-pipeline.mjs --dry-run
 *   node scripts/atlas/dir-pipeline.mjs --apply
 *   node scripts/atlas/dir-pipeline.mjs --apply --resume
 *   node scripts/atlas/dir-pipeline.mjs --apply --dir src/lib/server
 *   node scripts/atlas/dir-pipeline.mjs --apply --phase 7-11   # only Postgres→Engram
 *   node scripts/atlas/dir-pipeline.mjs --apply --k 20 --batch 32 --verbose
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const require = createRequire(import.meta.url);
const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');
const SK_ROOT = path.join(ROOT, 'sveltekit-frontend');

// ─── CLI flags ──────────────────────────────────────────────────────────────

const argv = process.argv.slice(2);
const APPLY   = argv.includes('--apply');
const RESUME  = argv.includes('--resume');
const VERBOSE = argv.includes('--verbose');
const DRY_RUN = argv.includes('--dry-run') || !APPLY;

function flagVal(name, fallback) {
  const i = argv.findIndex(a => a === name || a.startsWith(name + '='));
  if (i < 0) return fallback;
  const eq = argv[i].indexOf('=');
  return eq >= 0 ? argv[i].slice(eq + 1) : (argv[i + 1] ?? fallback);
}

const K              = parseInt(flagVal('--k',     '20'), 10);
const BATCH          = parseInt(flagVal('--batch', '32'), 10);
const PHASE_RANGE    = flagVal('--phase', '1-12');
const TARGET_DIR     = flagVal('--dir',  null);
const MAX_FILES_PER_DIR = parseInt(flagVal('--max-files', '200'), 10);

const [PHASE_FROM, PHASE_TO] = PHASE_RANGE.includes('-')
  ? PHASE_RANGE.split('-').map(Number)
  : [Number(PHASE_RANGE), Number(PHASE_RANGE)];

const wantPhase = (n) => n >= PHASE_FROM && n <= PHASE_TO;

// ─── Env loader ─────────────────────────────────────────────────────────────

function loadEnv() {
  const e = { ...process.env };
  for (const p of [path.join(ROOT, 'sveltekit-frontend', '.env'), path.join(ROOT, '.env')]) {
    if (fs.existsSync(p)) {
      for (const line of fs.readFileSync(p, 'utf8').split('\n')) {
        const m = line.trim().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
        if (m && !e[m[1]]) e[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    }
  }
  return e;
}
const ENV = loadEnv();
const PG_URL    = ENV.DATABASE_URL ?? 'postgres://legal_admin:postgres@localhost:5432/legal_ai_db';
const QDRANT_URL = ENV.QDRANT_URL  ?? 'http://127.0.0.1:6333';
const REDIS_HOST = ENV.REDIS_HOST  ?? '127.0.0.1';
const REDIS_PORT = parseInt(ENV.REDIS_PORT ?? '6379', 10);
const REDIS_PASS = ENV.REDIS_PASSWORD ?? ENV.REDIS_PASS ?? '';
const EMBED_URL  = ENV.OLLAMA_EMBED_BASE_URL ?? ENV.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434';
const EMBED_MODEL = ENV.OLLAMA_EMBED_MODEL ?? 'embeddinggemma:latest';
const NEO4J_HTTP = (ENV.NEO4J_URL ?? 'bolt://localhost:7687')
  .replace('bolt://', 'http://').replace(':7687', ':7474');
const NEO4J_USER = ENV.NEO4J_USER ?? 'neo4j';
const NEO4J_PASS = ENV.NEO4J_PASSWORD ?? ENV.NEO4J_PASS ?? 'neo4j';

// ─── GPU addon ──────────────────────────────────────────────────────────────

let addon = null;
try {
  addon = require(path.join(ROOT, 'simd-bridge/cpp/build/Release/tensorrt_bridge.node'));
  const free = new BigInt64Array(1), total = new BigInt64Array(1);
  addon.getCudaMemory(free, total);
  console.log(`[GPU] addon loaded — CUDA=${addon.checkCudaAvailable()} vram=${(Number(total[0]) / 1024 ** 3).toFixed(1)}GB`);
} catch {
  console.warn('[GPU] addon not loaded — CPU fallback');
}

// ─── Lazy deps ──────────────────────────────────────────────────────────────

let _pg = null;
async function pgPool() {
  if (!_pg) {
    const { default: pg } = await import('pg');
    _pg = new pg.Pool({ connectionString: PG_URL, max: 5 });
  }
  return _pg;
}

let _redis = null;
async function redisClient() {
  if (!_redis) {
    const { default: Redis } = await import('ioredis');
    _redis = new Redis({ host: REDIS_HOST, port: REDIS_PORT, password: REDIS_PASS || undefined,
      lazyConnect: true, maxRetriesPerRequest: 1, enableOfflineQueue: false,
      retryStrategy: () => null });
    _redis.on('error', () => {});
    try { await _redis.connect(); } catch { _redis = null; }
  }
  return _redis;
}

// ─── Utilities ──────────────────────────────────────────────────────────────

function sha1(s) { return crypto.createHash('sha1').update(s).digest('hex'); }

function log(msg, level = 'info') {
  const prefix = level === 'warn' ? '[WARN]' : level === 'err' ? '[ERR] ' : '[    ]';
  console.log(`${prefix} ${msg}`);
}

function verbose(msg) { if (VERBOSE) log(msg); }

// ─── Phase 1: Directory scan ─────────────────────────────────────────────────

const SRC_ROOTS = [
  path.join(SK_ROOT, 'src'),
  path.join(SK_ROOT, 'scripts'),
  path.join(ROOT, 'scripts'),
];

const SKIP_DIRS = new Set([
  'node_modules', '.git', '.svelte-kit', 'build', 'dist',
  '__pycache__', '.opencode', '.tmp', 'logs', 'out',
]);
const CODE_EXTS = new Set(['.ts', '.tsx', '.svelte', '.mjs', '.mts', '.js', '.py']);

function scanDirectories(root) {
  const dirMap = new Map(); // dirPath → string[] file paths
  function walk(dir) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    const files = [];
    for (const e of entries) {
      if (SKIP_DIRS.has(e.name)) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) { walk(full); }
      else if (e.isFile() && CODE_EXTS.has(path.extname(e.name))) {
        files.push(full);
      }
    }
    if (files.length > 0) dirMap.set(dir, files);
  }
  walk(root);
  return dirMap;
}

// ─── Phase 2: Embed ──────────────────────────────────────────────────────────

async function embedTexts(texts) {
  const isV1 = EMBED_URL.includes('8081') || EMBED_URL.includes('/v1');
  const url = isV1
    ? `${EMBED_URL.replace(/\/v1\/embeddings$/, '').replace(/\/$/, '')}/v1/embeddings`
    : `${EMBED_URL.replace(/\/$/, '')}/api/embed`;

  // Batch embed using /api/embed (multi-prompt) or /v1/embeddings
  try {
    const body = isV1
      ? JSON.stringify({ model: EMBED_MODEL, input: texts })
      : JSON.stringify({ model: EMBED_MODEL, input: texts });

    const res = await fetch(url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body, signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`embed ${res.status}`);
    const data = await res.json();

    if (isV1) {
      return (data.data ?? []).map(d => d.embedding ?? null);
    }
    // Ollama /api/embed returns { embeddings: [[...], [...]] }
    return data.embeddings ?? data.embedding ? [data.embedding] : [];
  } catch (e) {
    verbose(`[embed] error: ${e.message} — returning nulls`);
    return texts.map(() => null);
  }
}

// ─── Phase 3: k-means + centroids ────────────────────────────────────────────

function kmeansGpu(embeddings, k) {
  if (!addon?.kmeansWithCentroids) return cpuKmeans(embeddings, k);
  try {
    const dim = embeddings[0].length;
    const flat = new Float32Array(embeddings.length * dim);
    embeddings.forEach((e, i) => flat.set(e, i * dim));
    const result = addon.kmeansWithCentroids(flat, embeddings.length, dim, k, 100);
    return {
      labels: Array.from(result.labels),
      centroids: result.centroids,
      k,
    };
  } catch (e) {
    verbose(`[kmeans] GPU failed (${e.message}), CPU fallback`);
    return cpuKmeans(embeddings, k);
  }
}

function cpuKmeans(embeddings, k) {
  const n = embeddings.length;
  const dim = embeddings[0].length;
  // Simple random-init k-means (max 50 iters)
  let centroids = embeddings.slice(0, k).map(e => Float32Array.from(e));
  let labels = new Int32Array(n);

  for (let iter = 0; iter < 50; iter++) {
    // Assign
    let changed = false;
    for (let i = 0; i < n; i++) {
      let best = 0, bestDist = Infinity;
      for (let c = 0; c < k; c++) {
        let dist = 0;
        for (let d = 0; d < dim; d++) dist += (embeddings[i][d] - centroids[c][d]) ** 2;
        if (dist < bestDist) { bestDist = dist; best = c; }
      }
      if (labels[i] !== best) { labels[i] = best; changed = true; }
    }
    if (!changed) break;
    // Update centroids
    const sums = Array.from({ length: k }, () => new Float32Array(dim));
    const counts = new Int32Array(k);
    for (let i = 0; i < n; i++) { counts[labels[i]]++; for (let d = 0; d < dim; d++) sums[labels[i]][d] += embeddings[i][d]; }
    for (let c = 0; c < k; c++) { if (counts[c] > 0) for (let d = 0; d < dim; d++) centroids[c][d] = sums[c][d] / counts[c]; }
  }

  // Pack centroids as flat Float32Array
  const centroidsFlat = new Float32Array(k * dim);
  centroids.forEach((c, i) => centroidsFlat.set(c, i * dim));
  return { labels: Array.from(labels), centroids: centroidsFlat, k };
}

// ─── Phase 4: SOM (thin wrapper) ─────────────────────────────────────────────

function somGpu(embeddings, gridW, gridH) {
  if (!addon?.trainSOM) return { bmuRows: embeddings.map(() => 0), bmuCols: embeddings.map(() => 0) };
  try {
    const dim = embeddings[0].length;
    const flat = new Float32Array(embeddings.length * dim);
    embeddings.forEach((e, i) => flat.set(e, i * dim));
    const result = addon.trainSOM(flat, embeddings.length, dim, gridW, gridH, 100, 0.5, gridW / 2);
    return {
      bmuRows: Array.from(result.bmuRows ?? result.labels ?? []),
      bmuCols: Array.from(result.bmuCols ?? result.labels ?? []),
    };
  } catch {
    return { bmuRows: embeddings.map(() => 0), bmuCols: embeddings.map(() => 0) };
  }
}

// ─── Phase 5: Autoencoder encode ─────────────────────────────────────────────

function aeEncode(embeddings) {
  if (!addon?.autoencoderEncodeGPU) return embeddings.map(e => Array.from(e.slice(0, 64)));
  try {
    const dim = embeddings[0].length;
    const flat = new Float32Array(embeddings.length * dim);
    embeddings.forEach((e, i) => flat.set(e, i * dim));
    const enc = addon.autoencoderEncodeGPU(flat, embeddings.length, dim, 64);
    const out = [];
    for (let i = 0; i < embeddings.length; i++) out.push(Array.from(enc.slice(i * 64, (i + 1) * 64)));
    return out;
  } catch {
    return embeddings.map(e => Array.from(e.slice(0, 64)));
  }
}

// ─── Phase 6: Attention + reward ─────────────────────────────────────────────

function attentionScores(probeEmb, embeddings) {
  if (!addon?.attentionScoreGPU) return embeddings.map(() => 0.5);
  try {
    const dim = probeEmb.length;
    const flat = new Float32Array(embeddings.length * dim);
    embeddings.forEach((e, i) => flat.set(e, i * dim));
    return Array.from(addon.attentionScoreGPU(Float32Array.from(probeEmb), dim, flat, embeddings.length));
  } catch {
    return embeddings.map(() => 0.5);
  }
}

function rewardScores(attnScores, kmLabels, k) {
  if (!addon?.rewardScoreGPU) return attnScores.map((a, i) => 0.4 * a + 0.3 * 0.5 + 0.3 * (kmLabels[i] / k));
  try {
    return Array.from(addon.rewardScoreGPU(Float32Array.from(attnScores)));
  } catch {
    return attnScores.map((a, i) => 0.4 * a + 0.6 * (kmLabels[i] / k));
  }
}

// ─── Phase 7: Postgres JSONB upsert ──────────────────────────────────────────

async function upsertDirToPostgres(dirRecord) {
  if (DRY_RUN) return;
  const pool = await pgPool().catch(() => null);
  if (!pool) return;
  try {
    // parent_atlas_documents upsert
    await pool.query(`
      INSERT INTO parent_atlas_documents
        (source_ref, lane, title, feature_ids, cluster_id, som_cluster,
         embedding, ae_embedding, karpathy_blend, payload_jsonb, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7::real[], $8::real[], $9, $10::jsonb, NOW())
      ON CONFLICT (source_ref) DO UPDATE SET
        lane = EXCLUDED.lane,
        feature_ids = EXCLUDED.feature_ids,
        cluster_id  = EXCLUDED.cluster_id,
        som_cluster = EXCLUDED.som_cluster,
        embedding   = EXCLUDED.embedding,
        ae_embedding = EXCLUDED.ae_embedding,
        karpathy_blend = EXCLUDED.karpathy_blend,
        payload_jsonb  = EXCLUDED.payload_jsonb,
        updated_at  = NOW()
    `, [
      dirRecord.source_ref,
      dirRecord.lane,
      dirRecord.title,
      dirRecord.feature_ids,
      dirRecord.cluster_id,
      dirRecord.som_cluster,
      dirRecord.embedding ? `{${dirRecord.embedding.join(',')}}` : null,
      dirRecord.ae_embedding ? `{${dirRecord.ae_embedding.join(',')}}` : null,
      dirRecord.karpathy_blend,
      JSON.stringify(dirRecord.payload),
    ]).catch(() => {});

    // gpu_cluster_centroids upsert — only if we have centroid data
    if (dirRecord.centroid) {
      await pool.query(`
        INSERT INTO gpu_cluster_centroids (cluster_id, centroid, label, source_count, updated_at)
        VALUES ($1, $2::real[], $3, $4, NOW())
        ON CONFLICT (cluster_id) DO UPDATE SET
          centroid = EXCLUDED.centroid,
          label    = EXCLUDED.label,
          source_count = EXCLUDED.source_count,
          updated_at = NOW()
      `, [
        dirRecord.cluster_id,
        `{${dirRecord.centroid.join(',')}}`,
        dirRecord.title,
        dirRecord.source_count ?? 1,
      ]).catch(() => {});
    }
  } catch (e) {
    verbose(`[pg] upsert error for ${dirRecord.source_ref}: ${e.message}`);
  }
}

// ─── Phase 8: Qdrant upsert ──────────────────────────────────────────────────

async function upsertToQdrant(points, collection = 'codebase_chunks_768') {
  if (DRY_RUN || !points.length) return 0;
  try {
    const res = await fetch(`${QDRANT_URL}/collections/${collection}/points`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points }),
      signal: AbortSignal.timeout(30_000),
    });
    return res.ok ? points.length : 0;
  } catch {
    return 0;
  }
}

// ─── Phase 9: Neo4j edge upsert ──────────────────────────────────────────────

async function upsertNeo4jDirEdges(dirPath, fileSourceRefs, clusterLabel) {
  if (DRY_RUN) return;
  const dirId = `dir:${dirPath.replace(/\\/g, '/')}`;
  const statements = [];

  // MERGE the directory node
  statements.push({
    statement: `MERGE (d:DirectoryNode {id: $id}) SET d.path = $path, d.cluster = $cluster, d.updatedAt = datetime()`,
    parameters: { id: dirId, path: dirPath, cluster: clusterLabel ?? '' },
  });

  // MERGE file → dir edges (BELONGS_TO_DIR)
  for (const ref of fileSourceRefs.slice(0, 50)) {
    statements.push({
      statement: `
        MATCH (f:CodebaseFile {id: $ref})
        MERGE (d:DirectoryNode {id: $dirId})
        MERGE (f)-[:BELONGS_TO_DIR]->(d)
      `,
      parameters: { ref, dirId },
    });
  }

  // SIMILAR_TOPOLOGY between sibling files in same cluster
  if (fileSourceRefs.length >= 2) {
    for (let i = 0; i < Math.min(fileSourceRefs.length - 1, 10); i++) {
      statements.push({
        statement: `
          MATCH (a:CodebaseFile {id: $a}), (b:CodebaseFile {id: $b})
          MERGE (a)-[r:SIMILAR_TOPOLOGY]->(b) SET r.cluster = $cluster, r.updatedAt = datetime()
        `,
        parameters: { a: fileSourceRefs[i], b: fileSourceRefs[i + 1], cluster: clusterLabel ?? '' },
      });
    }
  }

  if (!statements.length) return;
  try {
    await fetch(`${NEO4J_HTTP}/db/neo4j/tx/commit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json',
        'Authorization': 'Basic ' + Buffer.from(`${NEO4J_USER}:${NEO4J_PASS}`).toString('base64') },
      body: JSON.stringify({ statements }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    verbose(`[neo4j] edge write failed for ${dirPath}`);
  }
}

// ─── Phase 10: Redis collections ─────────────────────────────────────────────

async function writeRedisDir(dirPath, dirRecord) {
  const redis = await redisClient().catch(() => null);
  if (!redis) return;
  const key = `ace:dir:${sha1(dirPath)}`;
  const val = JSON.stringify({
    dir_path: dirPath,
    source_ref: dirRecord.source_ref,
    cluster_id: dirRecord.cluster_id,
    som_cluster: dirRecord.som_cluster,
    karpathy_blend: dirRecord.karpathy_blend,
    feature_ids: dirRecord.feature_ids,
    file_count: dirRecord.source_count,
    updated_at: new Date().toISOString(),
  });
  try {
    if (!DRY_RUN) await redis.setex(key, 86400, val); // 24h TTL
    // Also write centroid to taxonomy key
    if (dirRecord.embedding && !DRY_RUN) {
      const centKey = `taxonomy:clusters:gpu:${dirRecord.cluster_id}`;
      const existing = await redis.get(centKey).catch(() => null);
      if (!existing) {
        await redis.setex(centKey, 86400 * 6, JSON.stringify(Array.from(dirRecord.embedding)));
      }
    }
  } catch {
    verbose(`[redis] write failed for ${dirPath}`);
  }
}

// ─── Phase 11: NES/CHROM ACE packet assembly ─────────────────────────────────

async function writeAcePacket(dirPath, dirRecord, snippets) {
  const redis = await redisClient().catch(() => null);
  if (!redis) return;
  const packetId = `dir:${sha1(dirPath)}`;
  const packet = {
    packet_id: packetId,
    source_refs: dirRecord.file_refs ?? [],
    feature_ids: dirRecord.feature_ids,
    lane_ids: ['dir-pipeline'],
    cluster_id: dirRecord.cluster_id ?? '',
    som_cluster: dirRecord.som_cluster ?? '',
    qdrant_point_ids: dirRecord.qdrant_ids ?? [],
    neo4j_neighbor_ids: [],
    redis_hot_keys: [`ace:dir:${sha1(dirPath)}`],
    engram_ids: [],
    nes_chrom_packet_keys: [],
    ranked_cards: snippets.slice(0, 5).map((s, i) => ({
      rank: i + 1,
      source_ref: s.ref,
      score: s.score ?? 0.5,
      snippet: s.snippet ?? '',
    })),
    prompt_context: [
      `## Directory: ${dirPath}`,
      `Cluster: ${dirRecord.cluster_id} | SOM: ${dirRecord.som_cluster}`,
      snippets.slice(0, 3).map(s => `- ${s.ref}: ${s.snippet ?? ''}`).join('\n'),
    ].join('\n'),
    atlas_cluster_ids: [dirRecord.cluster_id ?? ''],
    karpathy_blend: dirRecord.karpathy_blend ?? 0,
    cache_hit: 'none',
    degraded: false,
    created_at: new Date().toISOString(),
  };

  try {
    if (!DRY_RUN) {
      await redis.setex(`ace:packet:${packetId}`, 86400, JSON.stringify(packet));
      // Index by each source_ref for Lane 2 of query-router
      for (const ref of packet.source_refs.slice(0, 20)) {
        await redis.setex(`ace:source_ref:${sha1(ref)}`, 86400, JSON.stringify(packet));
      }
    }
    return packet;
  } catch {
    return null;
  }
}

// ─── Phase 12: Engram bigram index ───────────────────────────────────────────

async function writeEngramBigram(dirRecord) {
  const redis = await redisClient().catch(() => null);
  if (!redis || DRY_RUN) return;
  // Record this directory's source_refs as an engram query so query-router
  // Lane 1.5 can suggest related dirs from co-occurrence in future sessions.
  const queryHash = sha1(dirRecord.source_ref);
  try {
    for (const ref of (dirRecord.file_refs ?? []).slice(0, 5)) {
      const refHash = sha1(ref);
      // ZADD with score = blend weight (higher = more relevant neighbor)
      await redis.zadd(`ace:engram:bigram:${queryHash}`, dirRecord.karpathy_blend ?? 0.5, refHash);
    }
    // Store the engram context card
    await redis.setex(`ace:engram:query:${queryHash}`, 86400, JSON.stringify({
      source_ref: dirRecord.source_ref,
      cluster_id: dirRecord.cluster_id,
      blend: dirRecord.karpathy_blend,
    }));
  } catch {
    verbose(`[engram] write failed for ${dirRecord.source_ref}`);
  }
}

// ─── Checkpoint helpers ───────────────────────────────────────────────────────

const SENTINEL_DIR = path.join(ROOT, '.tmp', 'dir-pipeline');

function isDone(dirPath) {
  return RESUME && fs.existsSync(path.join(SENTINEL_DIR, `${sha1(dirPath)}.done`));
}
function markDone(dirPath) {
  fs.mkdirSync(SENTINEL_DIR, { recursive: true });
  fs.writeFileSync(path.join(SENTINEL_DIR, `${sha1(dirPath)}.done`), dirPath, 'utf8');
}

// ─── Single-directory processor ──────────────────────────────────────────────

async function processDir(dirPath, files, stats) {
  if (isDone(dirPath)) {
    verbose(`[skip] ${dirPath} (sentinel)`);
    stats.skipped++;
    return;
  }

  const relDir = path.relative(ROOT, dirPath).replace(/\\/g, '/');
  const cap = Math.min(files.length, MAX_FILES_PER_DIR);
  const sample = files.slice(0, cap);

  verbose(`[dir] ${relDir} (${sample.length} files)`);

  // Build text snippets: first 200 chars of each file
  const snippets = sample.map(f => {
    let text = '';
    try { text = fs.readFileSync(f, 'utf8').slice(0, 300).replace(/\s+/g, ' ').trim(); } catch {}
    return { ref: `file:${path.relative(ROOT, f).replace(/\\/g, '/')}`, snippet: text };
  });

  const texts = snippets.map(s => `${s.ref}: ${s.snippet}`);

  // ── Phase 2: Embed ─────────────────────────────────────────────────────
  let embeddings = [];
  if (wantPhase(2)) {
    embeddings = await embedTexts(texts);
    embeddings = embeddings.map(e => e ?? new Array(768).fill(0));
  } else {
    embeddings = texts.map(() => new Array(768).fill(0));
  }

  const validEmbeddings = embeddings.filter(e => e && e.length > 0);
  if (!validEmbeddings.length) {
    verbose(`[dir] ${relDir} — no embeddings, skipping downstream phases`);
    stats.errors++;
    return;
  }

  // Use mean of all file embeddings as the directory centroid
  const dim = validEmbeddings[0].length;
  const dirEmbedding = new Array(dim).fill(0);
  for (const e of validEmbeddings) for (let d = 0; d < dim; d++) dirEmbedding[d] += e[d] / validEmbeddings.length;

  // ── Phase 3: k-means ───────────────────────────────────────────────────
  let kmResult = { labels: embeddings.map(() => 0), centroids: null, k: K };
  if (wantPhase(3) && validEmbeddings.length >= K) {
    kmResult = kmeansGpu(validEmbeddings, Math.min(K, validEmbeddings.length));
  } else if (wantPhase(3)) {
    kmResult = kmeansGpu(validEmbeddings, Math.max(1, validEmbeddings.length));
  }

  // Directory cluster = majority label
  const labelCounts = new Map();
  for (const l of kmResult.labels) labelCounts.set(l, (labelCounts.get(l) ?? 0) + 1);
  const dirCluster = [...labelCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? 0;
  const clusterLabel = `dir:${sha1(relDir)}:c${dirCluster}`;

  // ── Phase 4: SOM ───────────────────────────────────────────────────────
  let somBmu = { bmuRows: embeddings.map(() => 0), bmuCols: embeddings.map(() => 0) };
  if (wantPhase(4) && validEmbeddings.length >= 2) {
    const gridSide = Math.max(2, Math.ceil(Math.sqrt(Math.min(validEmbeddings.length, 25))));
    somBmu = somGpu(validEmbeddings, gridSide, gridSide);
  }

  // Dir SOM = majority BMU
  const somCounts = new Map();
  for (let i = 0; i < somBmu.bmuRows.length; i++) {
    const key = `${somBmu.bmuRows[i]}:${somBmu.bmuCols[i]}`;
    somCounts.set(key, (somCounts.get(key) ?? 0) + 1);
  }
  const dirSom = [...somCounts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? '0:0';

  // ── Phase 5: AE encode ─────────────────────────────────────────────────
  let aeVecs = embeddings.map(e => e.slice(0, 64));
  if (wantPhase(5) && validEmbeddings.length > 0) {
    aeVecs = aeEncode(validEmbeddings);
  }
  const dirAe = aeVecs[0] ?? new Array(64).fill(0);

  // ── Phase 6: Attention + reward ────────────────────────────────────────
  let attnScores = validEmbeddings.map(() => 0.5);
  let rwdScores  = validEmbeddings.map(() => 0.5);
  if (wantPhase(6) && validEmbeddings.length > 0) {
    attnScores = attentionScores(dirEmbedding, validEmbeddings);
    rwdScores  = rewardScores(attnScores, kmResult.labels, kmResult.k);
  }
  const dirAttn  = attnScores.reduce((s, v) => s + v, 0) / (attnScores.length || 1);
  const dirRwd   = rwdScores.reduce((s, v) => s + v, 0) / (rwdScores.length || 1);

  // Karpathy blend (0.4·PR + 0.3·attn + 0.3·authority) — PR ≈ rwd here
  const karpathyBlend = 0.4 * dirRwd + 0.3 * dirAttn + 0.3 * (dirCluster / Math.max(K, 1));

  // Pull centroid for this cluster from kmResult
  let centroid = null;
  if (kmResult.centroids) {
    centroid = Array.from(kmResult.centroids.slice(dirCluster * dim, (dirCluster + 1) * dim));
  } else {
    centroid = dirEmbedding;
  }

  const sourceRef = `dir:${relDir}`;
  const fileRefs  = snippets.map(s => s.ref);

  const dirRecord = {
    source_ref: sourceRef,
    lane: 'dir-pipeline',
    title: relDir,
    feature_ids: [relDir.split('/')[0] ?? 'root'],
    cluster_id: clusterLabel,
    som_cluster: dirSom,
    embedding: dirEmbedding,
    ae_embedding: dirAe,
    karpathy_blend: karpathyBlend,
    centroid,
    source_count: sample.length,
    file_refs: fileRefs,
    qdrant_ids: [],
    payload: {
      dir_path: relDir,
      file_count: files.length,
      sampled: sample.length,
      top_files: fileRefs.slice(0, 10),
      som_bmu: dirSom,
      cluster_label: clusterLabel,
    },
  };

  // ── Phase 7: Postgres ──────────────────────────────────────────────────
  if (wantPhase(7)) await upsertDirToPostgres(dirRecord);

  // ── Phase 8: Qdrant ────────────────────────────────────────────────────
  if (wantPhase(8) && dirEmbedding.some(v => v !== 0)) {
    const qdrantId = parseInt(sha1(sourceRef).slice(0, 8), 16);
    const points = [{
      id: qdrantId,
      vector: { content: dirEmbedding },
      payload: {
        source_ref: sourceRef,
        dir_path: relDir,
        cluster_id: clusterLabel,
        som_bmu_row: parseInt(dirSom.split(':')[0], 10),
        som_bmu_col: parseInt(dirSom.split(':')[1], 10),
        karpathy_blend: karpathyBlend,
        file_count: sample.length,
        lane: 'dir-pipeline',
        updated_at: new Date().toISOString(),
      },
    }];
    const n = await upsertToQdrant(points);
    if (n) dirRecord.qdrant_ids.push(qdrantId);
  }

  // ── Phase 9: Neo4j ─────────────────────────────────────────────────────
  if (wantPhase(9)) await upsertNeo4jDirEdges(relDir, fileRefs, clusterLabel);

  // ── Phase 10: Redis ────────────────────────────────────────────────────
  if (wantPhase(10)) await writeRedisDir(relDir, dirRecord);

  // ── Phase 11: ACE packet ───────────────────────────────────────────────
  if (wantPhase(11)) await writeAcePacket(relDir, dirRecord, snippets);

  // ── Phase 12: Engram ───────────────────────────────────────────────────
  if (wantPhase(12)) await writeEngramBigram(dirRecord);

  markDone(dirPath);
  stats.processed++;
  verbose(`[done] ${relDir} blend=${karpathyBlend.toFixed(3)} cluster=${clusterLabel}`);
}

// ─── Batch processor ─────────────────────────────────────────────────────────

async function processBatch(entries, stats) {
  for (let i = 0; i < entries.length; i += BATCH) {
    const batch = entries.slice(i, i + BATCH);
    await Promise.all(batch.map(([dir, files]) => processDir(dir, files, stats)));
    if (!DRY_RUN) log(`Progress: ${stats.processed}/${stats.total} dirs (${stats.errors} errors)`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const stats = { processed: 0, skipped: 0, errors: 0, total: 0 };
  const startTime = Date.now();

  log(`dir-pipeline starting — phases ${PHASE_FROM}-${PHASE_TO}, k=${K}, batch=${BATCH}, ${DRY_RUN ? 'DRY-RUN' : 'APPLY'}`);

  // Phase 1: scan all source roots
  const allDirs = new Map();
  if (!wantPhase(1)) {
    log('[phase1] skipped by --phase flag');
  } else {
    for (const root of SRC_ROOTS) {
      if (!fs.existsSync(root)) { verbose(`[scan] root not found: ${root}`); continue; }

      // Filter to a single target dir if specified
      const scanRoot = TARGET_DIR
        ? path.resolve(ROOT, TARGET_DIR)
        : root;
      if (TARGET_DIR && !fs.existsSync(scanRoot)) {
        log(`[WARN] --dir target not found: ${scanRoot}`);
        continue;
      }

      const subDirs = scanDirectories(scanRoot);
      for (const [dir, files] of subDirs) allDirs.set(dir, files);
    }
  }

  const entries = [...allDirs.entries()];
  stats.total = entries.length;
  log(`Found ${entries.length} directories with source files`);

  if (DRY_RUN) {
    log('DRY-RUN: first 10 directories that would be processed:');
    entries.slice(0, 10).forEach(([dir, files]) => {
      console.log(`  ${path.relative(ROOT, dir).replace(/\\/g, '/')} (${files.length} files)`);
    });
    log(`\nTo run: node scripts/atlas/dir-pipeline.mjs --apply`);
    return;
  }

  await processBatch(entries, stats);

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const report = {
    run_at: new Date().toISOString(),
    elapsed_s: parseFloat(elapsed),
    dirs_total: stats.total,
    dirs_processed: stats.processed,
    dirs_skipped: stats.skipped,
    dirs_errors: stats.errors,
    phases: `${PHASE_FROM}-${PHASE_TO}`,
    k, batch: BATCH,
  };

  fs.mkdirSync(path.join(ROOT, 'memory', 'exports'), { recursive: true });
  fs.writeFileSync(
    path.join(ROOT, 'memory', 'exports', 'dir-pipeline-report.json'),
    JSON.stringify(report, null, 2)
  );

  log(`\nDone in ${elapsed}s — ${stats.processed} processed, ${stats.skipped} skipped, ${stats.errors} errors`);
  log(`Report: memory/exports/dir-pipeline-report.json`);

  // Cleanup connections
  if (_redis) { await _redis.quit().catch(() => {}); }
  if (_pg)    { await _pg.end().catch(() => {}); }
}

main().catch(err => {
  console.error('[FATAL]', err);
  process.exit(1);
});
