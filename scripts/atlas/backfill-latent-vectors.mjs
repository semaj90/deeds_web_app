#!/usr/bin/env node
/**
 * backfill-latent-vectors.mjs
 *
 * Step 2 of the AE training pipeline:
 *   1. Loads trained weights from models/autoencoder/ (written by train-ae-pytorch.py)
 *   2. Fetches all packet embeddings from Qdrant codebase_chunks_768
 *   3. Encodes: 768 → 128 → 64 via autoencoderEncodeGPU() in the C++ LibTorch bridge
 *   4. Writes latent_64 as bytea → Postgres atlas_packets (UPDATE in batches of 100)
 *   5. Caches latent_64 in Redis: gpu:autoencoder:latent_64:{qdrant_id} (TTL 7 days)
 *   6. Also writes latent index file: models/autoencoder/autoencoder_latent_index.json
 *      (consumed by train-som-20x20.mjs)
 *
 * Prerequisite: run train-ae-pytorch.py first to produce the weight .npy files
 *
 * Usage:
 *   node scripts/atlas/backfill-latent-vectors.mjs [--dry-run] [--limit=N] [--batch=100]
 *   Legacy persistence additionally requires --legacy-unsafe-apply. This
 *   writer is not the promotion producer for RepresentationArtifactV1.
 *
 * Exit codes: 0 = success, 1 = weights missing, 2 = Qdrant unreachable, 3 = DB error
 */

import { createRequire } from 'module';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'fs';
import pg from 'pg';
import Redis from 'ioredis';
import { loadAtlasEnv } from './load-atlas-env.mjs';

loadAtlasEnv(resolve('.'));

const __dir   = dirname(fileURLToPath(import.meta.url));
const ROOT    = resolve(__dir, '..', '..');
const require = createRequire(import.meta.url);

// ── Config ───────────────────────────────────────────────────────────────────

const ADDON_PATH  = resolve(ROOT, 'simd-bridge/cpp/build/Release/tensorrt_bridge.node');
const MODEL_DIR   = resolve(ROOT, 'models/autoencoder');
const FRONTEND_MODEL_DIR = resolve(ROOT, 'sveltekit-frontend/models/autoencoder');
const LATENT_FILE = resolve(MODEL_DIR, 'autoencoder_latent_index.json');
const FRONTEND_LATENT_FILE = resolve(FRONTEND_MODEL_DIR, 'autoencoder_latent_index.json');

const QDRANT_URL  = (process.env.QDRANT_URL  || 'http://127.0.0.1:6333').replace(/\/$/, '');
const COLLECTION  = process.env.AE_QDRANT_COLLECTION || 'codebase_chunks_768';
const DATABASE_URL= process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

const INPUT_DIM   = 768;
const HIDDEN_DIM  = 128;
const LATENT_DIM  = 64;
const REDIS_TTL   = 7 * 24 * 3600; // 7 days

const args     = process.argv.slice(2);
const APPLY    = args.includes('--apply');
const LEGACY_UNSAFE_APPLY = args.includes('--legacy-unsafe-apply');
const DRY_RUN  = !APPLY || args.includes('--dry-run');
const RESUME   = args.includes('--resume');
const limitArg = args.find(a => a.startsWith('--limit='));
const LIMIT    = limitArg ? parseInt(limitArg.split('=')[1], 10) : Number(process.env.LATENT_DEFAULT_LIMIT || 5000);
const batchArg = args.find(a => a.startsWith('--batch='));
const BATCH_SZ = batchArg ? parseInt(batchArg.split('=')[1], 10) : 100;
const FORCE_REFRESH = args.includes('--force-refresh');
const MEM_DIAG = args.includes('--mem-diag');
const CHECKPOINT_FILE = resolve(ROOT, '.tmp', 'backfill-latent-vectors.checkpoint.json');

// ── Memory diagnostic (2026-08-03 OOM investigation) ────────────────────────
// Bounded, operator-requested instrumentation: heap/RSS before Step 6, after
// every write batch, and at exit. If heapUsed grows ~linearly with rows
// processed instead of plateauing after each commit, the process is
// retaining objects per-row and a larger --max-old-space-size only delays
// the same failure — do not treat the heap bump alone as a fix.
let memDiagPeakRss = 0;
let memDiagPeakHeap = 0;
function memDiagSnapshot(label) {
  if (!MEM_DIAG) return null;
  const mem = process.memoryUsage();
  memDiagPeakRss = Math.max(memDiagPeakRss, mem.rss);
  memDiagPeakHeap = Math.max(memDiagPeakHeap, mem.heapUsed);
  const mb = (n) => (n / 1024 / 1024).toFixed(1);
  console.log(`  [mem-diag] ${label}: heapUsed=${mb(mem.heapUsed)}MB rss=${mb(mem.rss)}MB external=${mb(mem.external)}MB (peakHeap=${mb(memDiagPeakHeap)}MB peakRss=${mb(memDiagPeakRss)}MB)`);
  return mem;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function floatArrayToBuffer(fa) {
  const buf = Buffer.alloc(fa.length * 4);
  for (let i = 0; i < fa.length; i++) buf.writeFloatLE(fa[i], i * 4);
  return buf;
}

function bufferToFloatArray(buf) {
  if (!buf || buf.byteLength % 4 !== 0) return [];
  const view = new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
  return Array.from(view);
}

/** Load a .npy file (simple 1-D / 2-D float32, no zip, no structured dtype). */
function loadNpy(path) {
  const raw = readFileSync(path);
  const isNpy = raw[0] === 0x93 &&
                raw[1] === 0x4e && // 'N'
                raw[2] === 0x55 && // 'U'
                raw[3] === 0x4d && // 'M'
                raw[4] === 0x50 && // 'P'
                raw[5] === 0x59;   // 'Y'
  if (!isNpy) throw new Error(`Not a .npy file: ${path}`);
  const hdrLen = raw[8] + (raw[9] << 8);
  const hdrStr = raw.slice(10, 10 + hdrLen).toString('ascii');
  const shapeM = hdrStr.match(/shape\s*:\s*\(([^)]+)\)/);
  const shape  = shapeM ? shapeM[1].split(',').map(s => parseInt(s.trim(), 10)).filter(v => !isNaN(v)) : [];
  const data   = new Float32Array(raw.buffer, raw.byteOffset + 10 + hdrLen);
  return { data: new Float32Array(data), shape };
}

function isCanonicalPacketPayload(payload = {}) {
  if (
    payload.kind === 'directory-cluster' ||
    payload.ledger_type === 'legacy_qdrant_only' ||
    payload.canonical === false ||
    payload.payload_unmatched === true
  ) return false;
  return Boolean(
    payload.packet_key ||
    payload.packetKey ||
    payload.chunk_id ||
    payload.source_ref ||
    payload.sourceRef ||
    payload.canonical_source_ref ||
    payload.file_path ||
    payload.filePath ||
    payload.path
  );
}

function extractQdrantVector(point) {
  const raw = point?.vector ?? point?.vectors ?? null;
  if (Array.isArray(raw)) return raw;
  if (raw && Array.isArray(raw.content)) return raw.content;
  if (raw && Array.isArray(raw.default)) return raw.default;
  if (raw && Array.isArray(raw.vector)) return raw.vector;
  return null;
}

async function loadCurrentLatentKeys(pool, currentEpoch) {
  const result = await pool.query(
    `
    SELECT qdrant_point_id, packet_key, source_ref, latent_64
    FROM atlas_packets
    WHERE latent_64 IS NOT NULL
      AND COALESCE((metadata->>'ae_epoch')::int, -1) = $1;
    `,
    [currentEpoch]
  );

  // Keyed by every candidate identity string -> already-decoded latent_64 array, so a
  // skip can still populate the JSON latent-index file (consumed by train-som-20x20.mjs)
  // instead of silently dropping the entry. Multiple keys may point at the same vector.
  const byKey = new Map();

  for (const row of result.rows) {
    if (!row.latent_64) continue;
    const vec = bufferToFloatArray(row.latent_64);
    if (row.qdrant_point_id) byKey.set(String(row.qdrant_point_id), vec);
    if (row.packet_key) byKey.set(String(row.packet_key), vec);
    if (row.source_ref) byKey.set(String(row.source_ref), vec);
  }

  return {
    count: result.rowCount ?? 0,
    byKey,
  };
}

/** Returns the existing latent_64 array if this entry is already current, else null. */
function findExistingLatent(entry, qdrantId, currentLatentKeys) {
  if (!currentLatentKeys) return null;

  const candidateKeys = [
    qdrantId,
    entry.qdrant_point_id,
    entry.packet_key,
    entry.source_ref,
    entry.canonical_source_ref,
    ...(entry.candidate_keys || []),
  ].filter(Boolean).map((value) => String(value));

  for (const key of candidateKeys) {
    const vec = currentLatentKeys.byKey.get(key);
    if (vec) return vec;
  }

  return null;
}

/** Fetch a single page of vectors from Qdrant. */
async function fetchQdrantPage(url, collection, limit, offset = null) {
  const body = JSON.stringify({
    limit,
    with_payload: [
      "packet_key", "packetKey", "chunk_id", "source_ref", "sourceRef",
      "sourceRefs", "filePath", "canonical_source_ref", "path", "file_path",
      "qdrant_point_id", "feature_id", "featureId", "kind", "ledger_type",
      "canonical", "payload_unmatched"
    ],
    with_vector: true,
    ...(offset ? { offset } : {})
  });
  const res = await fetch(`${url}/collections/${collection}/points/scroll`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body
  });
  if (!res.ok) throw new Error(`Qdrant scroll ${res.status}: ${await res.text()}`);
  const json = await res.json();
  return {
    points: json.result?.points ?? [],
    nextOffset: json.result?.next_page_offset ?? null,
  };
}

function readCheckpoint() {
  if (!RESUME || !existsSync(CHECKPOINT_FILE)) return null;
  try {
    return JSON.parse(readFileSync(CHECKPOINT_FILE, 'utf8'));
  } catch (error) {
    console.warn(`  ⚠️  Checkpoint unreadable at ${CHECKPOINT_FILE}: ${error.message}`);
    return null;
  }
}

function writeCheckpoint(checkpoint) {
  mkdirSync(resolve(ROOT, '.tmp'), { recursive: true });
  writeFileSync(CHECKPOINT_FILE, JSON.stringify(checkpoint, null, 2));
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (APPLY && !LEGACY_UNSAFE_APPLY) {
    throw new Error(
      'LATENT_LEGACY_WRITER_APPLY_BLOCKED: use the revision-qualified canary producer; '
      + 'explicit --legacy-unsafe-apply is required for diagnostic legacy persistence',
    );
  }

  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  backfill-latent-vectors.mjs — AE Encode: 768 → 128 → 64        ║');
  console.log(`╚══════════════════════════════════════════════════════════════════╝\n`);
  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'APPLY'}  batch=${BATCH_SZ}  limit=${LIMIT}  resume=${RESUME ? 'yes' : 'no'}\n`);

  // ── Step 1: Load trained weights ──────────────────────────────────────────
  console.log('Step 1: Load trained weights');
  console.log('─────────────────────────────');

  const metaPath = resolve(MODEL_DIR, 'ae_meta.json');
  if (!existsSync(metaPath)) {
    console.error('❌ ae_meta.json not found. Run: python scripts/atlas/train-ae-pytorch.py first.');
    process.exit(1);
  }
  const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
  console.log(`  input_dim:  ${meta.input_dim}`);
  console.log(`  hidden_dim: ${meta.hidden_dim}`);
  console.log(`  latent_dim: ${meta.latent_dim}`);
  console.log(`  trained:    ${meta.timestamp}  val_loss=${meta.best_val_loss?.toFixed(6)}`);
  const checkpoint = readCheckpoint();
  if (checkpoint) {
    console.log(`  checkpoint: ${CHECKPOINT_FILE}`);
    console.log(`  resume_at:  ${checkpoint.nextOffset ?? 'start'}`);
  }

  // Layer 1: 768 → 128
  const W1 = loadNpy(resolve(MODEL_DIR, 'W_enc_768_128.npy'));  // [128, 768]
  const b1 = loadNpy(resolve(MODEL_DIR, 'b_enc_128.npy'));      // [128]
  // Layer 2: 128 → 64
  const W2 = loadNpy(resolve(MODEL_DIR, 'W_enc_128_64.npy'));   // [64, 128]
  const b2 = loadNpy(resolve(MODEL_DIR, 'b_enc_64.npy'));       // [64]

  console.log(`  W1: [${W1.shape}]  b1: [${b1.shape}]`);
  console.log(`  W2: [${W2.shape}]  b2: [${b2.shape}]\n`);

  // ── Step 2: Load GPU addon ─────────────────────────────────────────────────
  console.log('Step 2: Load GPU addon');
  console.log('────────────────────────');

  let addon;
  try {
    addon = require(ADDON_PATH);
    const cuda = addon.checkCudaAvailable?.() === 1;
    console.log(`  Addon: ✅ loaded  CUDA: ${cuda ? '✅ yes' : '⚠️  CPU fallback'}\n`);
  } catch (e) {
    console.error(`❌ Addon load failed: ${e.message}`);
    console.error(`   Path: ${ADDON_PATH}`);
    console.error('   Run: node scripts/startup-gpu-bridge-probe.mjs');
    process.exit(1);
  }

  if (typeof addon.autoencoderEncode !== 'function') {
    console.error('❌ addon.autoencoderEncode not exported — rebuild the addon with pytorch_graph.cc');
    process.exit(1);
  }

  const pool = APPLY ? new pg.Pool({ connectionString: DATABASE_URL }) : null;
  memDiagSnapshot('after GPU addon load, before Qdrant fetch');

  const currentEpoch = Number(meta.epoch ?? 60);
  const currentLatentKeys = APPLY && pool && !FORCE_REFRESH
    ? await loadCurrentLatentKeys(pool, currentEpoch)
    : null;
  if (currentLatentKeys) {
    console.log(`  Existing current latent rows: ${currentLatentKeys.count} (ae_epoch=${currentEpoch})\n`);
  } else if (FORCE_REFRESH) {
    console.log('  --force-refresh set: re-encoding all packets regardless of existing latent_64\n');
  }

  const W1f = W1.data;  // Float32Array [128*768]
  const b1f = b1.data;  // Float32Array [128]
  const W2f = W2.data;  // Float32Array [64*128]
  const b2f = b2.data;  // Float32Array [64]

  // ── Step 3: Stream Qdrant pages and encode 768 → 128 → 64 ────────────────
  console.log('Step 3: Stream Qdrant pages and encode via autoencoderEncodeGPU() (768→128→64)');
  console.log('────────────────────────────────────────────────────────────────────────────');

  const latentIndex = {};   // qdrant_id → latent object
  let encoded_count = 0;
  let t_encode = 0;
  let pg_reasons = {
    qdrant_point_id: 0,
    packet_key: 0,
    source_ref: 0,
    jsonb_fallback: 0,
    skipped: 0
  };

  let pageCursor = checkpoint?.nextOffset ?? null;
  let pageCount = 0;
  let processedCount = 0;
  let latestPointId = checkpoint?.lastPointId ?? null;
  let maxObservedPage = 0;
  let writeCheckpointPath = DRY_RUN ? null : CHECKPOINT_FILE;

  while (processedCount < LIMIT) {
    const remaining = LIMIT - processedCount;
    const pageLimit = Math.min(BATCH_SZ, remaining);
    let page;
    try {
      page = await fetchQdrantPage(QDRANT_URL, COLLECTION, pageLimit, pageCursor);
    } catch (e) {
      console.error(`❌ Qdrant page fetch failed: ${e.message}`);
      process.exit(2);
    }

    const points = page.points ?? [];
    if (points.length === 0) break;

    pageCount++;
    maxObservedPage = Math.max(maxObservedPage, points.length);

    const pageVectors = [];
    const pageIds = [];
    const pageInfos = [];

    for (const point of points) {
      const vector = extractQdrantVector(point);
      if (!vector || vector.length !== INPUT_DIM) continue;
      pageVectors.push(vector);
      pageIds.push(String(point.id));
      pageInfos.push(point.payload ?? {});
    }

    if (pageVectors.length === 0) {
      processedCount += points.length;
      pageCursor = page.nextOffset ?? null;
      if (pageCursor === null) break;
      continue;
    }

    const bSize = pageVectors.length;
    const batch = new Float32Array(bSize * INPUT_DIM);
    for (let i = 0; i < bSize; i++) {
      const v = pageVectors[i];
      for (let j = 0; j < INPUT_DIM; j++) batch[i * INPUT_DIM + j] = v[j];
    }

    const t0 = Date.now();
    const h128 = addon.autoencoderEncode(batch, bSize, INPUT_DIM, W1f, b1f, HIDDEN_DIM);
    const lat64 = addon.autoencoderEncode(h128, bSize, HIDDEN_DIM, W2f, b2f, LATENT_DIM);
    t_encode += Date.now() - t0;

    for (let i = 0; i < bSize; i++) {
      const id = pageIds[i];
      const ptInfo = pageInfos[i] || {};
      latestPointId = id;
      const isCurrent = findExistingLatent(ptInfo, id, currentLatentKeys) !== null;
      if (isCurrent) pg_reasons.skipped++;

      latentIndex[id] = {
        primary_id: ptInfo.primary_id || id,
        qdrant_point_id: ptInfo.qdrant_point_id || id,
        packet_key: ptInfo.packet_key || null,
        source_ref: ptInfo.source_ref || null,
        canonical_source_ref: ptInfo.canonical_source_ref || null,
        feature_id: ptInfo.feature_id || null,
        candidate_keys: ptInfo.candidate_keys || [],
        kind: ptInfo.kind ?? null,
        ledger_type: ptInfo.ledger_type ?? null,
        canonical: ptInfo.canonical ?? null,
        payload_unmatched: ptInfo.payload_unmatched ?? null,
        skip_write: isCurrent,
        latent_64: Array.from(lat64.subarray(i * LATENT_DIM, (i + 1) * LATENT_DIM))
      };
    }

    encoded_count += bSize;
    processedCount += points.length;
    process.stdout.write(`\r  Encoded ${encoded_count}/${LIMIT} (${(t_encode / Math.max(encoded_count, 1)).toFixed(2)} ms/vec)...`);

    if (writeCheckpointPath) {
      writeCheckpoint({
        runId: `backfill-latent-vectors:${process.pid}`,
        workspaceRevision: process.env.WORKSPACE_REVISION || 'unknown',
        collection: COLLECTION,
        representationId: 'latent_64',
        representationRevision: Number(meta.epoch ?? 60),
        nextOffset: page.nextOffset ?? null,
        lastPointId: latestPointId,
        processedCount,
        persistedCount: 0,
        datasetDigest: `collection:${COLLECTION};limit:${LIMIT};batch:${BATCH_SZ}`,
        updatedAt: new Date().toISOString(),
      });
    }

    memDiagSnapshot(`after page ${pageCount} (${bSize} encoded, processed=${processedCount}, maxPage=${maxObservedPage})`);

    pageCursor = page.nextOffset ?? null;
    if (pageCursor === null) break;
  }

  if (encoded_count === 0) {
    console.error('❌ No vectors found — check QDRANT_URL and collection name');
    process.exit(2);
  }

  memDiagSnapshot(`after streaming encode (${encoded_count} vectors, ${pageCount} pages)`);

  // ── Step 4: Persist the latent index ──────────────────────────────────────
  console.log('\nStep 4: Persist the latent index and downstream projections');
  console.log('────────────────────────────────────────────────────────────');

  memDiagSnapshot(`before downstream writes (${Object.keys(latentIndex).length} latentIndex entries, ${pg_reasons.skipped} already-current)`);

  if (Object.keys(latentIndex).length === 0 && currentLatentKeys && currentLatentKeys.count > 0 && pool) {
    console.log('\n  No refreshed latent rows were needed; hydrating the latent index from Postgres for downstream consumers...');
    const currentRows = await pool.query(
      `
      SELECT
        packet_id,
        qdrant_point_id,
        packet_key,
        source_ref,
        canonical_source_ref,
        feature_id,
        kind,
        ledger_type,
        canonical,
        payload_unmatched,
        latent_64
      FROM atlas_packets
      WHERE latent_64 IS NOT NULL
        AND COALESCE((metadata->>'ae_epoch')::int, -1) = $1
      ORDER BY packet_id;
      `,
      [currentEpoch]
    );

    for (const row of currentRows.rows) {
      const key = String(row.qdrant_point_id || row.packet_id);
      latentIndex[key] = {
        primary_id: String(row.qdrant_point_id || row.packet_id),
        qdrant_point_id: row.qdrant_point_id || key,
        packet_key: row.packet_key || null,
        source_ref: row.source_ref || null,
        canonical_source_ref: row.canonical_source_ref || null,
        feature_id: row.feature_id || null,
        candidate_keys: [],
        kind: row.kind ?? null,
        ledger_type: row.ledger_type ?? null,
        canonical: row.canonical ?? null,
        payload_unmatched: row.payload_unmatched ?? null,
        latent_64: bufferToFloatArray(row.latent_64),
      };
    }

    console.log(`  ✅ Hydrated ${Object.keys(latentIndex).length} latent vectors from Postgres\n`);
  }

  process.stdout.write('\n');
  console.log(`  ✅ ${encoded_count} latent vectors produced in ${t_encode} ms\n`);

  // Each Qdrant page is discarded after encoding. Only the bounded latent index
  // and final reports remain in memory before serialization.

  // ── Step 5: Write latent index file ───────────────────────────────────────
  console.log('Step 5: Save latent index (for train-som-20x20.mjs)');
  console.log('─────────────────────────────────────────────────────');

  const latentArtifact = {
    timestamp:   new Date().toISOString(),
    model:       'autoencoder_768_128_64',
    input_dim:   INPUT_DIM,
    hidden_dim:  HIDDEN_DIM,
    output_dim:  LATENT_DIM,
    packet_count: Object.keys(latentIndex).length,
    index:       latentIndex,          // { qdrant_id: latent object }
  };

  // Serialize once and reuse for both file writes — this was previously two
  // independent JSON.stringify(..., null, 2) calls on the same large object,
  // doubling peak string-allocation memory for no reason (both files are
  // byte-identical mirrors).
  const latentArtifactJson = JSON.stringify(latentArtifact, null, 2);

  if (DRY_RUN) {
    mkdirSync(MODEL_DIR, { recursive: true });
    mkdirSync(FRONTEND_MODEL_DIR, { recursive: true });
    writeFileSync(LATENT_FILE, latentArtifactJson);
    writeFileSync(FRONTEND_LATENT_FILE, latentArtifactJson);
    console.log(`  🔍 DRY-RUN — wrote ${Object.keys(latentIndex).length} entries to ${LATENT_FILE}`);
    console.log(`   Mirror wrote to ${FRONTEND_LATENT_FILE}`);
    console.log('   Skipping Postgres and Redis writes. Use --apply to persist database state.');
    return;
  }

  mkdirSync(MODEL_DIR, { recursive: true });
  mkdirSync(FRONTEND_MODEL_DIR, { recursive: true });
  writeFileSync(LATENT_FILE, latentArtifactJson);
  writeFileSync(FRONTEND_LATENT_FILE, latentArtifactJson);
  console.log(`  ✅ ${LATENT_FILE}  (${Object.keys(latentIndex).length} entries)\n`);
  console.log(`  ✅ ${FRONTEND_LATENT_FILE}  (${Object.keys(latentIndex).length} entries)\n`);

  // ── Step 6: Write to Postgres atlas_packets ────────────────────────────────
  console.log('Step 6: Write latent_64 → Postgres atlas_packets');
  console.log('──────────────────────────────────────────────────');

  // Shared advisory lock — same key as sveltekit-frontend/scripts/atlas/materialize-feature-envelopes.mts.
  // A live 2026-08-03 incident deadlocked this script's latent_64/metadata UPDATEs
  // against that script's feature_envelope UPDATEs (two independent bulk writers on
  // atlas_packets, no shared coordination). Any script doing a bulk batch UPDATE
  // against atlas_packets should acquire ATLAS_PACKETS_BULK_WRITER_LOCK_KEY before
  // its write phase — see OpenSpec parent-atlas-graph-retrieval-proof GS1.43.
  const ATLAS_PACKETS_BULK_WRITER_LOCK_KEY = 847_662_501;
  if (APPLY) {
    const lockResult = await pool.query('SELECT pg_try_advisory_lock($1) AS locked;', [ATLAS_PACKETS_BULK_WRITER_LOCK_KEY]);
    if (!lockResult.rows[0]?.locked) {
      console.error('Another atlas_packets bulk-writer script (materialize-feature-envelopes or backfill-latent-vectors) holds the shared lock. Exiting without writing.');
      await pool.end();
      process.exitCode = 1;
      return;
    }
  }

  let pgUpdated = 0;
  let pgNotMatched = 0;
  let redisCached = 0;
  const entries = Object.entries(latentIndex);

  for (let start = 0; start < entries.length; start += BATCH_SZ) {
    const slice = entries.slice(start, start + BATCH_SZ);
    await pool.query('BEGIN');
    try {
      let batchUpdated = 0;
let batchMatched = 0;
let batchNotMatched = 0;
      for (const [qdrant_id, entry] of slice) {
        if (
          entry.skip_write === true ||
          entry.kind === 'directory-cluster' ||
          entry.ledger_type === 'legacy_qdrant_only' ||
          entry.canonical === false ||
          entry.payload_unmatched === true ||
          (!entry.packet_key && !entry.source_ref)
        ) {
          pg_reasons.skipped++;
          continue;
        }
        const buf = floatArrayToBuffer(new Float32Array(entry.latent_64));
        let qdId = entry.qdrant_point_id || qdrant_id;
        const candidate_keys = entry.candidate_keys || [];
        
        let pKeys = [];
        let sRefs = [];

        for (const k of candidate_keys) {
          if (k.includes(':')) {
            pKeys.push(k);
            const prefix = k.startsWith('sveltekit-frontend/') ? k.replace('sveltekit-frontend/', '') : 'sveltekit-frontend/' + k;
            pKeys.push(prefix);
          } else {
            sRefs.push(k);
            const prefix = k.startsWith('sveltekit-frontend/') ? k.replace('sveltekit-frontend/', '') : 'sveltekit-frontend/' + k;
            sRefs.push(prefix);
          }
        }

        if (entry.packet_key) {
          pKeys.push(entry.packet_key);
          const prefix = entry.packet_key.startsWith('sveltekit-frontend/')
            ? entry.packet_key.replace('sveltekit-frontend/', '')
            : 'sveltekit-frontend/' + entry.packet_key;
          pKeys.push(prefix);
        }
        if (entry.source_ref) {
          sRefs.push(entry.source_ref);
          const prefix = entry.source_ref.startsWith('sveltekit-frontend/')
            ? entry.source_ref.replace('sveltekit-frontend/', '')
            : 'sveltekit-frontend/' + entry.source_ref;
          sRefs.push(prefix);
        }

        const finalPKeys = Array.from(new Set(pKeys));
        const finalSRes = Array.from(new Set(sRefs));

        if (!qdId) qdId = qdrant_id;
        if (finalPKeys.length === 0) finalPKeys.push(qdrant_id, 'sveltekit-frontend/' + qdrant_id);
        if (finalSRes.length === 0) finalSRes.push(qdrant_id, 'sveltekit-frontend/' + qdrant_id);

        let matched = false;

        // Reason 1: Direct qdrant_point_id match
        let res = await pool.query(
          `UPDATE atlas_packets
              SET latent_64 = $1::bytea,
                  metadata = jsonb_set(
                    jsonb_set(
                      jsonb_set(coalesce(metadata, '{}'::jsonb), '{ae_epoch}', $3::jsonb),
                      '{ae_val_loss}', $4::jsonb
                    ),
                    '{ae_timestamp}', $5::jsonb
                  ),
                  updated_at = NOW()
            WHERE qdrant_point_id = $2
           RETURNING packet_id`,
          [
            buf,
            qdId,
            JSON.stringify(meta.epoch ?? 60),
            JSON.stringify(meta.best_val_loss ?? meta.val_loss ?? 0.0),
            JSON.stringify(meta.timestamp ?? new Date().toISOString())
          ]
        );

        if (res.rowCount > 0) {
          pg_reasons.qdrant_point_id += res.rowCount;
          matched = true;
          batchUpdated += res.rowCount;
        }

        // Reason 2: packet_key match
        if (!matched && finalPKeys.length > 0) {
          res = await pool.query(
            `UPDATE atlas_packets
                SET latent_64 = $1::bytea,
                    metadata = jsonb_set(
                      jsonb_set(
                        jsonb_set(coalesce(metadata, '{}'::jsonb), '{ae_epoch}', $3::jsonb),
                        '{ae_val_loss}', $4::jsonb
                      ),
                      '{ae_timestamp}', $5::jsonb
                    ),
                    updated_at = NOW()
              WHERE packet_key = ANY($2::text[])
             RETURNING packet_id`,
            [
              buf,
              finalPKeys,
              JSON.stringify(meta.epoch ?? 60),
              JSON.stringify(meta.best_val_loss ?? meta.val_loss ?? 0.0),
              JSON.stringify(meta.timestamp ?? new Date().toISOString())
            ]
          );

          if (res.rowCount > 0) {
            pg_reasons.packet_key += res.rowCount;
            matched = true;
            batchUpdated += res.rowCount;
          }
        }

        // Reason 3: source_ref match
        if (!matched && finalSRes.length > 0) {
          res = await pool.query(
            `UPDATE atlas_packets
                SET latent_64 = $1::bytea,
                    metadata = jsonb_set(
                      jsonb_set(
                        jsonb_set(coalesce(metadata, '{}'::jsonb), '{ae_epoch}', $3::jsonb),
                        '{ae_val_loss}', $4::jsonb
                      ),
                      '{ae_timestamp}', $5::jsonb
                    ),
                    updated_at = NOW()
              WHERE source_ref = ANY($2::text[])
             RETURNING packet_id`,
            [
              buf,
              finalSRes,
              JSON.stringify(meta.epoch ?? 60),
              JSON.stringify(meta.best_val_loss ?? meta.val_loss ?? 0.0),
              JSON.stringify(meta.timestamp ?? new Date().toISOString())
            ]
          );

          if (res.rowCount > 0) {
            pg_reasons.source_ref += res.rowCount;
            matched = true;
            batchUpdated += res.rowCount;
          }
        }

        // Reason 4: JSONB fallback
        if (!matched) {
          const directPKey = entry.packet_key || qdId;
          const directSRef = entry.source_ref || qdId;
          const primaryIdVal = entry.primary_id || qdId;

          res = await pool.query(
            `UPDATE atlas_packets
                SET latent_64 = $1::bytea,
                    metadata = jsonb_set(
                      jsonb_set(
                        jsonb_set(coalesce(metadata, '{}'::jsonb), '{ae_epoch}', $5::jsonb),
                        '{ae_val_loss}', $6::jsonb
                      ),
                      '{ae_timestamp}', $7::jsonb
                    ),
                    updated_at = NOW()
              WHERE payload @> jsonb_build_object('qdrant_point_id', $2::text)
                 OR metadata @> jsonb_build_object('qdrant_point_id', $2::text)
                 OR payload @> jsonb_build_object('packet_key', $8::text)
                 OR metadata @> jsonb_build_object('packet_key', $8::text)
                 OR payload @> jsonb_build_object('packetKey', $8::text)
                 OR metadata @> jsonb_build_object('packetKey', $8::text)
                 OR payload @> jsonb_build_object('source_ref', $9::text)
                 OR metadata @> jsonb_build_object('source_ref', $9::text)
                 OR payload @> jsonb_build_object('sourceRef', $9::text)
                 OR metadata @> jsonb_build_object('sourceRef', $9::text)
                 OR payload @> jsonb_build_object('primary_id', $10::text)
                 OR metadata @> jsonb_build_object('primary_id', $10::text)
             RETURNING packet_id`,
            [
              buf,
              qdId,
              finalPKeys,
              finalSRes,
              JSON.stringify(meta.epoch ?? 60),
              JSON.stringify(meta.best_val_loss ?? meta.val_loss ?? 0.0),
              JSON.stringify(meta.timestamp ?? new Date().toISOString()),
              directPKey,
              directSRef,
              primaryIdVal
            ]
          );
          if (res.rowCount > 0) {
            pg_reasons.jsonb_fallback += res.rowCount;
            matched = true;
            batchUpdated += res.rowCount;
          }
        }
      }
      await pool.query('COMMIT');
      const result = { rowCount: batchUpdated };
      pgUpdated += Number(result?.rowCount ?? 0);
      const expected = slice.length;
      pgNotMatched += Math.max(0, expected - Number(result?.rowCount ?? 0));
      if (MEM_DIAG && (start / BATCH_SZ) % 10 === 0) {
        memDiagSnapshot(`Step 6 batch ${Math.floor(start / BATCH_SZ) + 1}/${Math.ceil(entries.length / BATCH_SZ)} (rows_written=${pgUpdated}, rows_not_matched=${pgNotMatched}, pool_total=${pool.totalCount}, pool_idle=${pool.idleCount}, pool_waiting=${pool.waitingCount})`);
      }
    } catch (e) {
      await pool.query('ROLLBACK');
      console.error(`\n  ❌ Postgres batch failed at ${start}: ${e.message}`);
      if (pool) await pool.end();
      process.exit(3);
    }
    process.stdout.write(`\r  PG: ${pgUpdated} updated, ${pgNotMatched} not matched...`);
  }
  process.stdout.write('\n');
  console.log(`  ✅ Postgres: ${pgUpdated} rows updated, ${pgNotMatched} not matched\n`);
  
  const writebackReportPath = resolve('.', 'docs/reports/backfill-latent-vectors-writeback.json');
  mkdirSync(resolve('.', 'docs/reports'), { recursive: true });
  const batchTotal = entries.length;
  if (!DRY_RUN) {
    writeCheckpoint({
      runId: `backfill-latent-vectors:${process.pid}`,
      workspaceRevision: process.env.WORKSPACE_REVISION || 'unknown',
      collection: COLLECTION,
      representationId: 'latent_64',
      representationRevision: Number(meta.epoch ?? 60),
      nextOffset: null,
      lastPointId: latestPointId,
      processedCount: batchTotal,
      persistedCount: pgUpdated,
      datasetDigest: `collection:${COLLECTION};limit:${LIMIT};batch:${BATCH_SZ}`,
      updatedAt: new Date().toISOString(),
    });
  }
  writeFileSync(writebackReportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    checkpoint: !DRY_RUN ? {
      path: CHECKPOINT_FILE,
      resume: RESUME,
      datasetDigest: `collection:${COLLECTION};limit:${LIMIT};batch:${BATCH_SZ}`,
    } : null,
    total_processed: batchTotal,
    postgres: {
      updated: pgUpdated,
      notMatched: pgNotMatched,
      matchRate:
        batchTotal > 0
          ? Number(((pgUpdated / batchTotal) * 100).toFixed(2))
          : 0
    },
    reasons: pg_reasons
  }, null, 2));
  console.log(`  ✅ Reasoned writeback report saved to ${writebackReportPath}\n`);

  if (pool) await pool.end();

  // ── Step 7: Cache in Redis ─────────────────────────────────────────────────
  console.log('Step 7: Cache latent_64 → Redis / Valkey');
  console.log('─────────────────────────────────────────');

  const redisPassword = process.env.REDIS_PASSWORD || process.env.REDIS_PASS
    || process.env.VALKEY_PASSWORD || process.env.VALKEY_PASS || 'redis';

  const redis = new Redis({
    host:                process.env.REDIS_HOST || '127.0.0.1',
    port:                Number(process.env.REDIS_PORT || 6379),
    password:            redisPassword,
    lazyConnect:         true,
    enableOfflineQueue:  false,
    maxRetriesPerRequest: 1
  });

  let redis_ok = false;
  try {
    await redis.connect();
    let redisCached = 0;
    const pipeline = redis.pipeline();
    for (const [id, entry] of Object.entries(latentIndex)) {
      pipeline.setex(`gpu:autoencoder:latent_64:${id}`, REDIS_TTL, JSON.stringify(entry.latent_64));
      if (++redisCached % 500 === 0) {
        await pipeline.exec();
        process.stdout.write(`\r  Redis: ${redisCached} cached...`);
      }
    }
    await pipeline.exec();  // flush remainder
    process.stdout.write(`\r  Redis: ${redisCached} cached      \n`);
    console.log(`  ✅ Redis: ${Object.keys(latentIndex).length} keys (TTL=${REDIS_TTL}s)\n`);
    redis_ok = true;
  } catch (e) {
    console.warn(`  ⚠️  Redis unavailable: ${e.message} — continuing without cache`);
  } finally {
    try { await redis.quit(); } catch {}
  }

  // Write provenance row to atlas_topology_eval_times
  const provPool = new pg.Pool({ connectionString: DATABASE_URL });
  await provPool.query(
    `INSERT INTO atlas_topology_eval_times
       (packet_key, feature_id, lane, input_dim, latent_dim,
        encode_ms, redis_ms, postgres_ms, total_ms, cache_hit, metadata)
     VALUES ($1, $2, 'ae_encode', $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
    [
      Object.keys(latentIndex)[0] ?? '', null, INPUT_DIM, LATENT_DIM,
      t_encode, null, null, t_encode, redis_ok,
      JSON.stringify({ encoded_count, pgUpdated, pgNotMatched, model: 'autoencoder_768_128_64' })
    ]
  ).catch(e => console.warn('topology_eval row failed:', e.message));
  await provPool.end();

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('╔══════════════════════════════════════════════════════════════════╗');

  console.log('║  COMPLETE                                                        ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log(`  Vectors encoded:  ${encoded_count}`);
  console.log(`  Postgres updated: ${pgUpdated}`);
  console.log(`  Redis cached:     ${redis_ok ? Object.keys(latentIndex).length : 'skipped'}`);
  console.log(`  Latent index:     ${LATENT_FILE}`);
  memDiagSnapshot('final, before exit');
  console.log(`\n→ Next: node scripts/atlas/train-som-20x20.mjs`);
}

main().catch(err => {
  console.error('\n❌ Fatal:', err.message);
  process.exit(1);
});





