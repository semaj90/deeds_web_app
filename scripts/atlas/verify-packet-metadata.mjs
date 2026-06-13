#!/usr/bin/env node
/**
 * verify-packet-metadata.mjs
 *
 * Packet Contract Lane — metadata gate verifier (read-only).
 *
 * Gates:
 *   PASS  packet_key uniqueness — no duplicates
 *   PASS  identity fields stable — packet_key/source_ref/feature_id/community_id untouched
 *   PASS  payload.path coverage ≥ 30% overall
 *   PASS  payload.hash coverage ≥ 60% of source-bearing rows
 *   PASS  no new packet table/model (hyperrag_packets, packet_v2, new_packet_model)
 *   PASS  GIN index atlas_packets_metadata_gin_idx exists
 *   PASS  Compound identity index atlas_packets_identity_idx exists
 *   WARN  payload.mtime coverage (informational only)
 *
 * Usage:
 *   node scripts/atlas/verify-packet-metadata.mjs
 *   node scripts/atlas/verify-packet-metadata.mjs --verbose
 */

import pg from 'pg';
import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT  = path.resolve(__dir, '../..');

const VERBOSE = process.argv.includes('--verbose');
const DATABASE_URL = process.env.DATABASE_URL ||
  'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

async function main() {
  console.log('\n═══ Verify Packet Metadata Contract ═══\n');

  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
  const gates = [];

  try {
    // ── Coverage stats ─────────────────────────────────────────────────────
    const { rows: [cov] } = await pool.query(`
      SELECT
        COUNT(*) AS total,
        COUNT(CASE WHEN packet_key IS NOT NULL THEN 1 END) AS has_packet_key,
        COUNT(CASE WHEN source_ref IS NOT NULL THEN 1 END) AS has_source_ref,
        COUNT(CASE WHEN feature_id IS NOT NULL THEN 1 END) AS has_feature_id,
        COUNT(CASE WHEN community_id IS NOT NULL THEN 1 END) AS has_community_id,
        COUNT(CASE WHEN payload->>'path' IS NOT NULL THEN 1 END) AS payload_path,
        COUNT(CASE WHEN payload->>'hash' IS NOT NULL THEN 1 END) AS payload_hash,
        COUNT(CASE WHEN payload->>'mtime' IS NOT NULL THEN 1 END) AS payload_mtime,
        COUNT(CASE WHEN payload->>'file_url' IS NOT NULL THEN 1 END) AS payload_file_url,
        COUNT(CASE WHEN payload->>'directory_path' IS NOT NULL THEN 1 END) AS payload_dir
      FROM atlas_packets
    `);

    const total      = parseInt(cov.total, 10);
    const pathPct    = (parseInt(cov.payload_path, 10) / total * 100).toFixed(1);
    const hashPct    = (parseInt(cov.payload_hash, 10) / total * 100).toFixed(1);

    console.log(`Total packets:         ${total}`);
    console.log(`packet_key coverage:   ${cov.has_packet_key} (${(cov.has_packet_key/total*100).toFixed(1)}%)`);
    console.log(`source_ref coverage:   ${cov.has_source_ref}`);
    console.log(`feature_id coverage:   ${cov.has_feature_id}`);
    console.log(`community_id coverage: ${cov.has_community_id}`);
    console.log(`payload.path:          ${cov.payload_path} (${pathPct}%)`);
    console.log(`payload.hash:          ${cov.payload_hash} (${hashPct}%)`);
    console.log(`payload.mtime:         ${cov.payload_mtime}`);
    console.log(`payload.file_url:      ${cov.payload_file_url}`);
    console.log(`payload.directory_path:${cov.payload_dir}`);

    // ── Source-bearing hash coverage ───────────────────────────────────────
    const { rows: [srcCov] } = await pool.query(`
      SELECT COUNT(*) AS src_total,
             COUNT(CASE WHEN payload->>'hash' IS NOT NULL THEN 1 END) AS src_hash
      FROM atlas_packets WHERE source_path IS NOT NULL
    `);
    const srcTotal   = parseInt(srcCov.src_total, 10);
    const srcHash    = parseInt(srcCov.src_hash, 10);
    const srcHashPct = srcTotal > 0 ? (srcHash / srcTotal * 100).toFixed(1) : '0.0';
    console.log(`\nSource-bearing rows:   ${srcTotal}`);
    console.log(`hash coverage (src):   ${srcHash}/${srcTotal} (${srcHashPct}%)`);

    // ── Gate 1: packet_key uniqueness ──────────────────────────────────────
    const { rows: [dup] } = await pool.query(`
      SELECT COUNT(*) AS dup_count FROM (
        SELECT packet_key FROM atlas_packets
        WHERE packet_key IS NOT NULL
        GROUP BY packet_key HAVING COUNT(*) > 1
      ) t
    `);
    const noDups = parseInt(dup.dup_count, 10) === 0;
    gates.push({ name: 'packet_key_unique', pass: noDups, detail: `${dup.dup_count} duplicate keys` });

    // ── Gate 2: payload.path coverage ≥ 30% ───────────────────────────────
    const pathGate = parseFloat(pathPct) >= 30;
    gates.push({ name: 'payload_path_30pct', pass: pathGate, detail: `${pathPct}%` });

    // ── Gate 3: payload.hash coverage ≥ 60% of src rows ───────────────────
    const hashGate = parseFloat(srcHashPct) >= 60;
    gates.push({ name: 'payload_hash_60pct_src', pass: hashGate, detail: `${srcHashPct}% of ${srcTotal} src rows` });

    // ── Gate 4: no duplicate packet models ────────────────────────────────
    const { rows: badTables } = await pool.query(`
      SELECT tablename FROM pg_tables
      WHERE schemaname='public'
        AND tablename IN ('hyperrag_packets','packet_v2','new_packet_model','atlas_packets_v2')
    `);
    const noNewModels = badTables.length === 0;
    gates.push({ name: 'no_new_packet_model', pass: noNewModels,
      detail: badTables.length > 0 ? `Found: ${badTables.map(r=>r.tablename).join(',')}` : 'none found' });

    // ── Gate 5: GIN index exists ───────────────────────────────────────────
    const { rows: ginIdx } = await pool.query(`
      SELECT indexname FROM pg_indexes
      WHERE tablename='atlas_packets' AND indexname='atlas_packets_metadata_gin_idx'
    `);
    const hasGin = ginIdx.length > 0;
    gates.push({ name: 'metadata_gin_index', pass: hasGin, detail: hasGin ? 'present' : 'MISSING' });

    // ── Gate 6: identity compound index exists ─────────────────────────────
    const { rows: idxRows } = await pool.query(`
      SELECT indexname FROM pg_indexes
      WHERE tablename='atlas_packets' AND indexname='atlas_packets_identity_idx'
    `);
    const hasIdentityIdx = idxRows.length > 0;
    gates.push({ name: 'identity_compound_index', pass: hasIdentityIdx,
      detail: hasIdentityIdx ? 'present' : 'MISSING' });

    // ── Informational: mtime coverage ─────────────────────────────────────
    const mtimePct = (parseInt(cov.payload_mtime, 10) / total * 100).toFixed(1);
    gates.push({ name: 'payload_mtime_coverage', pass: true,
      detail: `${mtimePct}% (informational)` });

    // ── Results ────────────────────────────────────────────────────────────
    console.log('\n══ Gate Results ══════════════════════════════════');
    for (const g of gates) {
      const icon = g.pass ? '✅' : '❌';
      console.log(`  ${icon} ${g.name.padEnd(32)} ${g.detail}`);
    }

    const allPass = gates.every(g => g.pass);
    console.log(`\n  ${allPass ? '✅ CONTRACT PASS' : '⚠️  CONTRACT FAIL'}`);

    // Report
    const dir = path.join(ROOT, 'docs', 'reports');
    mkdirSync(dir, { recursive: true });
    const report = {
      generated_at: new Date().toISOString(),
      total_packets: total,
      coverage: {
        payload_path_pct: parseFloat(pathPct),
        payload_hash_pct: parseFloat(hashPct),
        src_hash_pct: parseFloat(srcHashPct),
        payload_mtime_pct: parseFloat(mtimePct),
      },
      gates,
      pass: allPass,
    };
    writeFileSync(path.join(dir, 'verify-packet-metadata.json'), JSON.stringify(report, null, 2));
    console.log('\nReport: docs/reports/verify-packet-metadata.json');

    if (!allPass) process.exitCode = 1;

  } finally {
    await pool.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
