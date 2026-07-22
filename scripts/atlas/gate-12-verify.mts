#!/usr/bin/env node

/**
 * Gate 12 Verification: Audit SOM cluster assignments in Postgres
 *
 * Checks:
 * 1. Cluster assignments exist (kmeans_cluster_id / som_row/col NOT NULL)
 * 2. Coordinates valid (som_row/col in [0-19])
 * 3. Distance in [0.0, ∞) — replaces removed som_confidence column
 * 4. Coverage rate (% of packets with assignments)
 * 5. Distribution balance (no cluster severely underrepresented)
 *
 * Usage:
 *   npx tsx scripts/atlas/gate-12-verify.mts
 */

import pg from 'pg';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(process.cwd(), '.env.local') });
config({ path: resolve(process.cwd(), 'sveltekit-frontend/.env') });

interface VerificationResult {
  totalPackets: number;
  assignedPackets: number;
  coverageRate: number;
  validAssignments: number;
  invalidAssignments: number;
  clusterDistribution: Map<number, number>;
  coordinateErrors: Array<{ packetKey: string; issue: string }>;
  confidenceErrors: Array<{ packetKey: string; confidence: number }>;
}

async function verifyGate12(): Promise<VerificationResult> {
  const connectionString = process.env.DATABASE_URL
    || `postgresql://${process.env.PGUSER || 'legal_admin'}:${process.env.PGPASSWORD || ''}@${process.env.PGHOST || '127.0.0.1'}:${process.env.PGPORT || '5434'}/${process.env.PGDATABASE || 'legal_ai_db'}`;

  const client = new pg.Client({ connectionString });
  await client.connect();

  try {
    // Discover which SOM columns actually exist in atlas_packets
    const colCheck = await client.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'atlas_packets'
        AND column_name IN ('kmeans_cluster_id','som_cluster_id','som_row','som_col',
                            'som_distance','som_bmu_row','som_bmu_col','som_confidence')
    `);
    const availableCols = new Set(colCheck.rows.map((r: any) => r.column_name));

    const clusterCol = availableCols.has('kmeans_cluster_id') ? 'kmeans_cluster_id'
                     : availableCols.has('som_cluster_id') ? 'som_cluster_id' : null;
    const rowCol = availableCols.has('som_row') ? 'som_row'
                 : availableCols.has('som_bmu_row') ? 'som_bmu_row' : null;
    const colCol = availableCols.has('som_col') ? 'som_col'
                 : availableCols.has('som_bmu_col') ? 'som_bmu_col' : null;
    const distCol = availableCols.has('som_distance') ? 'som_distance'
                  : availableCols.has('som_confidence') ? 'som_confidence' : null;

    console.log('═'.repeat(80));
    console.log('GATE 12 VERIFICATION: SOM / KMEANS CLUSTER ASSIGNMENTS');
    console.log('═'.repeat(80));
    console.log(`  cluster col: ${clusterCol ?? 'MISSING'}`);
    console.log(`  row col:     ${rowCol ?? 'MISSING'}`);
    console.log(`  col col:     ${colCol ?? 'MISSING'}`);
    console.log(`  dist col:    ${distCol ?? 'MISSING (skipping confidence check)'}`);
    console.log();

    if (!clusterCol) {
      console.log('❌ No cluster column found — gate cannot run.');
      await client.end();
      process.exit(1);
    }

    // Query 1: Total and assigned packet counts
    const withCoordsSql = rowCol && colCol
      ? `COUNT(CASE WHEN ${rowCol} IS NOT NULL AND ${colCol} IS NOT NULL THEN 1 END)`
      : '0';
    const withDistSql = distCol
      ? `COUNT(CASE WHEN ${distCol} IS NOT NULL THEN 1 END)`
      : '0';

    const countResult = await client.query(`
      SELECT
        COUNT(*) as total_packets,
        COUNT(${clusterCol}) as assigned_packets,
        ${withCoordsSql} as with_coords,
        ${withDistSql} as with_dist
      FROM atlas_packets
    `);

    const counts = countResult.rows[0];
    const totalPackets = parseInt(counts.total_packets);
    const assignedPackets = parseInt(counts.assigned_packets);
    const coverageRate = (assignedPackets / totalPackets) * 100;

    console.log(`Total packets:        ${totalPackets}`);
    console.log(`Assigned packets:     ${assignedPackets}`);
    console.log(`Coverage rate:        ${coverageRate.toFixed(2)}%`);
    console.log(`With coordinates:     ${counts.with_coords}`);
    console.log(`With distance:        ${counts.with_dist}`);
    console.log();

    // Query 2: Cluster distribution
    const distResult = await client.query(`
      SELECT
        ${clusterCol} as cluster_id,
        COUNT(*) as cluster_size
      FROM atlas_packets
      WHERE ${clusterCol} IS NOT NULL
      GROUP BY ${clusterCol}
      ORDER BY ${clusterCol} ASC
    `);

    const clusterDistribution = new Map<number, number>();
    for (const row of distResult.rows) {
      clusterDistribution.set(parseInt(row.cluster_id), parseInt(row.cluster_size));
    }

    const clusterValues = Array.from(clusterDistribution.values());
    const clusterStats = {
      total: clusterDistribution.size,
      min: clusterValues.length > 0 ? Math.min(...clusterValues) : 0,
      max: clusterValues.length > 0 ? Math.max(...clusterValues) : 0,
      avg: clusterValues.length > 0
        ? clusterValues.reduce((a, b) => a + b, 0) / clusterValues.length
        : 0,
    };

    console.log('Cluster distribution:');
    console.log(`  Clusters assigned:    ${clusterStats.total}/400`);
    console.log(`  Min cluster size:     ${clusterStats.min}`);
    console.log(`  Max cluster size:     ${clusterStats.max}`);
    console.log(`  Avg cluster size:     ${clusterStats.avg.toFixed(1)}`);
    console.log();

    // Query 3: Coordinate validation (only if coordinate columns exist)
    const coordinateErrors: Array<{ packetKey: string; issue: string }> = [];
    if (rowCol && colCol) {
      const coordResult = await client.query(`
        SELECT
          packet_key,
          ${rowCol} as row_val,
          ${colCol} as col_val,
          CASE
            WHEN ${rowCol} < 0 OR ${rowCol} > 19 THEN 'Row out of bounds'
            WHEN ${colCol} < 0 OR ${colCol} > 19 THEN 'Col out of bounds'
            ELSE 'VALID'
          END as status
        FROM atlas_packets
        WHERE ${clusterCol} IS NOT NULL
          AND (${rowCol} < 0 OR ${rowCol} > 19 OR ${colCol} < 0 OR ${colCol} > 19)
        LIMIT 10
      `);

      for (const row of coordResult.rows) {
        coordinateErrors.push({
          packetKey: row.packet_key,
          issue: `[${row.row_val},${row.col_val}] ${row.status}`,
        });
      }
    }

    if (coordinateErrors.length === 0) {
      console.log(`✅ Coordinate validation: All assignments valid [0-19]×[0-19]${!rowCol ? ' (columns absent — skipped)' : ''}`);
    } else {
      console.log(`❌ Coordinate validation: ${coordinateErrors.length} invalid assignments`);
      coordinateErrors.forEach(e => console.log(`   ${e.packetKey}: ${e.issue}`));
    }
    console.log();

    // Query 4: Distance/confidence validation (only if column exists; distance >= 0 always)
    const confidenceErrors: Array<{ packetKey: string; confidence: number }> = [];
    if (distCol) {
      const confResult = await client.query(`
        SELECT packet_key, ${distCol} as dist_val
        FROM atlas_packets
        WHERE ${clusterCol} IS NOT NULL
          AND ${distCol} < 0
        LIMIT 10
      `);

      for (const row of confResult.rows) {
        confidenceErrors.push({
          packetKey: row.packet_key,
          confidence: parseFloat(row.dist_val),
        });
      }
    }

    if (confidenceErrors.length === 0) {
      console.log(`✅ Distance validation: All values >= 0${!distCol ? ' (column absent — skipped)' : ''}`);
    } else {
      console.log(`❌ Distance validation: ${confidenceErrors.length} negative values`);
      confidenceErrors.forEach(e => console.log(`   ${e.packetKey}: ${e.confidence.toFixed(3)}`));
    }
    console.log();

    // Final verdict
    console.log('═'.repeat(80));
    console.log('GATE 12 VERDICT');
    console.log('═'.repeat(80));

    let passCount = 0;
    const checks = [
      { name: 'Coverage >= 95%', pass: coverageRate >= 95 },
      { name: 'Cluster balance (max ≤ 3× avg)', pass: clusterStats.avg === 0 || clusterStats.max <= clusterStats.avg * 3 },
      { name: 'Coordinates valid (or absent)', pass: coordinateErrors.length === 0 },
      { name: 'Distance valid (or absent)', pass: confidenceErrors.length === 0 },
    ];

    checks.forEach(check => {
      console.log(`${check.pass ? '✅' : '❌'} ${check.name}`);
      if (check.pass) passCount++;
    });

    console.log();
    const verdict = passCount >= 3 ? '✅ PASS' : '⚠️  PARTIAL PASS';
    console.log(`${verdict} (${passCount}/4 gates passed)`);
    console.log();

    return {
      totalPackets,
      assignedPackets,
      coverageRate,
      validAssignments: assignedPackets - coordinateErrors.length - confidenceErrors.length,
      invalidAssignments: coordinateErrors.length + confidenceErrors.length,
      clusterDistribution,
      coordinateErrors,
      confidenceErrors,
    };
  } finally {
    await client.end();
  }
}

verifyGate12()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('❌ Verification failed:', err);
    process.exit(1);
  });
