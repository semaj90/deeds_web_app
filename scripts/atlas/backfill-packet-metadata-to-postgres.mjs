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

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, '..', '..');
const require = createRequire(import.meta.url);

// ── Config ───────────────────────────────────────────────────────────────────

const ADDON_PATH = resolve(ROOT, 'simd-bridge/cpp/build/Release/tensorrt_bridge.node');
const MODEL_DIR = resolve(ROOT, 'models/autoencoder');
const LATENT_FILE = resolve(MODEL_DIR, 'autoencoder_latent_index.json');

const QDRANT_URL = (process.env.QDRANT_URL || 'http://127.0.0.1:6333').replace(/\/$/, '');
const COLLECTION = process.env.AE_QDRANT_COLLECTION || 'codebase_chunks_768';
const DATABASE_URL =
  process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

const INPUT_DIM = 768;
const HIDDEN_DIM = 128;
const LATENT_DIM = 64;
const REDIS_TTL = 7 * 24 * 3600; // 7 days

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const DRY_RUN = !APPLY || args.includes('--dry-run');
const limitArg = args.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : Infinity;
const batchArg = args.find((a) => a.startsWith('--batch='));
const BATCH_SZ = batchArg ? parseInt(batchArg.split('=')[1], 10) : 100;

// ── Helpers ───────────────────────────────────────────────────────────────────

function floatArrayToBuffer(fa) {
  const buf = Buffer.alloc(fa.length * 4);
  for (let i = 0; i < fa.length; i++) buf.writeFloatLE(fa[i], i * 4);
  return buf;
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

/** Scroll all vectors from Qdrant, up to LIMIT. */
async function scrollQdrant(url, collection, limit) {
  const vecs   = [];
  const ids    = [];
  const candidatesMap = {};
  const pointsMap = {};
  let   offset = null;

  while (vecs.length < limit) {
    const body = JSON.stringify({
      limit: Math.min(250, limit - vecs.length),
      with_payload: [
        "packet_key", "packetKey", "chunk_id", "source_ref", "sourceRef",
        "sourceRefs", "filePath", "canonical_source_ref", "path", "file_path",
        "qdrant_point_id", "feature_id", "featureId", "kind", "ledger_type",
        "canonical", "payload_unmatched"
      ],
      with_vector:  true,
      ...(offset ? { offset } : {})
    });
    const res  = await fetch(`${url}/collections/${collection}/points/scroll`, {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body
    });
    if (!res.ok) throw new Error(`Qdrant scroll ${res.status}: ${await res.text()}`);
    const json = await res.json();
    const pts  = json.result?.points ?? [];
    if (!pts.length) break;

    for (const p of pts) {
      let vec = p.vector;
      if (vec && typeof vec === 'object' && !Array.isArray(vec)) vec = p.vector.content || Object.values(vec)[0];
      if (
        Array.isArray(vec) &&
        vec.length === INPUT_DIM &&
        isCanonicalPacketPayload(p.payload)
      ) {
        vecs.push(vec);

        // Build candidate list
        const candidates = new Set();
        if (p.payload?.packetKey) candidates.add(String(p.payload.packetKey));
        if (p.payload?.packet_key) candidates.add(String(p.payload.packet_key));
        if (p.payload?.chunk_id) candidates.add(String(p.payload.chunk_id).replace(/^card:/, ""));
        if (p.payload?.filePath) candidates.add(String(p.payload.filePath));
        if (p.payload?.canonical_source_ref) candidates.add(String(p.payload.canonical_source_ref));
        if (p.payload?.source_ref) candidates.add(String(p.payload.source_ref));
        if (p.payload?.sourceRefs && p.payload.sourceRefs[0]) candidates.add(String(p.payload.sourceRefs[0]));
        if (p.payload?.path) candidates.add(String(p.payload.path));
        if (p.payload?.file_path) candidates.add(String(p.payload.file_path));
        if (p.payload?.qdrant_point_id) candidates.add(String(p.payload.qdrant_point_id));
        candidates.add(String(p.id));

        // Use the first non-numeric candidate as the main ID if available, otherwise Qdrant point ID
        let primaryId = String(p.id);
        for (const cand of candidates) {
          if (!/^\d+$/.test(cand)) {
            primaryId = cand;
            break;
          }
        }

        const qdPointId = String(p.id);
        const packet_key = p.payload?.packet_key ?? p.payload?.packetKey ?? p.payload?.chunk_id ?? null;
        const source_ref = p.payload?.source_ref ?? p.payload?.sourceRef ?? p.payload?.filePath ?? p.payload?.path ?? p.payload?.file_path ?? null;
        const canonical_source_ref = p.payload?.canonical_source_ref ?? p.payload?.canonicalSourceRef ?? null;
        const file_path = p.payload?.file_path ?? p.payload?.filePath ?? null;
        const feature_id = p.payload?.feature_id ?? p.payload?.featureId ?? null;

        const candidate_keys = [
          packet_key,
          source_ref,
          canonical_source_ref,
          file_path,
          p.payload?.source_ref,
          p.payload?.metadata?.source_ref
        ].filter(val => typeof val === 'string' && val.trim().length > 0);

        ids.push(qdPointId);
        candidatesMap[qdPointId] = Array.from(new Set([...candidates, ...candidate_keys]));
        pointsMap[qdPointId] = {
          primary_id: primaryId,
          qdrant_point_id: qdPointId,
          packet_key,
          source_ref,
          canonical_source_ref,
          feature_id,
          candidate_keys: Array.from(new Set(candidate_keys)),
          kind: p.payload?.kind ?? null,
          ledger_type: p.payload?.ledger_type ?? null,
          canonical: p.payload?.canonical ?? null,
          payload_unmatched: p.payload?.payload_unmatched ?? null
        };
      }
    }
    offset = json.result?.next_page_offset;
    if (!offset) break;
    process.stdout.write(`\r  [scroll] ${vecs.length} vectors fetched...`);
  }
  process.stdout.write('\n');
  return { vecs, ids, candidatesMap, pointsMap };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  backfill-latent-vectors.mjs — AE Encode: 768 → 128 → 64        ║');
  console.log(`╚══════════════════════════════════════════════════════════════════╝\n`);
  console.log(
    `Mode: ${DRY_RUN ? 'DRY-RUN' : 'APPLY'}  batch=${BATCH_SZ}  limit=${LIMIT === Infinity ? '∞' : LIMIT}\n`
  );

  // ── Step 1: Load trained weights ──────────────────────────────────────────
  console.log('Step 1: Load trained weights');
  console.log('─────────────────────────────');

  const metaPath = resolve(MODEL_DIR, 'ae_meta.json');
  if (!existsSync(metaPath)) {
    console.error(
      '❌ ae_meta.json not found. Run: python scripts/atlas/train-ae-pytorch.py first.'
    );
    process.exit(1);
  }
  const meta = JSON.parse(readFileSync(metaPath, 'utf-8'));
  console.log(`  input_dim:  ${meta.input_dim}`);
  console.log(`  hidden_dim: ${meta.hidden_dim}`);
  console.log(`  latent_dim: ${meta.latent_dim}`);
  console.log(`  trained:    ${meta.timestamp}  val_loss=${meta.best_val_loss?.toFixed(6)}`);

  // Layer 1: 768 → 128
  const W1 = loadNpy(resolve(MODEL_DIR, 'W_enc_768_128.npy')); // [128, 768]
  const b1 = loadNpy(resolve(MODEL_DIR, 'b_enc_128.npy')); // [128]
  // Layer 2: 128 → 64
  const W2 = loadNpy(resolve(MODEL_DIR, 'W_enc_128_64.npy')); // [64, 128]
  const b2 = loadNpy(resolve(MODEL_DIR, 'b_enc_64.npy')); // [64]

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
    console.error(
      '❌ addon.autoencoderEncode not exported — rebuild the addon with pytorch_graph.cc'
    );
    process.exit(1);
  }

  // ── Step 3: Fetch embeddings from Qdrant ──────────────────────────────────
  console.log('Step 3: Fetch embeddings from Qdrant');
  console.log('─────────────────────────────────────');

  let vecs, ids, candidatesMap, pointsMap;
  try {
    ({ vecs, ids, candidatesMap, pointsMap } = await scrollQdrant(QDRANT_URL, COLLECTION, LIMIT));
  } catch (e) {
    console.error(`❌ Qdrant scroll failed: ${e.message}`);
    process.exit(2);
  }

  const N = vecs.length;
  console.log(`  ${N} valid ${INPUT_DIM}-dim vectors from ${COLLECTION}\n`);

  if (N === 0) {
    console.error('❌ No vectors found — check QDRANT_URL and collection name');
    process.exit(2);
  }

  // ── Step 4: Encode 768 → 128 → 64 in GPU batches ─────────────────────────
  console.log('Step 4: Encode via autoencoderEncodeGPU() (768→128→64)');
  console.log('──────────────────────────────────────────────────────');

  const W1f = W1.data; // Float32Array [128*768]
  const b1f = b1.data; // Float32Array [128]
  const W2f = W2.data; // Float32Array [64*128]
  const b2f = b2.data; // Float32Array [64]

  const latentIndex = {}; // qdrant_id → latent object
  let encoded_count = 0;
  let t_encode = 0;

  for (let start = 0; start < N; start += BATCH_SZ) {
    const end = Math.min(start + BATCH_SZ, N);
    const bSize = end - start;
    const batch = new Float32Array(bSize * INPUT_DIM);
    for (let i = 0; i < bSize; i++) {
      const v = vecs[start + i];
      for (let j = 0; j < INPUT_DIM; j++) batch[i * INPUT_DIM + j] = v[j];
    }

    const t0 = Date.now();

    // Layer 1: batch[n×768] → h128[n×128]
    const h128 = addon.autoencoderEncode(batch, bSize, INPUT_DIM, W1f, b1f, HIDDEN_DIM);
    // Layer 2: h128[n×128] → latent64[n×64]
    const lat64 = addon.autoencoderEncode(h128, bSize, HIDDEN_DIM, W2f, b2f, LATENT_DIM);

    t_encode += Date.now() - t0;

    for (let i = 0; i < bSize; i++) {
      const id = String(ids[start + i]);
      const ptInfo = pointsMap[id] || {};
      latentIndex[id] = {
        primary_id: ptInfo.primary_id || id,
        qdrant_point_id: ptInfo.qdrant_point_id || '',
        packet_key: ptInfo.packet_key || null,
        source_ref: ptInfo.source_ref || null,
        canonical_source_ref: ptInfo.canonical_source_ref || null,
        feature_id: ptInfo.feature_id || null,
        candidate_keys: ptInfo.candidate_keys || [],
        kind: ptInfo.kind ?? null,
        ledger_type: ptInfo.ledger_type ?? null,
        canonical: ptInfo.canonical ?? null,
        payload_unmatched: ptInfo.payload_unmatched ?? null,
        latent_64: Array.from(lat64.subarray(i * LATENT_DIM, (i + 1) * LATENT_DIM)),
      };
    }
    encoded_count = end;
    process.stdout.write(
      `\r  Encoded ${encoded_count}/${N} (${(t_encode / encoded_count).toFixed(2)} ms/vec)...`
    );
  }
  process.stdout.write('\n');
  console.log(`  ✅ ${encoded_count} latent vectors produced in ${t_encode} ms\n`);

  // ── Step 5: Write latent index file ───────────────────────────────────────
  console.log('Step 5: Save latent index (for train-som-20x20.mjs)');
  console.log('─────────────────────────────────────────────────────');

  const latentArtifact = {
    timestamp: new Date().toISOString(),
    model: 'autoencoder_768_128_64',
    input_dim: INPUT_DIM,
    hidden_dim: HIDDEN_DIM,
    output_dim: LATENT_DIM,
    packet_count: Object.keys(latentIndex).length,
    index: latentIndex, // { qdrant_id: latent object }
    candidates: candidatesMap, // { qdrant_id: [candidates] }
  };

  if (DRY_RUN) {
    console.log(
      `  🔍 DRY-RUN — would write ${Object.keys(latentIndex).length} entries to ${LATENT_FILE}`
    );
    console.log('   Skipping artifact, Postgres, and Redis writes. Use --apply to persist.');
    return;
  }

  mkdirSync(MODEL_DIR, { recursive: true });
  writeFileSync(LATENT_FILE, JSON.stringify(latentArtifact, null, 2));
  console.log(`  ✅ ${LATENT_FILE}  (${Object.keys(latentIndex).length} entries)\n`);

  // ── Step 6: Write to Postgres atlas_packets ────────────────────────────────
  console.log('Step 6: Write latent_64 → Postgres atlas_packets');
  console.log('──────────────────────────────────────────────────');

  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  let pg_reasons = {
    qdrant_point_id: 0,
    packet_key: 0,
    source_ref: 0,
    jsonb_fallback: 0,
    skipped: 0,
  };
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
          entry.kind === 'directory-cluster' ||
          entry.ledger_type === 'legacy_qdrant_only' ||
          entry.canonical === false ||
          entry.payload_unmatched === true ||
          (!entry.packet_key && !entry.source_ref && !(entry.candidate_keys || []).length)
        ) {
          pg_reasons.skipped++;
          continue;
        }

        const buf = floatArrayToBuffer(new Float32Array(entry.latent_64));
        let qdId = entry.qdrant_point_id || qdrant_id;
        const candidate_keys = entry.candidate_keys ?? [];

        let pKeys = [];
        let sRefs = [];

        for (const k of candidate_keys) {
          if (typeof k !== 'string' || k.trim().length === 0) continue;

          const key = k.trim();

          if (key.includes(':')) {
            pKeys.push(key);
            const prefix = key.startsWith('sveltekit-frontend/')
              ? key.replace('sveltekit-frontend/', '')
              : 'sveltekit-frontend/' + key;
            pKeys.push(prefix);
          } else {
            sRefs.push(key);
            const prefix = key.startsWith('sveltekit-frontend/')
              ? key.replace('sveltekit-frontend/', '')
              : 'sveltekit-frontend/' + key;
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

        const finalPKeys = Array.from(new Set(pKeys.filter(Boolean)));
        const finalSRes = Array.from(new Set(sRefs.filter(Boolean)));

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
            JSON.stringify(meta.timestamp ?? new Date().toISOString()),
          ]
        );

        if (res.rowCount > 0) {
          pg_reasons.qdrant_point_id += res.rowCount;
          matched = true;
          batchMatched++;
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
              JSON.stringify(meta.timestamp ?? new Date().toISOString()),
            ]
          );

          if (res.rowCount > 0) {
            pg_reasons.packet_key += res.rowCount;
            matched = true;
            batchMatched++;
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
              JSON.stringify(meta.timestamp ?? new Date().toISOString()),
            ]
          );

          if (res.rowCount > 0) {
            pg_reasons.source_ref += res.rowCount;
            matched = true;
            batchMatched++;
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
              primaryIdVal,
            ]
          );

          if (res.rowCount > 0) {
            pg_reasons.jsonb_fallback += res.rowCount;
            matched = true;
            batchMatched++;
            batchUpdated += res.rowCount;
          }
        }

        if (!matched) {
          batchNotMatched++;
        }
      }

      await pool.query('COMMIT');

      pgUpdated += batchUpdated;
      pgNotMatched += batchNotMatched;
    } catch (e) {
      await pool.query('ROLLBACK');
      console.error(`\n  ❌ Postgres batch failed at ${start}: ${e.message}`);
      await pool.end();
      process.exit(3);
    }

    process.stdout.write(`\r  PG: ${pgUpdated} updated, ${pgNotMatched} not matched...`);
  }

  process.stdout.write('\n');
  console.log(`  ✅ Postgres: ${pgUpdated} rows updated, ${pgNotMatched} not matched\n`);

  const writebackReportPath = resolve('.', 'docs/reports/backfill-latent-vectors-writeback.json');
  mkdirSync(resolve('.', 'docs/reports'), { recursive: true });
  const batchTotal = entries.length;

  writeFileSync(
    writebackReportPath,
    JSON.stringify(
      {
        timestamp: new Date().toISOString(),
        total_processed: batchTotal,
        postgres: {
          updated: pgUpdated,
          notMatched: pgNotMatched,
          matchRate: batchTotal > 0 ? Number(((pgUpdated / batchTotal) * 100).toFixed(2)) : 0,
        },
        reasons: pg_reasons,
      },
      null,
      2
    )
  );

  console.log(`  ✅ Reasoned writeback report saved to ${writebackReportPath}\n`);

  await pool.end();

  // ── Step 7: Cache in Redis ─────────────────────────────────────────────────
  console.log('Step 7: Cache latent_64 → Redis / Valkey');
  console.log('─────────────────────────────────────────');

  const redisPassword =
    process.env.REDIS_PASSWORD ||
    process.env.REDIS_PASS ||
    process.env.VALKEY_PASSWORD ||
    process.env.VALKEY_PASS ||
    'redis';

  const redis = new Redis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: Number(process.env.REDIS_PORT || 6379),
    password: redisPassword,
    lazyConnect: true,
    enableOfflineQueue: false,
    maxRetriesPerRequest: 1,
  });

  let redis_ok = false;

  try {
    await redis.connect();
    redisCached = 0;
    const pipeline = redis.pipeline();

    for (const [id, entry] of Object.entries(latentIndex)) {
      pipeline.setex(`gpu:autoencoder:latent_64:${id}`, REDIS_TTL, JSON.stringify(entry.latent_64));

      if (++redisCached % 500 === 0) {
        await pipeline.exec();
        process.stdout.write(`\r  Redis: ${redisCached} cached...`);
      }
    }

    await pipeline.exec(); // flush remainder
    process.stdout.write(`\r  Redis: ${redisCached} cached      \n`);
    console.log(`  ✅ Redis: ${Object.keys(latentIndex).length} keys (TTL=${REDIS_TTL}s)\n`);
    redis_ok = true;
  } catch (e) {
    console.warn(`  ⚠️  Redis unavailable: ${e.message} — continuing without cache`);
  } finally {
    try {
      await redis.quit();
    } catch {}
  }

  // Write provenance row to atlas_topology_eval_times
  const provPool = new pg.Pool({ connectionString: DATABASE_URL });

  await provPool
    .query(
      `INSERT INTO atlas_topology_eval_times
       (packet_key, feature_id, lane, input_dim, latent_dim,
        encode_ms, redis_ms, postgres_ms, total_ms, cache_hit, metadata)
     VALUES ($1, $2, 'ae_encode', $3, $4, $5, $6, $7, $8, $9, $10::jsonb)`,
      [
        Object.keys(latentIndex)[0] ?? '',
        null,
        INPUT_DIM,
        LATENT_DIM,
        t_encode,
        null,
        null,
        t_encode,
        redis_ok,
        JSON.stringify({
          encoded_count,
          pgUpdated,
          pgNotMatched,
          model: 'autoencoder_768_128_64',
        }),
      ]
    )
    .catch((e) => console.warn('topology_eval row failed:', e.message));

  await provPool.end();

  // ── Summary ────────────────────────────────────────────────────────────────
  console.log('╔══════════════════════════════════════════════════════════════════╗');
  console.log('║  COMPLETE                                                        ║');
  console.log('╚══════════════════════════════════════════════════════════════════╝');
  console.log(`  Vectors encoded:  ${encoded_count}`);
  console.log(`  Postgres updated: ${pgUpdated}`);
  console.log(`  Redis cached:     ${redis_ok ? Object.keys(latentIndex).length : 'skipped'}`);
  console.log(`  Latent index:     ${LATENT_FILE}`);
  console.log(`\n→ Next: node scripts/atlas/train-som-20x20.mjs`);
}

main().catch((err) => {
  console.error('\n❌ Fatal:', err.message);
  process.exit(1);
});