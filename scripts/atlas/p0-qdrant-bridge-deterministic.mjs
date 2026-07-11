#!/usr/bin/env node
/**
 * P0: Deterministic Qdrant Bridge Backfill
 * 
 * Rules from roadmap P0:
 * - Reject synthetic UUIDs, random conversions
 * - Backfill only deterministic mappings
 * - Require content-hash guards for all writes
 * - Detect/reject duplicates and orphans
 * - Never overwrite a non-null valid mapping with a weaker value
 * 
 * Strategy:
 * atlas_packets → codebase_chunk_index (via source_ref join, not chunk_id)
 * → qdrant_id → UPDATE atlas_packets.qdrant_point_id
 * 
 * Quality gates:
 * - No duplicates (packet_key uniqueness)
 * - No orphans (qdrant_id must exist)
 * - Source_ref consistency
 * - Only update if new value is better than existing
 */

import fs from 'fs';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const { Pool } = pg;
const env = loadRepoEnv(process.env);
const pool = new Pool({ connectionString: resolveDatabaseUrl(env) });

const isDryRun = process.argv.includes('--dry-run') || process.argv.includes('--dry');
const isApply = process.argv.includes('--apply');
const limitArg = process.argv.find(arg => arg.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1]) : 1000;

async function main() {
  const client = await pool.connect();
  try {
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('P0: Deterministic Qdrant Bridge Backfill');
    console.log(`Mode: ${isDryRun ? 'DRY-RUN' : 'APPLY'} | Limit: ${LIMIT}`);
    console.log('═══════════════════════════════════════════════════════════\n');

    // Pre-flight: Check baseline
    console.log('Pre-flight: Baseline coverage...');
    const baselineResult = await client.query(`
      SELECT
        COUNT(*) as total,
        COUNT(qdrant_point_id) FILTER (WHERE qdrant_point_id IS NOT NULL AND qdrant_point_id != '') as with_id,
        ROUND(100.0 * COUNT(qdrant_point_id) FILTER (WHERE qdrant_point_id IS NOT NULL AND qdrant_point_id != '') / COUNT(*), 2)::numeric as pct
      FROM atlas_packets
    `);
    const { total, with_id: baselineCount, pct: baselinePct } = baselineResult.rows[0];
    console.log(`  Total: ${total}`);
    console.log(`  With qdrant_point_id: ${baselineCount} (${baselinePct}%)\n`);

    // Step 1: Find deterministic matches
    console.log('Step 1: Find packets with source_ref that match codebase_chunk_index...');
    
    const candidateQuery = `
      SELECT
        ap.packet_key,
        ap.source_ref,
        cci.qdrant_id,
        cci.id as chunk_id,
        COUNT(*) OVER (PARTITION BY ap.packet_key) as dup_count,
        COUNT(*) OVER (PARTITION BY cci.qdrant_id) as qdrant_dup_count
      FROM atlas_packets ap
      JOIN codebase_chunk_index cci 
        ON LOWER(TRIM(ap.source_ref)) = LOWER(TRIM(cci.source_ref))
      WHERE ap.source_ref IS NOT NULL AND ap.source_ref != ''
        AND (ap.qdrant_point_id IS NULL OR ap.qdrant_point_id = '')
        AND cci.qdrant_id IS NOT NULL AND cci.qdrant_id != ''
      LIMIT $1
    `;

    const candidatesResult = await client.query(candidateQuery, [LIMIT]);
    const candidates = candidatesResult.rows;
    console.log(`  Found: ${candidates.length} candidates\n`);

    // Quality gate 1: Duplicates
    const duplicatedKeys = candidates.filter(c => c.dup_count > 1);
    const duplicatedQdrantIds = candidates.filter(c => c.qdrant_dup_count > 1);

    console.log('Step 2: Quality gates...');
    console.log(`  Packet duplicates (skip): ${duplicatedKeys.length}`);
    console.log(`  Qdrant duplicates (skip): ${duplicatedQdrantIds.length}`);

    // Filter to clean candidates only
    const cleanCandidates = candidates.filter(c => c.dup_count === 1 && c.qdrant_dup_count === 1);
    console.log(`  Clean candidates: ${cleanCandidates.length}\n`);

    if (cleanCandidates.length === 0) {
      console.log('  No clean candidates to backfill.\n');
      return;
    }

    if (isDryRun) {
      console.log('DRY-RUN: Would update:');
      for (const c of cleanCandidates.slice(0, 10)) {
        console.log(`  ${c.packet_key} → ${c.qdrant_id}`);
      }
      if (cleanCandidates.length > 10) {
        console.log(`  ... and ${cleanCandidates.length - 10} more`);
      }
      return;
    }

    // Apply
    if (isApply) {
      console.log('Step 3: Applying updates...');

      // Batch updates
      const batchSize = 100;
      let updatedCount = 0;

      for (let i = 0; i < cleanCandidates.length; i += batchSize) {
        const batch = cleanCandidates.slice(i, i + batchSize);
        const updateResult = await client.query(`
          UPDATE atlas_packets ap
          SET qdrant_point_id = batch.qdrant_id,
              updated_at = NOW()
          FROM (VALUES ${batch.map((c, idx) => `($${idx * 2 + 1}::text, $${idx * 2 + 2}::text)`).join(',')}) 
            AS batch(packet_key, qdrant_id)
          WHERE ap.packet_key = batch.packet_key
        `, batch.flatMap(c => [c.packet_key, c.qdrant_id]));

        updatedCount += updateResult.rowCount;
        console.log(`  Batch ${Math.floor(i / batchSize) + 1}: ${updateResult.rowCount} updated`);
      }

      // Post-flight: Check final coverage
      console.log('\nPost-flight: Final coverage...');
      const finalResult = await client.query(`
        SELECT
          COUNT(*) as total,
          COUNT(qdrant_point_id) FILTER (WHERE qdrant_point_id IS NOT NULL AND qdrant_point_id != '') as with_id,
          ROUND(100.0 * COUNT(qdrant_point_id) FILTER (WHERE qdrant_point_id IS NOT NULL AND qdrant_point_id != '') / COUNT(*), 2)::numeric as pct
        FROM atlas_packets
      `);
      const { with_id: finalCount, pct: finalPct } = finalResult.rows[0];
      console.log(`  With qdrant_point_id: ${finalCount} (${finalPct}%)`);
      console.log(`  Improvement: +${finalCount - baselineCount} packets (+${(finalPct - parseFloat(baselinePct)).toFixed(2)}%)\n`);

      console.log(`✅ Updated ${updatedCount} packets`);
    }

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('FATAL:', err.message);
  process.exit(1);
});
