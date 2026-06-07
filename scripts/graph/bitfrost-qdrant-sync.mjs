#!/usr/bin/env node
/**
 * bitfrost-qdrant-sync.mjs
 *
 * Pipeline:
 *   enriched-candidates.ndjson (Atlas IR)
 *   → assign som_cell from SOM row/col
 *   → upsert Qdrant codebase_chunks_768 payload fields
 *   → write Valkey hot-cache keys  (ace:node:<sourceRef>)
 *   → optionally emit Neo4j edge NDJSON
 *
 * Usage:
 *   node scripts/graph/bitfrost-qdrant-sync.mjs
 *   node scripts/graph/bitfrost-qdrant-sync.mjs --dry-run
 *   node scripts/graph/bitfrost-qdrant-sync.mjs --neo4j        # also emit neo4j edges
 *   node scripts/graph/bitfrost-qdrant-sync.mjs --collection codebase_chunks_768
 *
 * stdout = machine JSON summary
 * stderr = human diagnostics
 */

import fs   from 'node:fs';
import path from 'node:path';
import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, '..', '..');

dotenv.config({ path: path.join(ROOT, 'sveltekit-frontend', '.env') });

// ── Config ───────────────────────────────────────────────────────────────────

const QDRANT_URL   = process.env.QDRANT_URL   || 'http://127.0.0.1:6333';
const REDIS_HOST   = process.env.REDIS_HOST   || '127.0.0.1';
const REDIS_PORT   = parseInt(process.env.REDIS_PORT  || '6379', 10);
const REDIS_PASS   = process.env.REDIS_PASSWORD || 'redis';
const COLLECTION   = process.argv.find((a, i) => process.argv[i-1] === '--collection') || 'codebase_chunks_768';
const DRY_RUN      = process.argv.includes('--dry-run');
const EMIT_NEO4J   = process.argv.includes('--neo4j');
const BATCH_SIZE   = 200;

const CANDIDATES_FILE = path.join(ROOT, '.opencode', 'ndjson', 'enriched-candidates.ndjson');
const EDGES_FILE      = path.join(ROOT, '.opencode', 'ndjson', 'graph-edges.ndjson');
const NEO4J_OUT       = path.join(ROOT, '.opencode', 'ndjson', 'neo4j-sync-edges.ndjson');

// ── Helpers ──────────────────────────────────────────────────────────────────

function log(...args)  { process.stderr.write(args.join(' ') + '\n'); }
function die(msg)      { log('[FATAL]', msg); process.exit(1); }

function somCell(row, col) {
  if (row == null || col == null) return null;
  return `${row}:${col}`;
}

async function readNdjson(filePath) {
  const rows = [];
  if (!fs.existsSync(filePath)) return rows;
  const rl = createInterface({ input: createReadStream(filePath), crlfDelay: Infinity });
  for await (const line of rl) {
    const t = line.trim();
    if (!t) continue;
    try { rows.push(JSON.parse(t)); } catch { /* skip malformed */ }
  }
  return rows;
}

async function qdrantScroll(collection, offset = null, limit = 250) {
  const body = { limit, with_payload: true, with_vector: false };
  if (offset !== null) body.offset = offset;
  const res = await fetch(`${QDRANT_URL}/collections/${collection}/points/scroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return res.json();
}

async function qdrantSetPayload(collection, points) {
  // points = [{ id, payload }]
  // Use set_payload (partial update, preserves existing fields)
  const res = await fetch(`${QDRANT_URL}/collections/${collection}/points/payload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ points: points.map(p => p.id), payload: null }),
  });
  // Use batch approach: one call per unique payload shape is expensive
  // Instead POST to /points with just the fields we want to update
  // Qdrant doesn't have a bulk set_payload with per-point payloads directly,
  // so we use the overwrite-payload endpoint per batch
  return res.ok;
}

async function qdrantBatchSetPayload(collection, updates) {
  // updates = [{ id: number|string, payload: object }]
  // Qdrant supports PUT /collections/{name}/points/payload with points[] filter
  // For per-point different payloads we must call individually or use upsert
  // Using upsert with vectors: null trick doesn't work — use set_payload per point batch grouped by payload
  // Most efficient: group by som_cell and issue one call per group
  // For simplicity and correctness: individual set_payload calls batched in parallel chunks
  const PARALLEL = 20;
  let ok = 0, err = 0;
  for (let i = 0; i < updates.length; i += PARALLEL) {
    const slice = updates.slice(i, i + PARALLEL);
    await Promise.all(slice.map(async ({ id, payload }) => {
      try {
        const res = await fetch(`${QDRANT_URL}/collections/${collection}/points/payload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ points: [id], payload }),
        });
        if (res.ok) ok++; else err++;
      } catch { err++; }
    }));
  }
  return { ok, err };
}

// ── Valkey (ioredis) ─────────────────────────────────────────────────────────

async function getRedis() {
  const { default: Redis } = await import('ioredis');
  const r = new Redis({
    host: REDIS_HOST,
    port: REDIS_PORT,
    password: REDIS_PASS,
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false,
    retryStrategy: () => null,
  });
  r.on('error', () => {});
  await r.connect().catch(() => {});
  return r;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  log(`[bitfrost-qdrant-sync] start  collection=${COLLECTION}  dry=${DRY_RUN}`);

  // 1. Load atlas candidates
  log('[1/6] Loading enriched-candidates.ndjson...');
  const candidates = await readNdjson(CANDIDATES_FILE);
  log(`      ${candidates.length} candidates loaded`);

  // 2. Load graph edges (for neo4j step)
  let edges = [];
  if (EMIT_NEO4J) {
    log('[2/6] Loading graph-edges.ndjson...');
    edges = await readNdjson(EDGES_FILE);
    log(`      ${edges.length} edges loaded`);
  } else {
    log('[2/6] Skipping edges (--neo4j not set)');
  }

  // 3. Build sourceRef → atlas node index
  log('[3/6] Building sourceRef index...');
  const nodeIndex = new Map();
  for (const c of candidates) {
    const ref = c.card_id?.replace(/^file:/, '');
    if (!ref) continue;
    nodeIndex.set(ref, c);
  }
  log(`      ${nodeIndex.size} nodes indexed`);

  // 4. Scroll Qdrant and build payload updates
  log('[4/6] Scrolling Qdrant for matching points...');
  const updates = [];
  let offset = null;
  let scrolled = 0;
  let matched = 0;

  while (true) {
    const res = await qdrantScroll(COLLECTION, offset);
    if (!res?.result?.points?.length) break;

    for (const pt of res.result.points) {
      scrolled++;
      const ref = pt.payload?.sourceRef || pt.payload?.source_ref || pt.payload?.file_path;
      if (!ref) continue;

      const node = nodeIndex.get(ref);
      const row  = node?.som_row ?? pt.payload?.somRow;
      const col  = node?.som_col ?? pt.payload?.somCol;
      const cell = somCell(row, col);

      const patch = {};
      if (cell && !pt.payload?.som_cell)            patch.som_cell    = cell;
      if (node?.keywords?.length && !pt.payload?.keywords)
                                                    patch.keywords    = node.keywords;
      if (node?.tags?.length)                       patch.atlas_tags  = node.tags;
      if (!pt.payload?.som_cell && cell)            patch.som_cell    = cell;
      // Ensure required payload shape fields exist
      if (!pt.payload?.feature_id && pt.payload?.feature_ids?.[0])
        patch.feature_id = pt.payload.feature_ids[0];
      if (!pt.payload?.route_path && ref.includes('/routes/'))
        patch.route_path = ref.replace(/^src\/routes\//, '/').replace(/\/\+.*$/, '');

      if (Object.keys(patch).length > 0) {
        updates.push({ id: pt.id, payload: patch });
        matched++;
      }
    }

    offset = res.result.next_page_offset;
    if (!offset) break;
    if (scrolled % 2000 === 0) log(`      scrolled ${scrolled}...`);
  }

  log(`      scrolled ${scrolled} points, ${matched} need payload patch`);

  // 5. Apply Qdrant updates
  log('[5/6] Patching Qdrant payloads...');
  let qdrantOk = 0, qdrantErr = 0;
  if (!DRY_RUN && updates.length > 0) {
    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
      const batch = updates.slice(i, i + BATCH_SIZE);
      const { ok, err } = await qdrantBatchSetPayload(COLLECTION, batch);
      qdrantOk  += ok;
      qdrantErr += err;
      if ((i / BATCH_SIZE) % 10 === 0)
        log(`      ${i + batch.length}/${updates.length} patched`);
    }
  } else if (DRY_RUN) {
    log(`      [dry-run] would patch ${updates.length} points`);
    qdrantOk = updates.length;
  }
  log(`      qdrant patch: ${qdrantOk} ok / ${qdrantErr} err`);

  // 6. Write Valkey hot-cache keys  ace:node:<sourceRef>  TTL=3600s
  log('[6/6] Writing Valkey hot-cache keys...');
  let valkeyOk = 0, valkeyErr = 0;
  const redis = await getRedis();
  const redisReady = await redis.ping().then(r => r === 'PONG').catch(() => false);

  if (redisReady && !DRY_RUN) {
    const pipeline = redis.pipeline();
    let piped = 0;
    for (const node of nodeIndex.values()) {
      const ref = node.card_id?.replace(/^file:/, '');
      if (!ref) continue;
      const key = `ace:node:${ref}`;
      pipeline.setex(key, 3600, JSON.stringify({
        sourceRef: ref,
        som_cell:  somCell(node.som_row, node.som_col),
        tags:      node.tags || [],
        keywords:  node.keywords || [],
        has_card:  node.has_card,
      }));
      piped++;
      if (piped % 500 === 0) {
        const results = await pipeline.exec();
        results?.forEach(([e]) => { if (e) valkeyErr++; else valkeyOk++; });
        pipeline.clearQueue?.();
      }
    }
    if (piped % 500 !== 0) {
      const results = await pipeline.exec();
      results?.forEach(([e]) => { if (e) valkeyErr++; else valkeyOk++; });
    }
    valkeyOk = piped - valkeyErr;
  } else if (DRY_RUN) {
    log(`      [dry-run] would write ${nodeIndex.size} ace:node: keys to Valkey`);
    valkeyOk = nodeIndex.size;
  } else {
    log('      Valkey not reachable — skipping cache writes');
  }

  await redis.quit().catch(() => {});
  log(`      valkey writes: ${valkeyOk} ok / ${valkeyErr} err`);

  // Optional: emit Neo4j edge NDJSON
  if (EMIT_NEO4J && edges.length > 0) {
    log('[neo4j] Writing neo4j-sync-edges.ndjson...');
    const out = edges.map(e => JSON.stringify({
      src:      e.src,
      dst:      e.dst,
      type:     e.type || 'SIMILAR_TOPOLOGY',
      feature_ids: e.feature_ids || [],
      lane_ids: e.lane_ids || [],
    })).join('\n');
    if (!DRY_RUN) fs.writeFileSync(NEO4J_OUT, out + '\n', 'utf8');
    log(`      wrote ${edges.length} edges to ${NEO4J_OUT}`);
  }

  const summary = {
    ok: qdrantErr === 0,
    collection: COLLECTION,
    candidates: candidates.length,
    scrolled,
    patched: qdrantOk,
    qdrant_err: qdrantErr,
    valkey_ok: valkeyOk,
    valkey_err: valkeyErr,
    dry_run: DRY_RUN,
  };

  log(`\n[bitfrost-qdrant-sync] done  patched=${qdrantOk}  valkey=${valkeyOk}  errors=${qdrantErr + valkeyErr}`);
  console.log(JSON.stringify(summary));
}

main().catch(err => {
  process.stderr.write(`[bitfrost-qdrant-sync] fatal: ${err.message}\n${err.stack}\n`);
  process.exit(1);
});
