#!/usr/bin/env node
/**
 * verify-atlas-packets.mjs
 *
 * Phase 3I gate validation. Reports all coverage metrics for atlas_packets
 * and emits a machine-readable JSON result.
 *
 * Gate: source_ref_coverage ≥ 90% AND feature_id_coverage ≥ 50%
 *       before Phase 4A RRF ranking can start.
 *
 * Usage:
 *   node scripts/atlas/verify-atlas-packets.mjs
 *   node scripts/atlas/verify-atlas-packets.mjs --json
 *   node scripts/atlas/verify-atlas-packets.mjs --strict
 */

import pg from 'pg';
import { normalizeSourceRef } from '../lib/canonical-source-ref.mjs';

const { Pool } = pg;

const DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

const JSON_MODE = process.argv.includes('--json');
const STRICT_MODE = process.argv.includes('--strict');

const GATE_TOTAL_PACKETS = 2000;
const GATE_SOURCE_REF_KEY = 95;
const GATE_FEATURE_ID = 80;
const GATE_CONCEPT_IDS = 50;
const GATE_PACKET_KEY = 100;

async function main() {
  const pool = new Pool({ connectionString: DATABASE_URL });

  try {
    // 1. Check table exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'atlas_packets'
      ) AS exists
    `);
    if (!tableCheck.rows[0].exists) {
      fatal('atlas_packets table does not exist — run Phase 3I migration first');
    }

    // 2. Check which optional columns exist
    const colRes = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'atlas_packets'
    `);
    const cols = new Set(colRes.rows.map((r) => r.column_name));

    const hasPacketKey = cols.has('packet_key');
    const hasSourceKind = cols.has('source_kind');
    const hasRewardPrior = cols.has('reward_prior');
    const hasSourcePath = cols.has('source_path');
    const hasSourceRefKey = cols.has('source_ref_key');

    // 3. Core metrics
    const coreRes = await pool.query(`
      SELECT
        COUNT(*)::int                                              AS total_packets,
        COUNT(*) FILTER (WHERE source_ref IS NOT NULL
          AND source_ref <> '')::int                              AS source_ref_count,
        COUNT(*) FILTER (WHERE source_ref_key IS NOT NULL
          AND source_ref_key <> '')::int                          AS source_ref_key_count,
        COUNT(*) FILTER (WHERE feature_id IS NOT NULL
          AND feature_id <> '')::int                             AS feature_id_count,
        COUNT(*) FILTER (WHERE summary IS NOT NULL
          AND summary <> '')::int                                AS summary_count,
        COUNT(*) FILTER (WHERE embedding IS NOT NULL)::int       AS embedding_count,
        COUNT(*) FILTER (WHERE payload IS NOT NULL
          AND payload <> '{}'::jsonb)::int                       AS payload_count,
        COUNT(*) FILTER (WHERE concept_ids IS NOT NULL
          AND array_length(concept_ids, 1) > 0)::int             AS concept_id_count,
        COUNT(*) FILTER (WHERE sha256 IS NOT NULL
          AND sha256 <> '')::int                                  AS sha256_count,
        COUNT(*) FILTER (WHERE community_id IS NOT NULL)::int    AS community_id_count
      FROM atlas_packets
    `);
    const core = coreRes.rows[0];
    const total = core.total_packets;

    if (total === 0) {
      fatal('atlas_packets is empty');
    }

    // 4. Optional columns
    let packetKeyCount = 0;
    let sourceKindCount = 0;
    let rewardPriorCount = 0;

    if (hasPacketKey) {
      const r = await pool.query(`SELECT COUNT(*)::int AS n FROM atlas_packets WHERE packet_key IS NOT NULL AND packet_key <> ''`);
      packetKeyCount = r.rows[0].n;
    }
    if (hasSourceKind) {
      const r = await pool.query(`SELECT COUNT(*)::int AS n FROM atlas_packets WHERE source_kind IS NOT NULL AND source_kind <> ''`);
      sourceKindCount = r.rows[0].n;
    }
    if (hasRewardPrior) {
      const r = await pool.query(`SELECT COUNT(*)::int AS n FROM atlas_packets WHERE reward_prior IS NULL`);
      rewardPriorCount = r.rows[0].n; // missing count
    }

    // 5. Duplicate detection
    const dupIdRes = await pool.query(`
      SELECT COUNT(*) - COUNT(DISTINCT packet_id) AS dup_ids FROM atlas_packets
    `);
    const dupShaRes = await pool.query(`
      SELECT COUNT(*) AS dup_sha256_groups FROM (
        SELECT sha256, COUNT(*) FROM atlas_packets
        WHERE sha256 IS NOT NULL AND sha256 <> ''
        GROUP BY sha256 HAVING COUNT(*) > 1
      ) s
    `);
    const dupKeyRes = await pool.query(`
      SELECT COUNT(*) - COUNT(DISTINCT packet_key) AS dup_keys FROM atlas_packets WHERE packet_key IS NOT NULL AND packet_key <> ''
    `);
    const duplicatePacketKeys = parseInt(dupKeyRes.rows[0].dup_keys, 10);

    // 6. Source ref quality: detect artifact paths vs real code paths
    const artifactPathRes = await pool.query(`
      SELECT COUNT(*)::int AS n FROM atlas_packets
      WHERE source_ref LIKE '.tmp/%'
         OR source_ref LIKE 'tmp/%'
         OR source_ref LIKE '%parent_atlas_packets%'
    `);
    const artifactPaths = artifactPathRes.rows[0].n;

    const realCodePaths = core.source_ref_count - artifactPaths;
    const realCodePct = total > 0 ? Math.round((realCodePaths / total) * 100) : 0;

    // 7. Compute percentages
    const pct = (n) => (total > 0 ? Math.round((n / total) * 100) : 0);

    const metrics = {
      total_packets: total,
      columns_present: {
        packet_key: hasPacketKey,
        source_kind: hasSourceKind,
        reward_prior: hasRewardPrior,
        source_path: hasSourcePath,
        source_ref_key: hasSourceRefKey,
      },
      coverage: {
        packet_key: hasPacketKey ? { count: packetKeyCount, pct: pct(packetKeyCount), gate: GATE_PACKET_KEY } : null,
        source_ref: { count: core.source_ref_count, pct: pct(core.source_ref_count) },
        source_ref_key: hasSourceRefKey ? { count: core.source_ref_key_count, pct: pct(core.source_ref_key_count), gate: GATE_SOURCE_REF_KEY } : null,
        source_ref_real_code: { count: realCodePaths, pct: realCodePct, note: 'Non-artifact code paths' },
        feature_id: { count: core.feature_id_count, pct: pct(core.feature_id_count), gate: GATE_FEATURE_ID },
        summary: { count: core.summary_count, pct: pct(core.summary_count) },
        embedding: { count: core.embedding_count, pct: pct(core.embedding_count) },
        payload: { count: core.payload_count, pct: pct(core.payload_count) },
        concept_ids: { count: core.concept_id_count, pct: pct(core.concept_id_count), gate: GATE_CONCEPT_IDS },
        community_id: { count: core.community_id_count, pct: pct(core.community_id_count) },
        source_kind: hasSourceKind ? { count: sourceKindCount, pct: pct(sourceKindCount) } : null,
      },
      duplicates: {
        duplicate_packet_ids: parseInt(dupIdRes.rows[0].dup_ids, 10),
        duplicate_sha256_groups: parseInt(dupShaRes.rows[0].dup_sha256_groups, 10),
        duplicate_packet_keys: duplicatePacketKeys,
      },
      missing_reward_prior: hasRewardPrior ? rewardPriorCount : null,
      artifact_source_refs: artifactPaths,
    };

    // 8. Gate evaluation
    const totalPacketsPasses = total >= GATE_TOTAL_PACKETS;
    const sourceRefKeyPasses = pct(core.source_ref_key_count) >= GATE_SOURCE_REF_KEY;
    const featureIdGatePasses = pct(core.feature_id_count) >= GATE_FEATURE_ID;
    const conceptIdsGatePasses = pct(core.concept_id_count) >= GATE_CONCEPT_IDS;
    const packetKeyGatePasses = hasPacketKey && pct(packetKeyCount) >= GATE_PACKET_KEY;
    const duplicatePacketKeysPasses = duplicatePacketKeys === 0;

    const phase4a_ready = totalPacketsPasses && sourceRefKeyPasses && featureIdGatePasses && conceptIdsGatePasses && packetKeyGatePasses && duplicatePacketKeysPasses;

    const gateDetails = {
      total_packets_gate: { required: `>= ${GATE_TOTAL_PACKETS}`, actual: `${total}`, pass: totalPacketsPasses },
      source_ref_key_gate: { required: `${GATE_SOURCE_REF_KEY}%`, actual: `${pct(core.source_ref_key_count)}%`, pass: sourceRefKeyPasses },
      feature_id_gate: { required: `${GATE_FEATURE_ID}%`, actual: `${pct(core.feature_id_count)}%`, pass: featureIdGatePasses },
      concept_ids_gate: { required: `${GATE_CONCEPT_IDS}%`, actual: `${pct(core.concept_id_count)}%`, pass: conceptIdsGatePasses },
      packet_key_gate: { required: `${GATE_PACKET_KEY}%`, actual: `${pct(packetKeyCount)}%`, pass: packetKeyGatePasses },
      duplicate_packet_keys: { required: `0`, actual: `${duplicatePacketKeys}`, pass: duplicatePacketKeysPasses }
    };

    const blockers = [];
    if (!totalPacketsPasses) blockers.push(`total packets count ${total} < ${GATE_TOTAL_PACKETS}`);
    if (!sourceRefKeyPasses) blockers.push(`source_ref_key coverage ${pct(core.source_ref_key_count)}% < ${GATE_SOURCE_REF_KEY}%`);
    if (!featureIdGatePasses) blockers.push(`feature_id coverage ${pct(core.feature_id_count)}% < ${GATE_FEATURE_ID}%`);
    if (!conceptIdsGatePasses) blockers.push(`concept_ids coverage ${pct(core.concept_id_count)}% < ${GATE_CONCEPT_IDS}%`);
    if (!packetKeyGatePasses) blockers.push(`packet_key coverage ${pct(packetKeyCount)}% < ${GATE_PACKET_KEY}%`);
    if (!duplicatePacketKeysPasses) blockers.push(`duplicate packet_keys count is ${duplicatePacketKeys}`);

    const next_action = phase4a_ready && blockers.length === 0
      ? 'Phase 3I / 4A gate PASSED — Phase 4A RRF ranking can start'
      : `Fix blockers: ${blockers.join('; ')}`;

    const result = {
      ...metrics,
      gates: gateDetails,
      phase4a_ready,
      blockers,
      next_action,
    };

    if (JSON_MODE) {
      console.log(JSON.stringify(result, null, 2));
      process.exit(phase4a_ready && !STRICT_MODE ? 0 : blockers.length > 0 ? 1 : 0);
      return;
    }

    // Human-readable output
    const ok = (b) => (b ? '✅' : '❌');
    const warn = (b) => (b ? '⚠️ ' : '✅');

    console.log('\n╔══════════════════════════════════════════════════════════╗');
    console.log('║         Phase 3I/4A Atlas Packets Verification Gate     ║');
    console.log('╚══════════════════════════════════════════════════════════╝\n');

    console.log(`  Total packets:   ${total}`);
    console.log(`  Duplicate IDs:   ${metrics.duplicates.duplicate_packet_ids}`);
    console.log(`  Duplicate Keys:  ${metrics.duplicates.duplicate_packet_keys}`);
    console.log(`  Duplicate SHA256 groups: ${metrics.duplicates.duplicate_sha256_groups}`);
    console.log('');
    console.log('  Coverage:');
    console.log(`    source_ref (any):      ${core.source_ref_count}/${total} (${pct(core.source_ref_count)}%)`);
    if (hasSourceRefKey) console.log(`    source_ref_key:       ${core.source_ref_key_count}/${total} (${pct(core.source_ref_key_count)}%)`);
    console.log(`    source_ref (real code): ${realCodePaths}/${total} (${realCodePct}%)`);
    console.log(`    artifact source_refs:  ${artifactPaths} ${warn(artifactPaths > 0)}`);
    if (hasPacketKey) console.log(`    packet_key:           ${packetKeyCount}/${total} (${pct(packetKeyCount)}%)`);
    else               console.log(`    packet_key:           COLUMN MISSING ❌`);
    console.log(`    feature_id:           ${core.feature_id_count}/${total} (${pct(core.feature_id_count)}%)`);
    console.log(`    summary:              ${core.summary_count}/${total} (${pct(core.summary_count)}%)`);
    console.log(`    embedding:            ${core.embedding_count}/${total} (${pct(core.embedding_count)}%)`);
    console.log(`    concept_ids:          ${core.concept_id_count}/${total} (${pct(core.concept_id_count)}%)`);
    console.log(`    community_id:         ${core.community_id_count}/${total} (${pct(core.community_id_count)}%)`);
    if (hasSourceKind) console.log(`    source_kind:          ${sourceKindCount}/${total} (${pct(sourceKindCount)}%)`);
    else               console.log(`    source_kind:          COLUMN MISSING ❌`);
    if (hasRewardPrior) console.log(`    missing_reward_prior: ${rewardPriorCount}`);

    console.log('');
    console.log('  Gates:');
    for (const [k, v] of Object.entries(gateDetails)) {
      if (v.note) {
        console.log(`    ${k}: ${v.note} ❌`);
      } else {
        console.log(`    ${k}: ${v.actual} (required ${v.required}) ${ok(v.pass)}`);
      }
    }

    console.log('');
    if (phase4a_ready && blockers.length === 0) {
      console.log('  ✅ Phase 3I/4A gate PASSED — Phase 4A RRF ranking can start\n');
    } else {
      console.log('  ❌ Phase 3I/4A gate NOT PASSED');
      console.log('');
      console.log('  Blockers:');
      for (const b of blockers) {
        console.log(`    • ${b}`);
      }
      console.log('');
    }

    if (STRICT_MODE && !phase4a_ready) {
      process.exit(1);
    }
  } finally {
    await pool.end();
  }
}

function fatal(msg) {
  console.error(`\n❌ FATAL: ${msg}\n`);
  process.exit(1);
}

main().catch((err) => {
  console.error('❌ verify-atlas-packets failed:', err.message);
  process.exit(1);
});
