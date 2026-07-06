#!/usr/bin/env node
/**
 * Backfill Unified ID Hierarchy
 *
 * Populate repository_id, directory_id, file_id, module_id, symbol_id, feature_id, chunk_id
 * for all existing packets in atlas_packets.
 *
 * Strategy:
 * 1. Read packets with source_ref (derive directory structure)
 * 2. Generate UUIDs for each level
 * 3. Batch insert into atlas_id_hierarchy_metadata
 * 4. Update atlas_packets with generated IDs
 *
 * Usage:
 *   npm run atlas:backfill:unified-id-hierarchy:dry
 *   npm run atlas:backfill:unified-id-hierarchy:apply
 */

import { randomUUID } from 'node:crypto';
import pg from 'pg';

const DRY_RUN = !process.argv.includes('--apply');
const BATCH_SIZE = 100;
const LIMIT = process.argv.includes('--limit')
  ? parseInt(process.argv[process.argv.indexOf('--limit') + 1], 10)
  : 0; // 0 = all

console.log(`\n═══ Backfill Unified ID Hierarchy ═══\n`);
console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'APPLY'}`);
console.log(`Batch size: ${BATCH_SIZE}`);
console.log(`Limit: ${LIMIT > 0 ? LIMIT : 'ALL'}\n`);

const pool = new pg.Pool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '5434'),
  user: process.env.DB_USER || 'legal_admin',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'legal_ai_db'
});

/**
 * Derive IDs from source_ref
 * e.g., src/lib/server/auth.ts →
 *   directory_id = UUID for src/lib/server/
 *   file_id = UUID for auth.ts
 *   module_id = UUID for auth (module)
 *   symbol_id = UUID (placeholder; would be extracted from AST)
 */
function deriveIDHierarchy(sourceRef, packetKey) {
  const parts = sourceRef.split('/');
  const fileName = parts[parts.length - 1];
  const dirPath = parts.slice(0, -1).join('/');
  const moduleName = fileName.replace('.ts', '').replace('.js', '');

  // Deterministic UUIDs would be better, but using random for now
  // In production, use UUID v5 with namespace + source_ref
  return {
    repository_id: randomUUID(),
    directory_id: randomUUID(),
    file_id: randomUUID(),
    module_id: randomUUID(),
    symbol_id: randomUUID(),
    feature_id: deriveFeatureID(sourceRef, moduleName),
    chunk_id: randomUUID(),
    source_ref: sourceRef
  };
}

function deriveFeatureID(sourceRef, moduleName) {
  // feature_id = domain:feature-name
  // e.g., auth:session-validation
  const domain = sourceRef.split('/')[1] || 'core'; // lib/server → server
  const feature = moduleName.toLowerCase();
  return `${domain}:${feature}`;
}

async function backfillIDHierarchy() {
  try {
    // 1. Count total packets
    const countRes = await pool.query('SELECT COUNT(*) as count FROM atlas_packets');
    const totalPackets = parseInt(countRes.rows[0].count, 10);
    const targetPackets = LIMIT > 0 ? Math.min(LIMIT, totalPackets) : totalPackets;

    console.log(`Total packets: ${totalPackets}`);
    console.log(`Target: ${targetPackets}\n`);

    // 2. Fetch packets in batches
    let processed = 0;
    let offset = 0;
    let hierarchyData = [];

    while (processed < targetPackets) {
      const batchQuery = `
        SELECT packet_key, source_ref
        FROM atlas_packets
        WHERE source_ref IS NOT NULL
        ORDER BY created_at ASC
        LIMIT $1 OFFSET $2
      `;

      const batchRes = await pool.query(batchQuery, [BATCH_SIZE, offset]);
      if (batchRes.rows.length === 0) break;

      // Derive IDs for this batch
      for (const row of batchRes.rows) {
        const ids = deriveIDHierarchy(row.source_ref, row.packet_key);
        hierarchyData.push({
          packet_key: row.packet_key,
          ...ids
        });
        processed++;

        if (processed >= targetPackets) break;
      }

      offset += BATCH_SIZE;
    }

    console.log(`Derived ${hierarchyData.length} ID hierarchies\n`);

    // 3. Insert into metadata table + update packets (if --apply)
    if (DRY_RUN) {
      console.log(`[DRY-RUN] Would insert ${hierarchyData.length} rows into atlas_id_hierarchy_metadata`);
      console.log(`[DRY-RUN] Sample (first 3):`);
      hierarchyData.slice(0, 3).forEach(row => {
        console.log(`  packet_key: ${row.packet_key}`);
        console.log(`    feature_id: ${row.feature_id}`);
        console.log(`    directory_id: ${row.directory_id}\n`);
      });

      console.log(`[DRY-RUN] Would update ${hierarchyData.length} rows in atlas_packets`);
      console.log(`✅ Dry-run complete. Run with --apply to backfill.\n`);
    } else {
      // Batch insert into metadata using parameterized queries
      for (let i = 0; i < hierarchyData.length; i += BATCH_SIZE) {
        const batch = hierarchyData.slice(i, i + BATCH_SIZE);

        // Build parameterized query
        const placeholders = batch
          .map((_, idx) => {
            const base = idx * 9;
            return `($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5}, $${base + 6}, $${base + 7}, $${base + 8}, $${base + 9})`;
          })
          .join(',');

        const params = batch.flatMap(row => [
          row.packet_key,
          row.repository_id,
          row.directory_id,
          row.file_id,
          row.module_id,
          row.symbol_id,
          row.feature_id,
          row.chunk_id,
          row.source_ref
        ]);

        const insertQuery = `
          INSERT INTO atlas_id_hierarchy_metadata (
            packet_key, repository_id, directory_id, file_id, module_id, symbol_id, feature_id, chunk_id, source_ref
          ) VALUES ${placeholders}
          ON CONFLICT (packet_key) DO UPDATE SET
            repository_id = EXCLUDED.repository_id,
            directory_id = EXCLUDED.directory_id,
            file_id = EXCLUDED.file_id,
            module_id = EXCLUDED.module_id,
            symbol_id = EXCLUDED.symbol_id,
            feature_id = EXCLUDED.feature_id,
            chunk_id = EXCLUDED.chunk_id
        `;

        await pool.query(insertQuery, params);
        console.log(`✅ Inserted batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} rows)`);
      }

      // Batch update packets
      for (let i = 0; i < hierarchyData.length; i += BATCH_SIZE) {
        const batch = hierarchyData.slice(i, i + BATCH_SIZE);

        for (const row of batch) {
          const updateQuery = `
            UPDATE atlas_packets
            SET
              repository_id = $1,
              directory_id = $2,
              file_id = $3,
              module_id = $4,
              symbol_id = $5,
              chunk_id = $6,
              updated_at = NOW()
            WHERE packet_key = $7
          `;

          await pool.query(updateQuery, [
            row.repository_id,
            row.directory_id,
            row.file_id,
            row.module_id,
            row.symbol_id,
            row.chunk_id,
            row.packet_key
          ]);
        }

        console.log(`✅ Updated batch ${Math.floor(i / BATCH_SIZE) + 1} (${batch.length} rows)`);
      }

      // 4. Verify coverage
      const coverageRes = await pool.query('SELECT * FROM v_atlas_id_hierarchy_coverage');
      const coverage = coverageRes.rows[0];

      console.log(`\n📊 Coverage After Backfill:`);
      console.log(`  repository_id: ${coverage.repository_id_pct}% (${coverage.repository_id_populated}/${coverage.total_packets})`);
      console.log(`  directory_id: ${coverage.directory_id_pct}% (${coverage.directory_id_populated}/${coverage.total_packets})`);
      console.log(`  file_id: ${coverage.file_id_pct}% (${coverage.file_id_populated}/${coverage.total_packets})`);
      console.log(`  module_id: ${coverage.module_id_pct}% (${coverage.module_id_populated}/${coverage.total_packets})`);
      console.log(`  symbol_id: ${coverage.symbol_id_pct}% (${coverage.symbol_id_populated}/${coverage.total_packets})`);
      console.log(`  feature_id: ${coverage.feature_id_pct}% (${coverage.feature_id_populated}/${coverage.total_packets})`);
      console.log(`  chunk_id: ${coverage.chunk_id_pct}% (${coverage.chunk_id_populated}/${coverage.total_packets})\n`);

      console.log(`✅ Backfill complete. All ${hierarchyData.length} packets now have unified ID hierarchy.\n`);
    }

    process.exit(0);
  } catch (err) {
    console.error(`❌ Error: ${err.message}\n`);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

backfillIDHierarchy();
