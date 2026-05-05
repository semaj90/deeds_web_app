#!/usr/bin/env node
/**
 * build-bow-tiles.mjs — multi-core Bag-of-Words texture tile builder.
 *
 * Reads docs/graph/codebase-graph.json, assigns each file's tags + relative path
 * to a BoW tile, then writes to Redis in pipeline batches.
 *
 * Key layout matches bag-cache.ts:
 *   texture:bow:chunk:<rel>          — per-file tile (rel path as id)
 *   texture:bow:cluster:<clusterId>  — merged cluster tile
 *
 * Multi-core strategy: main thread splits files across N workers (worker_threads).
 * Each worker extracts BoW for its slice and returns { key, json } pairs.
 * Main thread batches all pairs into Redis pipelines of BATCH_SIZE.
 *
 * Usage:
 *   node scripts/build-bow-tiles.mjs
 *   node scripts/build-bow-tiles.mjs --workers 4 --batch 500 --dry-run
 *   node scripts/build-bow-tiles.mjs --cluster-only   # only write cluster tiles
 */

import { readFileSync, existsSync } from 'node:fs';
import path      from 'node:path';
import crypto    from 'node:crypto';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

// ── Worker body (runs in worker_threads context) ───────────────────────────────

if (!isMainThread) {
  const { files, maxTerms, minLen } = workerData;
  const STOP_WORDS = new Set([
    'a','an','and','are','as','at','be','been','but','by','do','for','from',
    'has','have','he','her','his','if','in','is','it','its','not','of','on',
    'or','our','out','so','that','the','their','them','then','there','they',
    'this','to','up','was','we','were','which','will','with','you','your',
  ]);

  function buildTile(rel, tags, clusterId, som) {
    const text = [...(tags ?? []), rel.replace(/[/_.-]/g, ' ')].join(' ');
    const freq = new Map();
    for (const raw of text.toLowerCase().split(/\W+/)) {
      const t = raw.trim();
      if (t.length < minLen || STOP_WORDS.has(t)) continue;
      freq.set(t, (freq.get(t) ?? 0) + 1);
    }
    const sorted = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, maxTerms);
    const total = sorted.reduce((s, [, c]) => s + c, 0) || 1;
    return {
      tileId:         rel,
      clusterId,
      som,
      terms:          sorted.map(([t]) => t),
      weights:        sorted.map(([, c]) => +(c / total).toFixed(5)),
      sourceChunkIds: [rel],
      updatedAt:      new Date().toISOString(),
    };
  }

  const tiles = files.map(f => {
    const tile = buildTile(
      f.rel,
      f.tags ?? [],
      f.clusterId,
      f.somBmuCol !== undefined ? { x: f.somBmuCol, y: f.somBmuRow ?? 0 } : undefined
    );
    return {
      key:  `texture:bow:chunk:${f.rel}`,
      json: JSON.stringify(tile),
      tile,
    };
  });

  parentPort.postMessage(tiles);
  process.exit(0);
}

// ── Main thread ────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const WORKERS      = parseInt(args.find(a => a.startsWith('--workers='))?.split('=')[1] ?? '2', 10);
const BATCH_SIZE   = parseInt(args.find(a => a.startsWith('--batch='))?.split('=')[1] ?? '300', 10);
const TTL          = parseInt(args.find(a => a.startsWith('--ttl='))?.split('=')[1] ?? '3600', 10);
const DRY_RUN      = args.includes('--dry-run');
const CLUSTER_ONLY = args.includes('--cluster-only');
const QUIET        = args.includes('--quiet');
const REDIS_URL    = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379';
const GRAPH_PATH   = path.join(ROOT, 'docs/graph/codebase-graph.json');
const MAX_TERMS    = 64;
const MIN_LEN      = 3;

const c = {
  green:  s => `\x1b[32m${s}\x1b[0m`,
  yellow: s => `\x1b[33m${s}\x1b[0m`,
  red:    s => `\x1b[31m${s}\x1b[0m`,
  cyan:   s => `\x1b[36m${s}\x1b[0m`,
  bold:   s => `\x1b[1m${s}\x1b[0m`,
  dim:    s => `\x1b[2m${s}\x1b[0m`,
};
const log = (...a) => !QUIET && console.log(...a);

// ── Load graph ─────────────────────────────────────────────────────────────────

if (!existsSync(GRAPH_PATH)) {
  console.error(`${c.red('✗')} Graph JSON not found: ${GRAPH_PATH}`);
  console.error('Run: npm run graphify:map');
  process.exit(1);
}

const graphJson = JSON.parse(readFileSync(GRAPH_PATH, 'utf8'));
const files     = graphJson.files ?? [];
log(`${c.bold('BoW Tile Builder')} — ${files.length} files, ${WORKERS} workers, batch ${BATCH_SIZE}`);
if (DRY_RUN) log(`${c.yellow('DRY RUN — no Redis writes')}`);

// ── Connect Redis ──────────────────────────────────────────────────────────────

const { default: Redis } = await import('ioredis');
const redis = new Redis(REDIS_URL, { lazyConnect: true, connectTimeout: 3000, maxRetriesPerRequest: 1 });
try {
  await redis.ping();
  log(`${c.green('✓')} Redis connected`);
} catch {
  console.error(`${c.red('✗')} Redis unavailable`);
  process.exit(1);
}

// ── Dispatch extraction to workers ────────────────────────────────────────────

const t0         = Date.now();
const sliceSize  = Math.ceil(files.length / WORKERS);
const workerJobs = [];

for (let w = 0; w < WORKERS; w++) {
  const slice = files.slice(w * sliceSize, (w + 1) * sliceSize);
  if (!slice.length) continue;
  workerJobs.push(new Promise((resolve, reject) => {
    const worker = new Worker(new URL(import.meta.url), {
      workerData: { files: slice, maxTerms: MAX_TERMS, minLen: MIN_LEN },
    });
    worker.on('message', resolve);
    worker.on('error', reject);
    worker.on('exit', code => { if (code !== 0) reject(new Error(`Worker exited ${code}`)); });
  }));
}

log(`Dispatched ${workerJobs.length} worker(s)…`);
const workerResults = await Promise.all(workerJobs);
const allTiles      = workerResults.flat();  // [{ key, json, tile }]

log(`${c.green('✓')} Extracted ${allTiles.length} chunk tiles in ${Date.now() - t0}ms`);

// ── Merge cluster tiles ────────────────────────────────────────────────────────

const clusterMap = new Map();
for (const { tile } of allTiles) {
  if (tile.clusterId === undefined || tile.clusterId < 0) continue;
  if (!clusterMap.has(tile.clusterId)) clusterMap.set(tile.clusterId, []);
  clusterMap.get(tile.clusterId).push(tile);
}

const clusterPairs = [];
for (const [clusterId, tiles] of clusterMap) {
  const freq = new Map();
  for (const tile of tiles) {
    for (let i = 0; i < tile.terms.length; i++) {
      const t = tile.terms[i];
      const w = tile.weights[i] ?? 0;
      freq.set(t, (freq.get(t) ?? 0) + w);
    }
  }
  const sorted  = [...freq.entries()].sort((a, b) => b[1] - a[1]).slice(0, 128);
  const total   = sorted.reduce((s, [, w]) => s + w, 0) || 1;
  const merged  = {
    tileId:         `cluster:${clusterId}`,
    clusterId,
    terms:          sorted.map(([t]) => t),
    weights:        sorted.map(([, w]) => +(w / total).toFixed(5)),
    sourceChunkIds: tiles.map(t => t.tileId),
    updatedAt:      new Date().toISOString(),
  };
  clusterPairs.push({
    key:  `texture:bow:cluster:${clusterId}`,
    json: JSON.stringify(merged),
  });
}
log(`${c.green('✓')} Merged ${clusterPairs.size ?? clusterPairs.length} cluster tiles`);

// ── Batch Redis writes ─────────────────────────────────────────────────────────

const writePairs = CLUSTER_ONLY
  ? clusterPairs
  : [...allTiles.map(({ key, json }) => ({ key, json })), ...clusterPairs];

let written = 0;
if (!DRY_RUN) {
  for (let i = 0; i < writePairs.length; i += BATCH_SIZE) {
    const batch = writePairs.slice(i, i + BATCH_SIZE);
    const pipe  = redis.pipeline();
    for (const { key, json } of batch) {
      pipe.setex(key, TTL, json);
    }
    await pipe.exec();
    written += batch.length;
    if (!QUIET && writePairs.length > BATCH_SIZE) {
      process.stdout.write(`\r  Writing ${written}/${writePairs.length}…`);
    }
  }
  if (!QUIET && writePairs.length > BATCH_SIZE) process.stdout.write('\n');
}

const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
log(`\n${c.bold('═══════ BoW Tile Build Complete ═══════')}`);
log(`  Chunk tiles:   ${allTiles.length}`);
log(`  Cluster tiles: ${clusterPairs.length}`);
log(`  Written:       ${DRY_RUN ? '(dry-run)' : written}`);
log(`  TTL:           ${TTL}s`);
log(`  Elapsed:       ${elapsed}s`);

// ── Spot check ─────────────────────────────────────────────────────────────────

if (!DRY_RUN && clusterPairs.length > 0) {
  const testKey = clusterPairs[0].key;
  const val     = await redis.get(testKey);
  if (val) {
    const t = JSON.parse(val);
    log(`\n  ${c.green('✓')} Spot check ${testKey}: ${t.terms.slice(0, 5).join(', ')}`);
  } else {
    log(`  ${c.yellow('○')} Spot check: key not found (Redis write may have failed)`);
  }
}

await redis.quit();
