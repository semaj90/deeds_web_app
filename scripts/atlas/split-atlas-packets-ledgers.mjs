#!/usr/bin/env node
/**
 * Split atlas_packets into two canonical ledgers:
 * 1. atlas_codebase_packets (code files only) — aligns with Qdrant + Redis
 * 2. atlas_feature_packets (features/deps/concepts) — separate lineage
 *
 * Purpose: Fix 0% Qdrant/Postgres agreement by separating code from abstractions
 */

import pg from 'pg';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '../..');

config({ path: resolve(ROOT, '.env') });

const dryRun = process.argv.includes('--dry-run');

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db'
});

const REPORTS_DIR = resolve(ROOT, 'docs/reports');

function categorizeSourceRef(sourceRef) {
  if (!sourceRef) return 'unknown';
  if (sourceRef.startsWith('feature:')) return 'feature';
  if (sourceRef.startsWith('task:')) return 'task';
  if (sourceRef.includes('.cache')) return 'cache';
  if (sourceRef.startsWith('src/') || sourceRef.includes('sveltekit-frontend/src/')) return 'codebase';
  // Anything else: dependency, package name, etc.
  return 'other';
}

async function splitLedgers() {
  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Split atlas_packets into Codebase + Feature Ledgers           ║');
  console.log(`║  Mode: ${dryRun ? 'DRY-RUN' : 'APPLY'}${' '.repeat(dryRun ? 43 : 44)} ║`);
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  const results = {
    timestamp: new Date().toISOString(),
    mode: dryRun ? 'DRY_RUN' : 'APPLY',
    total_packets: 0,
    codebase_packets: 0,
    feature_packets: 0,
    distribution: {}
  };

  try {
    // Step 1: Fetch all packets from legacy table
    console.log('Step 1: Fetching all packets from atlas_packets_legacy...');
    const legacyRes = await pool.query('SELECT * FROM atlas_packets_legacy');
    const packets = legacyRes.rows;
    results.total_packets = packets.length;
    console.log(`✅ Fetched ${packets.length} packets\n`);

    // Step 2: Categorize
    console.log('Step 2: Categorizing by source_ref pattern...');
    const codebase = [];
    const features = [];
    const distribution = {};

    for (const pkt of packets) {
      const category = categorizeSourceRef(pkt.source_ref);
      distribution[category] = (distribution[category] || 0) + 1;

      if (category === 'codebase') {
        codebase.push(pkt);
      } else {
        features.push(pkt);
      }
    }

    results.distribution = distribution;
    results.codebase_packets = codebase.length;
    results.feature_packets = features.length;

    console.log('Distribution:');
    Object.entries(distribution).forEach(([cat, cnt]) => {
      console.log(`  ${cat}: ${cnt} packets (${((cnt/packets.length)*100).toFixed(1)}%)`);
    });
    console.log('');

    // Step 3: Insert into new ledgers
    if (!dryRun) {
      console.log('Step 3: Inserting into atlas_codebase_packets...');
      for (const pkt of codebase) {
        await pool.query(`
          INSERT INTO atlas_codebase_packets (
            packet_key, source_ref, file_path, feature_id, feature_label,
            community_id, community_source, community_confidence, metadata,
            lineage_version, ledger_type
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (packet_key) DO NOTHING
        `, [
          pkt.packet_key, pkt.source_ref, pkt.source_ref,
          pkt.feature_id, pkt.feature_label,
          pkt.community_id, pkt.community_source, pkt.community_confidence,
          pkt.metadata || {},
          'packet-identity-v2',
          'atlas:codebase'
        ]);
      }
      console.log(`✅ Inserted ${codebase.length} codebase packets\n`);

      console.log('Step 4: Inserting into atlas_feature_packets...');
      for (const pkt of features) {
        const pktType = categorizeSourceRef(pkt.source_ref);
        await pool.query(`
          INSERT INTO atlas_feature_packets (
            packet_key, source_ref, feature_id, feature_label, packet_type,
            community_id, community_source, community_confidence, metadata,
            lineage_version, ledger_type
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
          ON CONFLICT (packet_key) DO NOTHING
        `, [
          pkt.packet_key, pkt.source_ref,
          pkt.feature_id, pkt.feature_label, pktType,
          pkt.community_id, pkt.community_source, pkt.community_confidence,
          pkt.metadata || {},
          'packet-identity-v2',
          'atlas:feature'
        ]);
      }
      console.log(`✅ Inserted ${features.length} feature packets\n`);
    } else {
      console.log('Step 3: DRY-RUN: Would insert into atlas_codebase_packets');
      console.log(`        ${codebase.length} codebase packets\n`);
      console.log('Step 4: DRY-RUN: Would insert into atlas_feature_packets');
      console.log(`        ${features.length} feature packets\n`);
    }

    // Step 5: Write report
    console.log('Step 5: Writing report...');
    mkdirSync(REPORTS_DIR, { recursive: true });

    writeFileSync(
      resolve(REPORTS_DIR, 'split-atlas-packets-ledgers.json'),
      JSON.stringify(results, null, 2)
    );

    console.log(`✅ Report: docs/reports/split-atlas-packets-ledgers.json\n`);

    // Step 6: Summary
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║  SPLIT SUMMARY                                                 ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');
    console.log(`Total packets: ${results.total_packets}`);
    console.log(`→ Codebase packets: ${results.codebase_packets} (${((results.codebase_packets/results.total_packets)*100).toFixed(1)}%)`);
    console.log(`→ Feature packets: ${results.feature_packets} (${((results.feature_packets/results.total_packets)*100).toFixed(1)}%)`);
    console.log(`Status: ${dryRun ? 'DRY-RUN COMPLETE' : 'SPLIT COMPLETE'}\n`);

    if (!dryRun) {
      console.log('Next steps:');
      console.log('  1. Verify alignment: npm run atlas:debug:qdrant-codebase');
      console.log('  2. Verify feature ledger: npm run atlas:audit:feature-packets');
      console.log('  3. Update app queries to use atlas_codebase_packets\n');
    }

  } catch (err) {
    console.error('❌ Split failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

splitLedgers();
