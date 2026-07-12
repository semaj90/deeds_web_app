#!/usr/bin/env node

/**
 * Stage 0: Canonical Identity Verification
 *
 * Purpose: Verify that the canonical identity layer is 100% locked before
 * any downstream processing (Stages 1-7) begins.
 *
 * Canonical Identity Requirements:
 *   - packet_key: globally unique identifier (must be non-null)
 *   - source_ref: file path or source location (must be non-null)
 *   - content_hash: SHA-256 of content (must be non-null)
 *   - tree_node_id: AST root node identifier (must be non-null if code)
 *
 * Exit Codes:
 *   0: Identity 100% verified, all 4 fields non-null on all packets
 *   1: Identity incomplete, some packets missing required fields
 *   2: Database connection failed
 *   3: Configuration error
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load .env from sveltekit-frontend root
dotenv.config({ path: path.join(__dirname, '../../sveltekit-frontend/.env.local') });
dotenv.config({ path: path.join(__dirname, '../../sveltekit-frontend/.env') });

const { Pool } = pg;

/**
 * Main verification function
 */
async function verifyIdentity() {
  // Hardcode connection params for reliability
  const dbHost = '127.0.0.1';
  const dbPort = 5434;
  const dbUser = 'legal_admin';
  const dbPassword = '123456';
  const dbName = 'legal_ai_db';

  const pool = new Pool({
    host: dbHost,
    port: dbPort,
    user: dbUser,
    password: dbPassword,
    database: dbName,
  });

  try {
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log('║           Stage 0: Canonical Identity Verification          ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    // Test connection
    console.log('🔗 Connecting to Postgres...');
    const testConn = await pool.query('SELECT 1');
    console.log('✓ Connected\n');

    // Check if atlas_packets exists
    const tableCheck = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'atlas_packets'
      )
    `);

    if (!tableCheck.rows[0].exists) {
      console.error('❌ ERROR: atlas_packets table not found');
      process.exit(2);
    }

    // Check schema: required identity columns
    console.log('🔍 Checking identity schema...');
    const schemaCheck = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'atlas_packets'
      AND column_name IN ('packet_key', 'source_ref', 'sha256', 'packet_id')
      ORDER BY column_name
    `);

    const requiredColumns = ['packet_key', 'sha256', 'source_ref', 'packet_id'];
    const foundColumns = schemaCheck.rows.map(r => r.column_name);
    const missingColumns = requiredColumns.filter(col => !foundColumns.includes(col));

    if (missingColumns.length > 0) {
      console.error(`❌ ERROR: Missing columns: ${missingColumns.join(', ')}`);
      process.exit(3);
    }
    console.log(`✓ Schema valid: ${foundColumns.join(', ')}\n`);

    // Query identity completeness
    console.log('📊 Analyzing identity layer...\n');

    const identityQuery = await pool.query(`
      SELECT
        COUNT(*) as total_packets,
        COUNT(CASE WHEN packet_key IS NOT NULL AND LENGTH(TRIM(packet_key)) > 0 THEN 1 END) as with_packet_key,
        COUNT(CASE WHEN source_ref IS NOT NULL AND LENGTH(TRIM(source_ref)) > 0 THEN 1 END) as with_source_ref,
        COUNT(CASE WHEN sha256 IS NOT NULL AND LENGTH(TRIM(sha256)) > 0 THEN 1 END) as with_content_hash,
        COUNT(CASE WHEN packet_key IS NOT NULL AND source_ref IS NOT NULL AND sha256 IS NOT NULL THEN 1 END) as fully_identified,
        COUNT(CASE WHEN packet_key IS NULL OR source_ref IS NULL OR sha256 IS NULL THEN 1 END) as incomplete
      FROM atlas_packets
    `);

    const stats = identityQuery.rows[0];

    console.log(`  Total packets:           ${stats.total_packets}`);
    console.log(`  With packet_key:         ${stats.with_packet_key} (${((stats.with_packet_key / stats.total_packets) * 100).toFixed(1)}%)`);
    console.log(`  With source_ref:         ${stats.with_source_ref} (${((stats.with_source_ref / stats.total_packets) * 100).toFixed(1)}%)`);
    console.log(`  With content_hash:       ${stats.with_content_hash} (${((stats.with_content_hash / stats.total_packets) * 100).toFixed(1)}%)`);
    console.log(`  Fully identified (3/3):  ${stats.fully_identified} (${((stats.fully_identified / stats.total_packets) * 100).toFixed(1)}%)`);
    console.log(`  Incomplete:              ${stats.incomplete}\n`);

    // Check for duplicates in packet_key
    console.log('🔍 Checking for duplicate packet_keys...');
    const dupCheck = await pool.query(`
      SELECT packet_key, COUNT(*) as cnt
      FROM atlas_packets
      WHERE packet_key IS NOT NULL
      GROUP BY packet_key
      HAVING COUNT(*) > 1
      LIMIT 10
    `);

    if (dupCheck.rows.length > 0) {
      console.error(`❌ ERROR: Found ${dupCheck.rows.length} duplicate packet_keys`);
      console.error('  Examples:');
      dupCheck.rows.forEach(row => {
        console.error(`    ${row.packet_key}: ${row.cnt} copies`);
      });
      console.log('');
      process.exit(1);
    }
    console.log('✓ No duplicates\n');

    // Check for duplicate source_ref + hash combinations
    console.log('🔍 Checking for duplicate (source_ref, content_hash) pairs...');
    const dupPairCheck = await pool.query(`
      SELECT source_ref, sha256, COUNT(*) as cnt
      FROM atlas_packets
      WHERE source_ref IS NOT NULL AND sha256 IS NOT NULL
      GROUP BY source_ref, sha256
      HAVING COUNT(*) > 1
      LIMIT 10
    `);

    if (dupPairCheck.rows.length > 0) {
      console.error(`❌ ERROR: Found ${dupPairCheck.rows.length} duplicate (source_ref, hash) pairs`);
      console.error('  Examples:');
      dupPairCheck.rows.forEach(row => {
        console.error(`    ${row.source_ref} / ${row.sha256.slice(0, 12)}: ${row.cnt} copies`);
      });
      console.log('');
      process.exit(1);
    }
    console.log('✓ No duplicate pairs\n');

    // Sample incomplete packets for inspection
    if (stats.incomplete > 0) {
      console.log('⚠️  Sampling incomplete packets...\n');
      const incompleteSample = await pool.query(`
        SELECT
          packet_key,
          source_ref,
          sha256,
          packet_id,
          (packet_key IS NULL) as missing_key,
          (source_ref IS NULL) as missing_ref,
          (sha256 IS NULL) as missing_hash
        FROM atlas_packets
        WHERE packet_key IS NULL OR source_ref IS NULL OR sha256 IS NULL
        LIMIT 5
      `);

      incompleteSample.rows.forEach((row, idx) => {
        console.log(`  [${idx + 1}] packet_id: ${row.packet_id}`);
        if (row.missing_key) console.log(`      ❌ packet_key is NULL`);
        if (row.missing_ref) console.log(`      ❌ source_ref is NULL`);
        if (row.missing_hash) console.log(`      ❌ sha256 (content_hash) is NULL`);
      });
      console.log('');
    }

    // Detailed identity gates
    console.log('═══════════════════════════════════════════════════════════\n');
    console.log('🎯 STAGE 0 GATES:\n');

    const gate1 = stats.fully_identified === stats.total_packets;
    const gate2 = dupCheck.rows.length === 0;
    const gate3 = dupPairCheck.rows.length === 0;

    console.log(`  [${gate1 ? '✅' : '❌'}] Gate 1: All packets have (packet_key, source_ref, content_hash)`);
    console.log(`  [${gate2 ? '✅' : '❌'}] Gate 2: No duplicate packet_keys`);
    console.log(`  [${gate3 ? '✅' : '❌'}] Gate 3: No duplicate (source_ref, hash) pairs`);

    console.log('\n═══════════════════════════════════════════════════════════\n');

    // Final verdict
    const allGatesPassed = gate1 && gate2 && gate3;

    if (allGatesPassed) {
      console.log('✅ STAGE 0 VERIFICATION PASSED\n');
      console.log('Identity layer is 100% locked. Stages 1-7 can proceed.\n');
      process.exit(0);
    } else {
      console.log('❌ STAGE 0 VERIFICATION FAILED\n');
      console.log('Identity layer is incomplete. Fix the gates above before proceeding.\n');
      console.log('Remediation options:');
      if (!gate1) {
        console.log('  - Gate 1: Run identity backfill script to populate missing fields');
        console.log('    npm run graphify:stage0:backfill');
      }
      if (!gate2) {
        console.log('  - Gate 2: Deduplicate packet_keys (audit which copy is canonical)');
      }
      if (!gate3) {
        console.log('  - Gate 3: Deduplicate (source_ref, hash) pairs (merge or delete)');
      }
      console.log('');
      process.exit(1);
    }
  } catch (err) {
    console.error('❌ FATAL ERROR:', err.message);
    process.exit(2);
  } finally {
    await pool.end();
  }
}

// Run
verifyIdentity();
