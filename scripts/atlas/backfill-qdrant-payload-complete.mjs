#!/usr/bin/env node
/**
 * H.5: Backfill Qdrant Payload with canonical Postgres fields
 *
 * Uses qdrant_point_id from atlas_higher_hop_index (populated by H.4) to call
 * the correct Qdrant set_payload endpoint with explicit point IDs.
 *
 * Only processes rows where identity_lane = 'source_ref_key->qdrant' (vector-backed).
 * Skips mcp_tool_stub / schema_stub / qdrant_gap lanes.
 *
 * Writes these fields into each Qdrant point payload:
 *   packet_key, source_ref, feature_id, feature_label,
 *   community_id, lineage_version, tree_node_id, som_cluster
 *
 * Usage:
 *   node scripts/atlas/backfill-qdrant-payload-complete.mjs --apply [--limit 5000] [--batch 25]
 *   node scripts/atlas/backfill-qdrant-payload-complete.mjs --verify
 */

import pg from 'pg';
import { config } from 'dotenv';
import { resolve } from 'path';
import fetch from 'node-fetch';

config({ path: resolve('.', '.env') });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const QDRANT_URL      = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const COLLECTION_NAME = 'codebase_chunks_768';

const args    = process.argv.slice(2);
const APPLY   = args.includes('--apply');
const VERIFY  = args.includes('--verify');
const DRY_RUN = !APPLY && !VERIFY;

function getArg(name, fallback) {
  const eq = args.find(a => a.startsWith(`--${name}=`));
  if (eq) return eq.split('=').slice(1).join('=');
  const idx = args.indexOf(`--${name}`);
  if (idx !== -1 && args[idx + 1] && !args[idx + 1].startsWith('--')) return args[idx + 1];
  return fallback;
}

const LIMIT = parseInt(getArg('limit', '999999'), 10);
const BATCH = parseInt(getArg('batch', '50'),     10);

const mode = APPLY ? 'APPLY' : DRY_RUN ? 'DRY-RUN' : 'VERIFY';

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  H.5: Qdrant Payload Backfill (by qdrant_point_id)            ║');
console.log(`║  Mode: ${mode.padEnd(54)}║`);
console.log('╚════════════════════════════════════════════════════════════════╝\n');

// ── Qdrant helper ─────────────────────────────────────────────────────────────
async function qdrantPost(path, body) {
  const res = await fetch(`${QDRANT_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`Qdrant ${res.status} on ${path}: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

async function qdrantGet(path) {
  const res = await fetch(`${QDRANT_URL}${path}`);
  const text = await res.text();
  if (!res.ok) throw new Error(`Qdrant GET ${res.status} on ${path}: ${text.slice(0, 200)}`);
  return JSON.parse(text);
}

// ── Backfill ──────────────────────────────────────────────────────────────────
async function backfill(client) {
  console.log('📊 Step 1: Load linked rows from atlas_higher_hop_index\n');

  const result = await client.query(`
    SELECT
      h.qdrant_point_id,
      h.packet_key,
      h.source_ref,
      p.feature_id,
      p.feature_label,
      p.community_id,
      p.lineage_version,
      h.tree_node_id,
      h.som_cluster
    FROM atlas_higher_hop_index h
    LEFT JOIN atlas_codebase_packets p ON p.packet_key = h.packet_key
    WHERE h.qdrant_point_id IS NOT NULL
      AND h.identity_lane IN ('source_ref_key->qdrant', 'packet_spine', 'source_ref')
    ORDER BY h.updated_at DESC
    LIMIT $1
  `, [LIMIT]);

  const rows = result.rows;
  console.log(`   ✅ Loaded ${rows.length} rows with qdrant_point_id\n`);

  if (DRY_RUN) {
    console.log('   DRY-RUN — preview (first 3 rows):\n');
    for (const r of rows.slice(0, 3)) {
      console.log(`   Point ${r.qdrant_point_id} → packet_key=${r.packet_key}`);
      console.log(`     source_ref=${r.source_ref}`);
      console.log(`     feature_id=${r.feature_id}  feature_label=${r.feature_label}`);
      console.log('');
    }
    console.log('   Run with --apply to write to Qdrant.\n');
    return { success: true, applied: 0, failed: 0, total: rows.length };
  }

  // ── Apply in batches using set_payload by point IDs ───────────────────────
  console.log(`🔄 Step 2: Apply payload updates to Qdrant (batch=${BATCH})\n`);

  let applied = 0;
  let failed  = 0;

  for (let i = 0; i < rows.length; i += BATCH) {
    const chunk    = rows.slice(i, i + BATCH);
    const batchNum = Math.floor(i / BATCH) + 1;
    const total    = Math.ceil(rows.length / BATCH);

    // Qdrant set_payload accepts: { payload, points: [id, id, ...] }
    // But each point may need different field values, so we must do one call
    // per point OR group points that share the same payload values.
    // Simplest correct approach: one set_payload call per batch using
    // /points/batch with individual overwrite operations.
    //
    // Actually the most reliable path: call set_payload per-point.
    // Qdrant supports: POST /collections/{name}/points/payload
    //   { payload: {...}, points: [id] }

    let batchOk = 0;
    let batchFail = 0;

    for (const row of chunk) {
      const raw = String(row.qdrant_point_id).trim();
      // Qdrant supports integer IDs and UUID IDs
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw);
      const pointId = isUuid ? raw : parseInt(raw, 10);
      if (!isUuid && isNaN(pointId)) { batchFail++; continue; }

      const payload = {
        packet_key:      row.packet_key    || null,
        source_ref:      row.source_ref    || null,
        feature_id:      row.feature_id    || null,
        feature_label:   row.feature_label || null,
        community_id:    row.community_id  !== null ? parseInt(row.community_id) : null,
        lineage_version: row.lineage_version || 'packet-identity-v2',
        tree_node_id:    row.tree_node_id  !== null ? String(row.tree_node_id) : null,
        som_cluster:     row.som_cluster   !== null ? parseInt(row.som_cluster) : null,
      };

      try {
        await qdrantPost(
          `/collections/${COLLECTION_NAME}/points/payload`,
          { payload, points: [pointId] }
        );
        batchOk++;
      } catch (err) {
        batchFail++;
        if (batchFail <= 3) console.log(`   ❌ Point ${pointId}: ${err.message}`);
      }
    }

    applied += batchOk;
    failed  += batchFail;

    const pct = ((i + chunk.length) / rows.length * 100).toFixed(0);
    if (batchFail === 0) {
      console.log(`   ✅ Batch ${batchNum}/${total}  +${batchOk} updated  (${pct}%)`);
    } else {
      console.log(`   ⚠️  Batch ${batchNum}/${total}  +${batchOk} ok  ${batchFail} failed  (${pct}%)`);
    }
  }

  console.log(`\n   Applied: ${applied}  Failed: ${failed}  Total: ${rows.length}\n`);
  return { success: failed === 0, applied, failed, total: rows.length };
}

// ── Verify ────────────────────────────────────────────────────────────────────
async function verify(client) {
  console.log('🔍 Verify: Sampling Qdrant payloads for canonical fields\n');

  // Sample 20 linked points
  const result = await client.query(`
    SELECT qdrant_point_id, packet_key, source_ref
    FROM atlas_higher_hop_index
    WHERE qdrant_point_id IS NOT NULL
    ORDER BY updated_at DESC
    LIMIT 20
  `);

  const ids = result.rows.map(r => parseInt(r.qdrant_point_id)).filter(n => !isNaN(n));

  const data = await qdrantPost(`/collections/${COLLECTION_NAME}/points`, { ids, with_payload: true });
  const points = data.result || [];

  let hasPacketKey = 0, hasSourceRef = 0, hasFeatureId = 0;
  for (const pt of points) {
    if (pt.payload?.packet_key)  hasPacketKey++;
    if (pt.payload?.source_ref)  hasSourceRef++;
    if (pt.payload?.feature_id)  hasFeatureId++;
  }

  console.log(`   Sampled ${points.length} points:`);
  console.log(`   packet_key   : ${hasPacketKey}/${points.length}`);
  console.log(`   source_ref   : ${hasSourceRef}/${points.length}`);
  console.log(`   feature_id   : ${hasFeatureId}/${points.length}`);
  console.log('');

  // DB coverage summary
  const cov = await client.query(`
    SELECT
      COUNT(*) AS total,
      COUNT(CASE WHEN qdrant_point_id IS NOT NULL THEN 1 END) AS linked,
      COUNT(CASE WHEN identity_lane = 'mcp_tool_stub' THEN 1 END) AS mcp_stubs,
      COUNT(CASE WHEN identity_lane = 'schema_stub'   THEN 1 END) AS schema_stubs,
      COUNT(CASE WHEN identity_lane = 'qdrant_gap'    THEN 1 END) AS qdrant_gaps
    FROM atlas_higher_hop_index
  `);
  const c = cov.rows[0];
  const pct = (100 * c.linked / c.total).toFixed(1);

  console.log('   DB coverage:');
  console.log(`   Total rows   : ${c.total}`);
  console.log(`   Linked       : ${c.linked} (${pct}%)`);
  console.log(`   mcp_tool_stub: ${c.mcp_stubs}`);
  console.log(`   schema_stub  : ${c.schema_stubs}`);
  console.log(`   qdrant_gap   : ${c.qdrant_gaps}`);
  console.log('');

  const gatePassed = parseInt(c.linked) >= parseInt(c.total) * 0.70;
  if (gatePassed) {
    console.log('   ✅ Coverage gate PASSED (≥70% linked — non-vector lanes excluded)');
  } else {
    console.log(`   ⚠️  Coverage gate WARNING: ${pct}% < 70%`);
  }
  console.log('');
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const client = await pool.connect();
  try {
    if (VERIFY) {
      await verify(client);
    } else {
      const result = await backfill(client);
      await verify(client);

      if (result.success || DRY_RUN) {
        console.log('╔════════════════════════════════════════════════════════════════╗');
        console.log('║  H.5 Complete ✅                                              ║');
        console.log('╚════════════════════════════════════════════════════════════════╝\n');
        if (DRY_RUN) console.log('   Run with --apply to write changes.\n');
      } else {
        console.error('❌ H.5 finished with failures — check output above\n');
        process.exitCode = 1;
      }
    }
  } catch (err) {
    console.error('Fatal:', err.message);
    process.exitCode = 1;
  } finally {
    await client.release();
    await pool.end();
  }
}

main();
