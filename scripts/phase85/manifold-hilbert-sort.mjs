#!/usr/bin/env node

/**
 * 4D Manifold Hilbert Curve Sort
 * Groups 57K packets by spatial locality (SOM BMU + authority)
 * Sorts via Hilbert Z-order curve → contiguous GPU memory layout
 * Persists to atlas_4d_manifold_sort table for kernel caching
 */

import { db } from '../../sveltekit-frontend/src/lib/server/db/client.js';
import { sql } from 'drizzle-orm';
import fs from 'fs/promises';
import path from 'path';

const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');

// Hilbert curve: 2D (x,y) → 1D Z-order key (0..2^32)
function xy2d(n, x, y) {
  // Hilbert curve conversion (standard algorithm)
  let d = 0;
  for (let s = n / 2; s > 0; s /= 2) {
    const rx = (x & s) > 0 ? 1 : 0;
    const ry = (y & s) > 0 ? 1 : 0;
    d += s * s * ((3 * rx) ^ ry);
    // Rotate quadrant
    if (ry === 0) {
      if (rx === 1) {
        x = s - 1 - x;
        y = s - 1 - y;
      }
      [x, y] = [y, x];
    }
  }
  return d;
}

async function main() {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║  4D Manifold Hilbert Curve Sort (57K Packets)                 ║
╚════════════════════════════════════════════════════════════════╝

Mode: ${DRY_RUN ? 'DRY-RUN' : 'APPLY'}
Verbose: ${VERBOSE ? 'YES' : 'NO'}
`);

  // Step 1: Fetch all packets with SOM coordinates
  console.log('📦 Fetching 57K packets with SOM coordinates...');
  const packets = await db.execute(sql`
    SELECT
      p.packet_key,
      p.feature_id,
      p.directory_path,
      p.summary,
      COALESCE(p.som_cluster, 'unclustered') as som_cluster,
      COALESCE(t.som_row, 10) as som_bmu_row,
      COALESCE(t.som_col, 10) as som_bmu_col,
      COALESCE(k.karpathy_score, 0.5) as karpathy_authority
    FROM atlas_packets p
    LEFT JOIN atlas_topology_index t ON p.packet_key = t.packet_key
    LEFT JOIN atlas_karpathy_scores k ON p.feature_id = k.feature_id
    WHERE p.packet_key IS NOT NULL
    LIMIT 60000
  `) as any;

  const rows = packets.rows || [];
  console.log(`✓ Fetched ${rows.length} packets\n`);

  if (rows.length === 0) {
    console.error('❌ No packets found. Verify Postgres data.');
    process.exit(1);
  }

  // Step 2: Compute Hilbert Z-order for each packet
  console.log('🗺️  Computing Hilbert Z-order keys...');
  const HILBERT_N = 1024; // Grid resolution 1024x1024
  const sorted = rows
    .map((row, idx) => {
      // Normalize SOM coords to [0, HILBERT_N)
      const x = Math.max(0, Math.min(HILBERT_N - 1, Math.floor(row.som_bmu_col * HILBERT_N / 400)));
      const y = Math.max(0, Math.min(HILBERT_N - 1, Math.floor(row.som_bmu_row * HILBERT_N / 400)));
      const z = xy2d(HILBERT_N, x, y);
      return {
        ...row,
        som_bmu_row: row.som_bmu_row,
        som_bmu_col: row.som_bmu_col,
        hilbert_z_order: z,
        manifold_rank: 0  // will be set after sort
      };
    })
    .sort((a, b) => a.hilbert_z_order - b.hilbert_z_order)
    .map((row, idx) => ({
      ...row,
      manifold_rank: idx + 1
    }));

  console.log(`✓ Sorted ${sorted.length} packets by Hilbert curve\n`);

  if (VERBOSE) {
    console.log('Sample sorted packets (first 5):');
    sorted.slice(0, 5).forEach(p => {
      console.log(`  [${p.manifold_rank}] ${p.packet_key} Z=${p.hilbert_z_order} (SOM: ${p.som_bmu_row},${p.som_bmu_col})`);
    });
    console.log('');
  }

  // Step 3: Upsert to Postgres (or dry-run)
  if (DRY_RUN) {
    console.log(`[DRY-RUN] Would upsert ${sorted.length} rows to atlas_4d_manifold_sort`);
    console.log(`  Table: atlas_4d_manifold_sort`);
    console.log(`  Columns: packet_key, som_bmu_row, som_bmu_col, hilbert_z_order, karpathy_authority, manifold_rank`);
    console.log(`\n✅ DRY-RUN COMPLETE`);
    return;
  }

  console.log('💾 Upserting to Postgres...');
  const BATCH_SIZE = 100;
  let upserted = 0;

  for (let i = 0; i < sorted.length; i += BATCH_SIZE) {
    const batch = sorted.slice(i, i + BATCH_SIZE);
    await db.execute(sql`
      INSERT INTO atlas_4d_manifold_sort (
        packet_key, som_bmu_row, som_bmu_col, hilbert_z_order, karpathy_authority, manifold_rank, created_at
      ) VALUES ${sql.raw(
        batch
          .map((p, j) => {
            const key = `'${p.packet_key.replace(/'/g, "''")}'`;
            return `(${key}, ${p.som_bmu_row}, ${p.som_bmu_col}, ${p.hilbert_z_order}, ${p.karpathy_authority}, ${p.manifold_rank}, NOW())`;
          })
          .join(', ')
      )}
      ON CONFLICT (packet_key) DO UPDATE SET
        hilbert_z_order = EXCLUDED.hilbert_z_order,
        manifold_rank = EXCLUDED.manifold_rank,
        updated_at = NOW()
    `);
    upserted += batch.length;
    if (VERBOSE) {
      console.log(`  ✓ ${upserted}/${sorted.length} upsertion completed`);
    }
  }

  console.log(`✓ Upserted ${upserted} rows\n`);

  // Step 4: Summary stats
  const stats = await db.execute(sql`
    SELECT
      COUNT(*) as total_rows,
      MIN(hilbert_z_order) as min_z,
      MAX(hilbert_z_order) as max_z,
      COUNT(DISTINCT som_bmu_row) as unique_rows,
      COUNT(DISTINCT som_bmu_col) as unique_cols,
      COUNT(DISTINCT karpathy_authority) as unique_authorities
    FROM atlas_4d_manifold_sort
  `) as any;

  const s = stats.rows?.[0];
  console.log(`📊 Manifold Statistics:
  Total rows: ${s.total_rows}
  Hilbert Z range: ${s.min_z}..${s.max_z}
  SOM grid coverage: ${s.unique_rows} rows × ${s.unique_cols} cols
  Authority levels: ${s.unique_authorities}
`);

  console.log(`✅ MANIFOLD SORT COMPLETE

📁 Next Step: npm run cuda:graph:capture:representative
   (Captures CUDA graphs for representative workload)`);
}

main().catch(console.error);
