#!/usr/bin/env node
/**
 * Phase 10: Backfill packet_type for priority packets (code, test)
 *
 * Strategy: Use feature_id patterns, source_ref file extensions, and directory_path hints
 * Coverage Target: >95% of priority packets (code, test)
 * Priority Subset: Only 'code' and 'test' packets (doc/prompt/tool deferred to Phase 10b)
 */

import { Command } from 'commander';
import pg from 'pg';

const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db'
});

const program = new Command();

program
  .option('--dry-run', 'Show what would be changed without applying')
  .option('--apply', 'Apply changes to the database')
  .option('--priority <types>', 'Comma-separated packet types to backfill', 'code,test')
  .option('--limit <n>', 'Limit number of packets to process', '1000')
  .option('--verbose', 'Show detailed progress');

program.parse(process.argv);
const options = program.opts();

const PRIORITY_TYPES = options.priority.split(',').map(t => t.trim());
const LIMIT = parseInt(options.limit, 10);
const DRY_RUN = options.dryRun;
const VERBOSE = options.verbose;

/**
 * Classify packet_type based on source_ref file extension and directory_path
 */
function classifyPacketType(sourceRef, directoryPath) {
  // Extract file extension
  const ext = sourceRef?.split('.')?.pop()?.toLowerCase();

  // Test files
  if (sourceRef?.includes('.test.') || sourceRef?.includes('.spec.') || ext === 'test' || ext === 'spec') {
    return 'test';
  }

  // Documentation
  if (ext === 'md' || sourceRef?.includes('README') || directoryPath?.includes('docs/')) {
    return 'doc';
  }

  // API endpoints
  if (sourceRef?.includes('/api/') || directoryPath?.includes('/routes/api/')) {
    return 'api';
  }

  // Schema files
  if (sourceRef?.includes('schema') || ext === 'schema' || directoryPath?.includes('/schema/')) {
    return 'schema';
  }

  // Source code (default for most files)
  if (['.ts', '.tsx', '.js', '.jsx', '.go', '.rs', '.py'].includes(`.${ext}`)) {
    return 'code';
  }

  // Default
  return 'code';
}

async function backfillPacketType() {
  console.log('🔄 Phase 10: Backfill packet_type for priority packets');
  console.log(`Priority types: ${PRIORITY_TYPES.join(', ')}`);
  console.log(`Limit: ${LIMIT} packets`);
  console.log(DRY_RUN ? '(DRY RUN - no changes will be applied)' : '(APPLY mode)');
  console.log('');

  try {
    // Find packets missing packet_type
    const result = await pool.query(`
      SELECT
        packet_key,
        source_ref,
        directory_path,
        packet_type,
        COUNT(*) OVER() as total_count
      FROM atlas_packets
      WHERE packet_type IS NULL OR packet_type = 'code'
      LIMIT $1;
    `, [LIMIT]);

    const packets = result.rows;
    console.log(`📊 Found ${packets.length} packets to backfill (total available: ${packets[0]?.total_count || 0})`);
    console.log('');

    // Classify packets
    const classified = packets.map(p => ({
      packet_key: p.packet_key,
      source_ref: p.source_ref,
      directory_path: p.directory_path,
      current_type: p.packet_type,
      new_type: classifyPacketType(p.source_ref, p.directory_path)
    }));

    // Group by classification
    const byType = {};
    classified.forEach(p => {
      if (!byType[p.new_type]) byType[p.new_type] = 0;
      byType[p.new_type]++;
    });

    console.log('📈 Classification Summary:');
    Object.entries(byType).forEach(([type, count]) => {
      console.log(`   • ${type}: ${count} packets`);
    });
    console.log('');

    if (DRY_RUN) {
      console.log('✨ Dry run complete. Use --apply to persist changes.');
      console.log('');

      // Show sample classifications
      if (VERBOSE && classified.length > 0) {
        console.log('Sample Classifications:');
        classified.slice(0, 5).forEach(p => {
          console.log(`   ${p.source_ref.padEnd(60)} → ${p.new_type}`);
        });
      }
      process.exit(0);
    }

    // Apply updates
    console.log('⏳ Applying packet_type updates...');

    let successCount = 0;
    for (const packet of classified) {
      const updateResult = await pool.query(`
        UPDATE atlas_packets
        SET packet_type = $1, updated_at = NOW()
        WHERE packet_key = $2;
      `, [packet.new_type, packet.packet_key]);

      if (updateResult.rowCount > 0) {
        successCount++;
      }

      if (VERBOSE && successCount % 100 === 0) {
        console.log(`   Updated ${successCount}/${classified.length}...`);
      }
    }

    console.log(`✅ Updated ${successCount} packets`);
    console.log('');

    // Verify
    const verifyResult = await pool.query(`
      SELECT
        packet_type,
        COUNT(*) as count,
        COUNT(CASE WHEN packet_type IS NOT NULL THEN 1 END) as populated
      FROM atlas_packets
      GROUP BY packet_type
      ORDER BY count DESC;
    `);

    console.log('📊 Packet Type Distribution (after backfill):');
    verifyResult.rows.forEach(row => {
      console.log(`   • ${(row.packet_type || 'NULL').padEnd(10)}: ${row.count}`);
    });
    console.log('');

    console.log('✨ Phase 10 packet_type backfill complete!');
    process.exit(0);

  } catch (error) {
    console.error('❌ Error during backfill:', error);
    process.exit(1);
  }
}

backfillPacketType();
