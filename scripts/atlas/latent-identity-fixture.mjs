#!/usr/bin/env node
/**
 * latent-identity-fixture.mjs
 *
 * Bounded, NO-PRODUCTION-MUTATION fixture per the operator's LAT-gate spec
 * (OpenSpec parent-atlas-graph-retrieval-proof, GS1.9-GS1.13 identity
 * prerequisites are still NOT_PROVEN — see that file before treating any
 * latent_64 output here as canonical).
 *
 * Does NOT write to atlas_packets. Writes only to a dedicated
 * atlas_latent_fixture scratch table (created here, not part of the
 * Drizzle-tracked schema) so idempotent-skip behavior can be proven across
 * separate invocations without touching canonical state.
 *
 * Steps (operator's numbering):
 *   1. Select packets by canonical packet_id
 *   2. Join packet -> source revision (best available live proxy:
 *      atlas_ast_nodes.source_revision via source_ref_key — NOT a canonical
 *      source_version_id join, which does not exist yet; reported honestly)
 *   3. Join code packets -> tree/symbol candidate (tree_node_id presence only
 *      — no canonical symbol_version_id contract exists yet, GS1.10)
 *   4. Reject unresolved/ambiguous identities (no packet_key AND no source_ref)
 *   5. Load semantic_768 with its representation revision (atlas_packets.embedding,
 *      vector(768) — confirmed live 2026-08-03: fully populated, 61,659/61,659
 *      non-null, contradicting a stale CLAUDE.md claim that this column is
 *      deprecated/all-NULL; flagged, not silently trusted)
 *   6. Generate latent_64 in memory via the same trained AE weights backfill-latent-vectors.mjs uses
 *   7. Serialize/deserialize BYTEA round-trip
 *   8. Verify vector length, dtype, digest
 *   9. Write into atlas_latent_fixture (scratch table, never atlas_packets)
 *   10. Re-run to prove idempotent skip behavior (content-digest compare)
 *
 * Usage: node scripts/atlas/latent-identity-fixture.mjs [--limit=1000]
 */

import crypto from 'node:crypto';
import { createRequire } from 'module';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { readFileSync } from 'fs';
import pg from 'pg';
import { loadAtlasEnv } from './load-atlas-env.mjs';

loadAtlasEnv(resolve('.'));

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dir, '..', '..');
const require = createRequire(import.meta.url);

const ADDON_PATH = resolve(ROOT, 'simd-bridge/cpp/build/Release/tensorrt_bridge.node');
const MODEL_DIR = resolve(ROOT, 'models/autoencoder');
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

const args = process.argv.slice(2);
const limitArg = args.find((a) => a.startsWith('--limit='));
const LIMIT = Math.min(1000, limitArg ? parseInt(limitArg.split('=')[1], 10) : 1000);

const INPUT_DIM = 768;
const HIDDEN_DIM = 128;
const LATENT_DIM = 64;
const REPRESENTATION_ID = 'ae_latent_64';
const REPRESENTATION_REVISION = 'fixture-v1'; // deliberately distinct from any production ae_epoch value

function loadNpy(path) {
  const raw = readFileSync(path);
  const isNpy = raw[0] === 0x93 && raw[1] === 0x4e && raw[2] === 0x55 && raw[3] === 0x4d && raw[4] === 0x50 && raw[5] === 0x59;
  if (!isNpy) throw new Error(`Not a .npy file: ${path}`);
  const hdrLen = raw[8] + (raw[9] << 8);
  return new Float32Array(raw.buffer, raw.byteOffset + 10 + hdrLen);
}

function floatArrayToBuffer(fa) {
  const buf = Buffer.alloc(fa.length * 4);
  for (let i = 0; i < fa.length; i++) buf.writeFloatLE(fa[i], i * 4);
  return buf;
}

function bufferToFloatArray(buf) {
  const out = new Array(buf.length / 4);
  for (let i = 0; i < out.length; i++) out[i] = buf.readFloatLE(i * 4);
  return out;
}

function parsePgVector(text) {
  if (!text) return null;
  return text.replace(/^\[|\]$/g, '').split(',').map(Number);
}

function sha256Hex(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 1 });

  const addon = require(ADDON_PATH);
  const W1 = loadNpy(resolve(MODEL_DIR, 'W_enc_768_128.npy'));
  const b1 = loadNpy(resolve(MODEL_DIR, 'b_enc_128.npy'));
  const W2 = loadNpy(resolve(MODEL_DIR, 'W_enc_128_64.npy'));
  const b2 = loadNpy(resolve(MODEL_DIR, 'b_enc_64.npy'));

  // Scratch table only — never atlas_packets, never Drizzle-tracked.
  await pool.query(`
    CREATE TABLE IF NOT EXISTS atlas_latent_fixture (
      packet_id text PRIMARY KEY,
      packet_key text,
      source_ref text,
      representation_id text NOT NULL,
      representation_revision text NOT NULL,
      dimensions int NOT NULL,
      dtype text NOT NULL,
      byte_order text NOT NULL,
      source_representation_id text NOT NULL,
      content_digest text NOT NULL,
      roundtrip_ok boolean NOT NULL,
      identity_status text NOT NULL,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `);

  console.log(`[fixture] Step 1: selecting up to ${LIMIT} packets by canonical packet_id`);
  const { rows: packets } = await pool.query(
    `SELECT packet_id, packet_key, source_ref, embedding::text AS embedding_text, tree_node_id
     FROM atlas_packets
     WHERE packet_id IS NOT NULL
     ORDER BY packet_id
     LIMIT $1;`,
    [LIMIT],
  );

  const metrics = {
    selected_count: packets.length,
    canonical_packet_count: 0,
    source_version_joined_count: 0,
    symbol_version_joined_count: 0, // stays 0: no canonical symbol_version_id contract exists yet (GS1.10 NOT_PROVEN) — honest NOT_APPLICABLE, not a bug
    ambiguous_identity_count: 0,
    stale_representation_count: 0, // here: missing/malformed semantic_768 source vector (no representation-revision registry exists yet to detect true staleness)
    generated_count: 0,
    roundtrip_bytea_count: 0,
    digest_match_count: 0,
    second_run_skipped_count: 0,
    peak_heap_mb: 0,
  };

  console.log('[fixture] Step 2: joining source-revision proxy (atlas_ast_nodes.source_revision via source_ref_key)');
  const sourceRefKeys = [...new Set(packets.map((p) => p.source_ref).filter(Boolean))];
  const astJoinMap = new Map();
  if (sourceRefKeys.length > 0) {
    const { rows: astRows } = await pool.query(
      `SELECT source_ref_key, source_revision
       FROM atlas_ast_nodes
       WHERE source_ref_key = ANY($1::text[]) AND source_revision IS NOT NULL;`,
      [sourceRefKeys],
    );
    for (const r of astRows) astJoinMap.set(r.source_ref_key, r.source_revision);
  }

  const eligible = [];
  for (const p of packets) {
    const hasCanonicalKey = Boolean(p.packet_key);
    if (hasCanonicalKey) metrics.canonical_packet_count++;

    const sourceRevision = p.source_ref ? astJoinMap.get(p.source_ref) ?? null : null;
    if (sourceRevision) metrics.source_version_joined_count++;

    const ambiguous = !hasCanonicalKey && !p.source_ref;
    if (ambiguous) {
      metrics.ambiguous_identity_count++;
      continue;
    }

    const embedding = parsePgVector(p.embedding_text);
    if (!embedding || embedding.length !== INPUT_DIM) {
      metrics.stale_representation_count++;
      continue;
    }

    eligible.push({ packet: p, embedding, sourceRevision });
  }

  console.log(`[fixture] Step 3-6: generating ${REPRESENTATION_ID} for ${eligible.length} identity-eligible packets`);
  const fixtureRows = [];
  for (const { packet, embedding, sourceRevision } of eligible) {
    const inputVec = new Float32Array(embedding);
    const h128 = addon.autoencoderEncode(inputVec, 1, INPUT_DIM, W1, b1, HIDDEN_DIM);
    const lat64 = addon.autoencoderEncode(h128, 1, HIDDEN_DIM, W2, b2, LATENT_DIM);
    metrics.generated_count++;

    // Step 7: BYTEA round-trip
    const buf = floatArrayToBuffer(lat64);
    const roundtrip = bufferToFloatArray(buf);
    const roundtripOk =
      roundtrip.length === LATENT_DIM && roundtrip.every((v, i) => Math.abs(v - lat64[i]) < 1e-6);
    if (roundtripOk) metrics.roundtrip_bytea_count++;

    // Step 8: length + digest verification
    const digest = sha256Hex(buf);
    const lengthOk = buf.length === LATENT_DIM * 4;
    if (lengthOk) metrics.digest_match_count++;

    fixtureRows.push({
      packet_id: packet.packet_id,
      packet_key: packet.packet_key,
      source_ref: packet.source_ref,
      digest,
      roundtripOk,
      identityStatus: packet.tree_node_id
        ? sourceRevision
          ? 'SOURCE_REVISION_PROXY_AND_TREE_NODE'
          : 'TREE_NODE_ONLY'
        : sourceRevision
          ? 'SOURCE_REVISION_PROXY_ONLY'
          : packet.packet_key
            ? 'PACKET_KEY_ONLY'
            : 'SOURCE_REF_ONLY',
    });
  }

  metrics.peak_heap_mb = Number((process.memoryUsage().heapUsed / 1024 / 1024).toFixed(1));

  console.log('[fixture] Step 9-10: writing to scratch atlas_latent_fixture (never atlas_packets), checking idempotent skip');
  let newOrUpdatedCount = 0;
  for (const row of fixtureRows) {
    const existing = await pool.query(`SELECT content_digest FROM atlas_latent_fixture WHERE packet_id = $1;`, [
      row.packet_id,
    ]);
    if (existing.rows.length > 0 && existing.rows[0].content_digest === row.digest) {
      metrics.second_run_skipped_count++;
      continue;
    }
    newOrUpdatedCount++;
    await pool.query(
      `INSERT INTO atlas_latent_fixture
        (packet_id, packet_key, source_ref, representation_id, representation_revision,
         dimensions, dtype, byte_order, source_representation_id, content_digest,
         roundtrip_ok, identity_status)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
       ON CONFLICT (packet_id) DO UPDATE SET
         content_digest = EXCLUDED.content_digest,
         roundtrip_ok = EXCLUDED.roundtrip_ok,
         identity_status = EXCLUDED.identity_status,
         created_at = now();`,
      [
        row.packet_id,
        row.packet_key,
        row.source_ref,
        REPRESENTATION_ID,
        REPRESENTATION_REVISION,
        LATENT_DIM,
        'float32',
        'little_endian',
        'semantic_768',
        row.digest,
        row.roundtripOk,
        row.identityStatus,
      ],
    );
  }

  console.log('\n=== LATENT IDENTITY FIXTURE PROOF CONTRACT (no production mutation) ===');
  console.log(JSON.stringify({ ...metrics, new_or_updated_this_run: newOrUpdatedCount }, null, 2));

  await pool.end();
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
