#!/usr/bin/env node
/**
 * ingest-opencode-cards.mjs
 *
 * Ingests .opencode/cards/*.json into:
 *   1. Redis HASH  — key: `atlas:card:{id}`  (hot lookup)
 *   2. Qdrant      — collection: opencode_cards_768 (semantic search)
 *
 * NES JSON canonical format for each card:
 *   { id, title, text, source, embedding?, tags[], ingestedAt }
 *
 * Cards are idempotent — re-running only updates changed ones (hash of text).
 *
 * Usage:
 *   node scripts/atlas/ingest-opencode-cards.mjs
 *   node scripts/atlas/ingest-opencode-cards.mjs --dry-run
 *   node scripts/atlas/ingest-opencode-cards.mjs --limit 500
 *   node scripts/atlas/ingest-opencode-cards.mjs --no-embed       # skip Qdrant embedding
 *   node scripts/atlas/ingest-opencode-cards.mjs --no-redis       # skip Redis
 *   node scripts/atlas/ingest-opencode-cards.mjs --collection my_coll
 *
 * Environment (from .env):
 *   REDIS_URL           — defaults to redis://127.0.0.1:6379
 *   QDRANT_URL          — defaults to http://127.0.0.1:6333
 *   OLLAMA_BASE_URL     — defaults to http://127.0.0.1:11434
 *   EMBED_MODEL         — defaults to embeddinggemma:latest (768d)
 *   OPENCODE_CARDS_DIR  — defaults to .opencode/cards
 */

import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import readline from 'node:readline';
import { createReadStream } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolveRepoPath, readJson, toPosixPath } from './_atlas-utils.mjs';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const argv  = process.argv.slice(2);

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const WorkerPool = require('../../simd-bridge/worker-pool.cjs');

const DRY_RUN   = argv.includes('--dry-run');
const NO_EMBED  = argv.includes('--no-embed');
const NO_REDIS  = argv.includes('--no-redis');
const VERBOSE   = argv.includes('--verbose');
const LIMIT_I   = argv.indexOf('--limit');
const LIMIT     = LIMIT_I >= 0 ? parseInt(argv[LIMIT_I + 1], 10) : Infinity;
const COLL_I    = argv.indexOf('--collection');
const COLLECTION = COLL_I >= 0 ? argv[COLL_I + 1] : 'opencode_cards_768';

const REDIS_URL   = process.env.REDIS_URL   ?? 'redis://127.0.0.1:6379';
const QDRANT_URL  = process.env.QDRANT_URL  ?? 'http://127.0.0.1:6333';
const OLLAMA_BASE = process.env.OLLAMA_BASE_URL ?? 'http://127.0.0.1:11434';
const EMBED_MODEL = process.env.EMBED_MODEL ?? 'embeddinggemma:latest';
const EMBED_DIM   = 768;

const CARDS_DIR   = resolveRepoPath(process.env.OPENCODE_CARDS_DIR ?? '.opencode/cards');
const STATE_FILE  = resolveRepoPath('.tmp/opencode-cards-ingest-state.json');

// ── Redis helper (ioredis optional) ──────────────────────────────────────────
let redisClient = null;
async function getRedis() {
  if (redisClient) return redisClient;
  try {
    const { default: Redis } = await import('ioredis');
    redisClient = new Redis(REDIS_URL, { lazyConnect: true, maxRetriesPerRequest: 1 });
    await redisClient.connect();
    return redisClient;
  } catch (e) {
    console.warn('[cards] Redis unavailable:', e.message);
    return null;
  }
}

// ── Qdrant helpers ────────────────────────────────────────────────────────────
async function ensureQdrantCollection() {
  try {
    const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`, { signal: AbortSignal.timeout(5000) });
    if (res.ok) return true; // already exists
    // Create with 768-dim cosine
    const createRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        vectors: { size: EMBED_DIM, distance: 'Cosine' },
        on_disk_payload: true,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!createRes.ok) {
      console.warn('[cards] Could not create Qdrant collection:', await createRes.text());
      return false;
    }
    console.log(`[cards] Created Qdrant collection: ${COLLECTION}`);
    return true;
  } catch (e) {
    console.warn('[cards] Qdrant unavailable:', e.message);
    return false;
  }
}

async function upsertQdrantBatch(points) {
  if (!points.length) return;
  try {
    const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points?wait=false`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ points }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) console.warn('[cards] Qdrant upsert warn:', await res.text());
  } catch (e) {
    console.warn('[cards] Qdrant upsert error:', e.message);
  }
}

// ── Embedding via Ollama nomic-embed / embeddinggemma ────────────────────────
async function embedText(text) {
  try {
    const res = await fetch(`${OLLAMA_BASE}/api/embeddings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: EMBED_MODEL, prompt: text }),
      signal: AbortSignal.timeout(20000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    return data.embedding ?? null;
  } catch { return null; }
}

// ── Content hash ──────────────────────────────────────────────────────────────
function contentHash(text) {
  return crypto.createHash('sha256').update(text ?? '').digest('hex').slice(0, 16);
}

// ── Convert id string → Qdrant UUID (stable mapping) ─────────────────────────
function idToUuid(id) {
  // Qdrant requires UUIDs or unsigned integers. We derive a v5-style UUID from the card id.
  const hash = crypto.createHash('sha1').update(`opencode:card:${id}`).digest('hex');
  return [
    hash.slice(0, 8),
    hash.slice(8, 12),
    '5' + hash.slice(13, 16),
    ((parseInt(hash.slice(16, 18), 16) & 0x3f) | 0x80).toString(16).padStart(2, '0') + hash.slice(18, 20),
    hash.slice(20, 32),
  ].join('-');
}

// ── Load previously processed state ──────────────────────────────────────────
function loadState() {
  return readJson(STATE_FILE, { processedHashes: {}, lastRun: null, totalProcessed: 0 });
}

function saveState(state) {
  if (DRY_RUN) return;
  fs.mkdirSync(path.dirname(STATE_FILE), { recursive: true });
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2) + '\n', 'utf8');
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('[cards] OpenCode cards ingester');
  console.log(`[cards] cards_dir=${CARDS_DIR}`);
  console.log(`[cards] collection=${COLLECTION}  embed=${!NO_EMBED}  redis=${!NO_REDIS}  dry=${DRY_RUN}  limit=${isFinite(LIMIT) ? LIMIT : 'all'}`);

  if (!fs.existsSync(CARDS_DIR)) {
    console.error(`[cards] Cards directory not found: ${CARDS_DIR}`);
    process.exit(1);
  }

  // Scan card files
  const cardFiles = fs.readdirSync(CARDS_DIR)
    .filter(f => f.endsWith('.json') && !f.startsWith('summaries') && !f.startsWith('qdrant'))
    .map(f => path.join(CARDS_DIR, f));

  console.log(`[cards] Found ${cardFiles.length} card files`);

  if (DRY_RUN && cardFiles.length > 0) {
    console.log('[cards] Dry-run: starting side-by-side benchmark comparison...');
    
    // 1. JSON.parse Benchmark
    const t0 = performance.now();
    let countStandard = 0;
    for (const file of cardFiles) {
      try {
        const raw = fs.readFileSync(file, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed && parsed.id) countStandard++;
      } catch (e) {}
    }
    const t1 = performance.now();
    const durationStandard = t1 - t0;
    console.log(`[benchmark] standard JSON.parse: ${durationStandard.toFixed(2)}ms for ${countStandard} items`);

    // 2. Rust WorkerPool Benchmark
    const t2 = performance.now();
    const contents = [];
    for (const file of cardFiles) {
      try {
        contents.push(fs.readFileSync(file, 'utf8'));
      } catch (e) {}
    }
    const pool = new WorkerPool(path.join(__dir, '../../simd-bridge/worker.cjs'));
    const res = await pool.exec({ type: 'parse', contents });
    pool.destroy();
    
    let countRust = 0;
    if (res && res.success && Array.isArray(res.result)) {
      for (const item of res.result) {
        if (item) {
          // Verify that it can be parsed or count it
          countRust++;
        }
      }
    }
    const t3 = performance.now();
    const durationRust = t3 - t2;
    console.log(`[benchmark] Rust Rayon worker-pool: ${durationRust.toFixed(2)}ms for ${countRust} items`);
    const speedup = durationStandard / durationRust;
    console.log(`[benchmark] Speedup factor: ${speedup.toFixed(2)}x`);
  }

  const state = loadState();
  const qdrantOK = NO_EMBED ? false : await ensureQdrantCollection();
  const redis = NO_REDIS ? null : await getRedis();

  let processed = 0, skipped = 0, embedded = 0, errors = 0;
  const qdrantBatch = [];
  const BATCH_SIZE = 50;

  for (const filePath of cardFiles) {
    if (processed >= LIMIT) break;

    let card;
    try { card = JSON.parse(fs.readFileSync(filePath, 'utf8')); } catch { errors++; continue; }
    if (!card?.id || !card?.text) { skipped++; continue; }

    const hash = contentHash(card.text);
    // Skip if unchanged
    if (!DRY_RUN && state.processedHashes[card.id] === hash) {
      skipped++;
      continue;
    }

    // NES canonical form
    const nesCard = {
      id: card.id,
      title: card.title ?? '',
      text: card.text ?? '',
      source: card.source ?? filePath,
      tags: card.tags ?? [],
      contentHash: hash,
      ingestedAt: new Date().toISOString(),
      collection: COLLECTION,
    };

    if (VERBOSE) console.log(`  [card] ${nesCard.id} — ${nesCard.title.slice(0, 50)}`);

    // Redis HASH store
    if (redis && !DRY_RUN) {
      try {
        await redis.hset(`atlas:card:${nesCard.id}`, {
          id: nesCard.id,
          title: nesCard.title,
          text: nesCard.text.slice(0, 2048), // cap at 2KB for hot cache
          source: nesCard.source,
          contentHash: hash,
          ingestedAt: nesCard.ingestedAt,
        });
        await redis.expire(`atlas:card:${nesCard.id}`, 86400 * 30); // 30-day TTL
      } catch (e) {
        if (VERBOSE) console.warn(`  [redis] error for ${nesCard.id}:`, e.message);
      }
    }

    // Qdrant embedding + upsert
    if (qdrantOK && !DRY_RUN) {
      const textToEmbed = `${nesCard.title}\n\n${nesCard.text}`.slice(0, 4096);
      const vector = await embedText(textToEmbed);
      if (vector && vector.length === EMBED_DIM) {
        qdrantBatch.push({
          id: idToUuid(nesCard.id),
          vector,
          payload: {
            card_id: nesCard.id,
            title: nesCard.title,
            source: nesCard.source,
            tags: nesCard.tags,
            contentHash: hash,
            ingestedAt: nesCard.ingestedAt,
          },
        });
        embedded++;
        if (qdrantBatch.length >= BATCH_SIZE) {
          await upsertQdrantBatch(qdrantBatch.splice(0));
          if (VERBOSE) console.log(`  [qdrant] flushed ${BATCH_SIZE} points`);
        }
      }
    }

    state.processedHashes[nesCard.id] = hash;
    processed++;
  }

  // Flush remaining Qdrant batch
  if (qdrantBatch.length > 0) {
    await upsertQdrantBatch(qdrantBatch);
    if (VERBOSE) console.log(`  [qdrant] flushed final ${qdrantBatch.length} points`);
  }

  state.lastRun = new Date().toISOString();
  state.totalProcessed = (state.totalProcessed ?? 0) + processed;
  saveState(state);

  if (redis) await redis.quit().catch(() => {});

  console.log('\n[cards] Ingestion complete');
  console.log(`  Cards processed  : ${processed}`);
  console.log(`  Cards skipped    : ${skipped} (unchanged)`);
  console.log(`  Qdrant embedded  : ${embedded}`);
  console.log(`  Errors           : ${errors}`);
  console.log(`  State saved      : ${STATE_FILE}`);
  if (DRY_RUN) console.log('  (dry-run — no writes performed)');
}

main().catch(e => { console.error('[cards] Fatal:', e); process.exit(1); });
