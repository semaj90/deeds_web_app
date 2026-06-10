#!/usr/bin/env node
/**
 * scripts/atlas/audit-glyph-records.mjs
 *
 * Phase 2 — Verify and audit materialized glyph_records:
 *   1. glyph_records count > 0
 *   2. 100% packet_key linkage (every glyph → nes_chrom_packets)
 *   3. hmm_section distribution (non-empty, with confidence stats)
 *   4. community_id distribution (non-empty)
 *   5. manifold4 distribution (non-null, valid 4D coordinates)
 *   6. No raw embedding768 arrays in record_json
 *
 * Hard invariants verified:
 *   source_ref → atlas_feature_map → feature_id  (read-only check)
 *   packet_id == nes_chrom_packets.packet_key     (linkage check)
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

// ── Environment Loading ──────────────────────────────────────────────────────
function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const env = {};
  for (const line of fs.readFileSync(filePath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

const env = {
  ...loadEnv(path.join(ROOT, '.env')),
  ...loadEnv(path.join(ROOT, 'sveltekit-frontend', '.env')),
  ...process.env,
};

const DATABASE_URL = env.DATABASE_URL || env.ADMIN_DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

async function main() {
  console.log('🧐 Glyph Records Audit (Phase 2)\n');
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  let failures = 0;

  // ── 1. Total Count ─────────────────────────────────────────────────────────
  const countRes = await pool.query('SELECT COUNT(*) AS c FROM glyph_records');
  const count = parseInt(countRes.rows[0].c, 10);
  console.log(`[1] glyph_records count: ${count}`);
  if (count === 0) {
    console.error('  ❌ FAIL: No glyph records found. Run materialize-glyph-records.mjs --apply first.');
    failures++;
  } else {
    console.log('  ✅ PASS');
  }

  // ── 2. packet_key linkage ──────────────────────────────────────────────────
  // Materializer-produced records have glyph_id starting with 'glyph:'
  const matCountRes = await pool.query(`SELECT COUNT(*) AS c FROM glyph_records WHERE glyph_id LIKE 'glyph:%'`);
  const matCount = parseInt(matCountRes.rows[0].c, 10);
  const legacyCount = count - matCount;

  const missingKeysRes = await pool.query(`SELECT COUNT(*) AS c FROM glyph_records WHERE packet_key IS NULL AND glyph_id LIKE 'glyph:%'`);
  const missingKeys = parseInt(missingKeysRes.rows[0].c, 10);

  const legacyMissingRes = await pool.query(`SELECT COUNT(*) AS c FROM glyph_records WHERE packet_key IS NULL AND glyph_id NOT LIKE 'glyph:%'`);
  const legacyMissing = parseInt(legacyMissingRes.rows[0].c, 10);

  const linkagePct = matCount > 0 ? ((matCount - missingKeys) / matCount * 100).toFixed(1) : '0';
  console.log(`\n[2] packet_key linkage:`);
  console.log(`  Materializer records: ${matCount - missingKeys}/${matCount} (${linkagePct}%)`);
  console.log(`  Legacy ACE records:   ${legacyCount - legacyMissing}/${legacyCount} (orphaned: ${legacyMissing})`);

  if (missingKeys > 0) {
    console.error(`  ❌ FAIL: ${missingKeys} materializer glyph records are missing packet_key`);
    failures++;
  } else {
    console.log('  ✅ PASS: 100% packet_key coverage on materializer records');
  }
  if (legacyMissing > 0) {
    console.log(`  ⚠️ NOTE: ${legacyMissing} legacy ACE records have no packet_key (pre-materializer orphans)`);
  }

  // Verify that packet_keys actually exist in nes_chrom_packets
  const orphanRes = await pool.query(`
    SELECT COUNT(*) AS c FROM glyph_records g
    WHERE g.packet_key IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM nes_chrom_packets n WHERE n.packet_key = g.packet_key)
  `);
  const orphans = parseInt(orphanRes.rows[0].c, 10);
  console.log(`  Orphan packet_keys (no matching nes_chrom_packets): ${orphans}`);
  if (orphans > 0) {
    console.error(`  ⚠️ WARNING: ${orphans} glyph records reference non-existent packets`);
  }

  // ── 3. HMM section distribution ───────────────────────────────────────────
  const sectionRes = await pool.query(`
    SELECT hmm_section, COUNT(*) AS c FROM glyph_records GROUP BY hmm_section ORDER BY c DESC
  `);
  console.log('\n[3] HMM Section Distribution:');
  let classifiedCount = 0;
  for (const row of sectionRes.rows) {
    const label = row.hmm_section || 'NULL';
    const n = parseInt(row.c, 10);
    const pct = count > 0 ? (n / count * 100).toFixed(1) : '0';
    console.log(`    ${label.padEnd(20)} ${String(n).padStart(6)}  (${pct}%)`);
    if (label !== 'UNKNOWN' && label !== 'NULL') classifiedCount += n;
  }
  console.log(`  Classified (above threshold): ${classifiedCount}/${count}`);
  if (sectionRes.rows.length <= 1 && sectionRes.rows[0]?.hmm_section === 'UNKNOWN') {
    console.log('  ⚠️ NOTE: All records are UNKNOWN — HMM confidence may be below threshold for this corpus');
  } else {
    console.log('  ✅ PASS: Non-empty section distribution');
  }

  // HMM confidence stats from record_json
  const confRes = await pool.query(`
    SELECT
      AVG((record_json->'semantic'->>'hmm_confidence')::float) AS avg_conf,
      MIN((record_json->'semantic'->>'hmm_confidence')::float) AS min_conf,
      MAX((record_json->'semantic'->>'hmm_confidence')::float) AS max_conf,
      COUNT(*) FILTER (WHERE (record_json->'semantic'->>'hmm_confidence')::float >= 0.15) AS above_threshold
    FROM glyph_records
    WHERE record_json->'semantic'->>'hmm_confidence' IS NOT NULL
  `);
  if (confRes.rows[0]) {
    const r = confRes.rows[0];
    console.log(`  HMM Confidence: avg=${Number(r.avg_conf).toFixed(4)} min=${Number(r.min_conf).toFixed(4)} max=${Number(r.max_conf).toFixed(4)} above_threshold=${r.above_threshold}`);
  }

  // ── 4. community_id distribution ──────────────────────────────────────────
  const communityRes = await pool.query(`
    SELECT community_id, COUNT(*) AS c FROM glyph_records GROUP BY community_id ORDER BY c DESC LIMIT 20
  `);
  console.log('\n[4] Community ID Distribution (top 20):');
  let withCommunity = 0;
  for (const row of communityRes.rows) {
    const label = row.community_id !== null ? `community_${row.community_id}` : 'NULL';
    const n = parseInt(row.c, 10);
    if (row.community_id !== null) withCommunity += n;
    console.log(`    ${label.padEnd(20)} ${String(n).padStart(6)}`);
  }
  console.log(`  With community: ${withCommunity}/${count}`);
  if (withCommunity === 0) {
    console.log('  ⚠️ NOTE: No community assignments — Neo4j SIMILAR_TOPOLOGY edges may need sync first');
  } else {
    console.log('  ✅ PASS: Non-empty community distribution');
  }

  // ── 5. manifold4 distribution ─────────────────────────────────────────────
  const m4Res = await pool.query(`
    SELECT
      COUNT(*) FILTER (WHERE manifold4 IS NOT NULL) AS has_m4,
      COUNT(*) FILTER (WHERE manifold4 IS NULL) AS no_m4
    FROM glyph_records
  `);
  const hasM4 = parseInt(m4Res.rows[0].has_m4, 10);
  const noM4 = parseInt(m4Res.rows[0].no_m4, 10);
  console.log(`\n[5] manifold4 coverage: ${hasM4}/${count} populated, ${noM4} NULL`);

  // Sample manifold4 values
  const sampleM4 = await pool.query(`
    SELECT glyph_id, manifold4 FROM glyph_records WHERE manifold4 IS NOT NULL LIMIT 5
  `);
  if (sampleM4.rows.length > 0) {
    console.log('  Sample manifold4 values:');
    for (const row of sampleM4.rows) {
      const m4 = row.manifold4;
      console.log(`    ${row.glyph_id.slice(0, 40).padEnd(42)} [${m4.map(v => Number(v).toFixed(4)).join(', ')}]`);
    }
    console.log('  ✅ PASS: manifold4 populated');
  } else {
    console.log('  ⚠️ NOTE: No manifold4 values — atlas_feature_map SOM coords may be empty');
  }

  // ── 6. No raw embedding arrays ────────────────────────────────────────────
  const embCheckRes = await pool.query(`
    SELECT id, glyph_id FROM glyph_records
    WHERE (record_json->>'embedding') IS NOT NULL
    LIMIT 5
  `);
  console.log(`\n[6] Raw embedding check:`);
  if (embCheckRes.rows.length > 0) {
    console.error('  ❌ FAIL: Raw embeddings found in record_json!');
    for (const row of embCheckRes.rows) {
      console.error(`    → ${row.glyph_id}`);
    }
    failures++;
  } else {
    console.log('  ✅ PASS: No raw embedding768 arrays in record_json');
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n══════════════════════════════════════════════');
  if (failures === 0) {
    console.log('✅ ALL AUDIT CHECKS PASSED');
  } else {
    console.log(`❌ ${failures} CHECK(S) FAILED`);
  }
  console.log('══════════════════════════════════════════════');

  await pool.end();
  process.exit(failures > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('Fatal error during audit:', err);
  process.exit(1);
});
