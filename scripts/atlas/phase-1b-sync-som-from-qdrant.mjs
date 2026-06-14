#!/usr/bin/env node
/**
 * Phase 1b: Sync SOM Cluster from Qdrant → Postgres
 *
 * Purpose: Use existing Qdrant som_cluster values to populate Postgres
 * (Simpler than GPU k-means: Qdrant already has SOM assignments from prior pipeline)
 *
 * Strategy:
 *   1. Fetch Qdrant points with som_cluster payload
 *   2. Match to Postgres packets via:
 *      a. source_ref (with path normalization)
 *      b. packet_key (if available in Qdrant payload)
 *      c. feature_id + file_path combo
 *   3. Bulk update Postgres som_cluster column
 *   4. Verify coverage gate (≥85%)
 *
 * Usage:
 *   node scripts/atlas/phase-1b-sync-som-from-qdrant.mjs [--dry-run] [--apply]
 */

import pg from 'pg';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import http from 'http';

config({ path: resolve('.', '.env') });

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '../../');

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db'
});

const flags = {
  dryRun: process.argv.includes('--dry-run'),
  apply: process.argv.includes('--apply')
};

const mode = flags.apply ? 'APPLY' : 'DRY-RUN';

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  Phase 1b: Sync SOM Clusters from Qdrant → Postgres            ║');
console.log(`║  Mode: ${mode}${' '.repeat(48 - mode.length)}║`);
console.log('╚════════════════════════════════════════════════════════════════╝\n');

// ────────────────────────────────────────────────────────────────
// Qdrant API Helper
// ────────────────────────────────────────────────────────────────

async function qdrantRequest(method, path, body = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 6333,
      path,
      method,
      headers: { 'Content-Type': 'application/json' }
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });

    req.on('error', reject);

    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

// Normalize paths for matching
function normalizePath(p) {
  if (!p) return '';
  return p.replace(/^sveltekit-frontend\//, '').replace(/\\/g, '/');
}

// ────────────────────────────────────────────────────────────────
// Fetch & Match Strategy
// ────────────────────────────────────────────────────────────────

async function fetchAndMatchSOMClusters() {
  console.log('📦 Step 1: Fetch Qdrant points with som_cluster\n');

  // Fetch all Qdrant points with payload
  let allPoints = [];
  let nextOffset = undefined;

  do {
    const body = {
      limit: 1000,
      with_vectors: false,
      with_payload: true
    };

    if (nextOffset) body.offset = nextOffset;

    const response = await qdrantRequest(
      'POST',
      '/collections/codebase_chunks_768/points/scroll',
      body
    );

    const points = response.data?.result?.points || [];
    allPoints = [...allPoints, ...points];
    nextOffset = response.data?.result?.next_page_offset;

    console.log(`   ⏳ Fetched ${allPoints.length} points...`);
  } while (nextOffset);

  console.log(`   ✅ Total points: ${allPoints.length}\n`);

  // Filter points with som_cluster
  const pointsWithSOM = allPoints.filter(p => p.payload?.som_cluster !== undefined && p.payload?.som_cluster !== null);
  console.log(`   ✅ Points with som_cluster: ${pointsWithSOM.length}\n`);

  // Fetch Postgres packets
  console.log('📊 Step 2: Fetch Postgres atlas_codebase_packets\n');

  const pgResult = await pool.query(`
    SELECT
      packet_key,
      source_ref,
      file_path,
      feature_id
    FROM atlas_codebase_packets
  `);

  const pgPackets = pgResult.rows;
  console.log(`   ✅ Total packets: ${pgPackets.length}\n`);

  // Build matching map: source_ref → packet_key
  const pgBySourceRef = new Map();
  const pgByPacketKey = new Map();
  const pgByFilePath = new Map();

  for (const pkt of pgPackets) {
    pgBySourceRef.set(normalizePath(pkt.source_ref), pkt);
    if (pkt.packet_key) pgByPacketKey.set(pkt.packet_key, pkt);
    if (pkt.file_path) pgByFilePath.set(normalizePath(pkt.file_path), pkt);
  }

  // Match Qdrant → Postgres
  console.log('🔗 Step 3: Match Qdrant points to Postgres packets\n');

  const matches = [];
  let matchedCount = 0;

  for (const point of pointsWithSOM) {
    const payload = point.payload;
    let matchedPacket = null;

    // Strategy 1: packet_key (most reliable)
    if (payload.packet_key) {
      matchedPacket = pgByPacketKey.get(payload.packet_key);
      if (matchedPacket) {
        matches.push({ packet: matchedPacket, somCluster: payload.som_cluster, strategy: 'packet_key' });
        matchedCount++;
        continue;
      }
    }

    // Strategy 2: source_ref with normalization
    const sourceRef = payload.source_ref || payload.sourceRef;
    if (sourceRef) {
      matchedPacket = pgBySourceRef.get(normalizePath(sourceRef));
      if (matchedPacket) {
        matches.push({ packet: matchedPacket, somCluster: payload.som_cluster, strategy: 'source_ref' });
        matchedCount++;
        continue;
      }
    }

    // Strategy 3: file_path
    const filePath = payload.file_path || payload.path;
    if (filePath) {
      matchedPacket = pgByFilePath.get(normalizePath(filePath));
      if (matchedPacket) {
        matches.push({ packet: matchedPacket, somCluster: payload.som_cluster, strategy: 'file_path' });
        matchedCount++;
        continue;
      }
    }
  }

  console.log(`   ✅ Matched ${matchedCount}/${pointsWithSOM.length} points\n`);

  // Group by strategy
  const strategies = {};
  for (const match of matches) {
    strategies[match.strategy] = (strategies[match.strategy] || 0) + 1;
  }

  console.log('   Matching strategies used:');
  for (const [strat, count] of Object.entries(strategies)) {
    console.log(`     - ${strat}: ${count}`);
  }
  console.log('');

  return matches;
}

// ────────────────────────────────────────────────────────────────
// Backfill Postgres
// ────────────────────────────────────────────────────────────────

async function backfillPostgres(matches) {
  console.log('💾 Step 4: Backfill atlas_codebase_packets.som_cluster\n');

  if (matches.length === 0) {
    console.warn('   ⚠️  No matches found, nothing to update\n');
    return { success: false, updatedCount: 0 };
  }

  if (flags.dryRun) {
    console.log(`   [DRY-RUN] Preview (first 5 updates):\n`);
    for (const match of matches.slice(0, 5)) {
      console.log(`   packet_key="${match.packet.packet_key}" → som_cluster=${match.somCluster} (${match.strategy})`);
    }
    console.log(`\n   [DRY-RUN] Would update ${matches.length} packets\n`);
    return { success: true, updatedCount: matches.length };
  }

  // Execute bulk update
  console.log(`   🔄 Executing SQL UPDATE for ${matches.length} packets...\n`);

  try {
    let updateCount = 0;

    for (const match of matches) {
      const result = await pool.query(
        `UPDATE atlas_codebase_packets SET som_cluster = $1 WHERE packet_key = $2`,
        [match.somCluster, match.packet.packet_key]
      );
      updateCount += result.rowCount;
    }

    console.log(`   ✅ Updated ${updateCount} rows in Postgres\n`);
    return { success: true, updatedCount: updateCount };
  } catch (err) {
    console.error('   ❌ Postgres update failed:', err.message);
    return { success: false, updatedCount: 0 };
  }
}

// ────────────────────────────────────────────────────────────────
// Verify & Report
// ────────────────────────────────────────────────────────────────

async function verifyResults() {
  console.log('✅ Step 5: Verification\n');

  // Check Postgres coverage
  const pgResult = await pool.query(
    `SELECT COUNT(*) as total, COUNT(som_cluster) as filled FROM atlas_codebase_packets`
  );

  const pgTotal = parseInt(pgResult.rows[0].total);
  const pgFilled = parseInt(pgResult.rows[0].filled);
  const pgCoverage = ((pgFilled / pgTotal) * 100).toFixed(1);

  console.log(`   Postgres coverage: ${pgCoverage}% (${pgFilled}/${pgTotal})`);
  console.log(`   Gate (≥85%): ${pgCoverage >= 85 ? '✅ PASS' : '❌ FAIL'}\n`);

  // Check cluster distribution
  const distributionResult = await pool.query(
    `SELECT COUNT(DISTINCT som_cluster) as distinct_clusters FROM atlas_codebase_packets WHERE som_cluster IS NOT NULL`
  );

  const distinctClusters = parseInt(distributionResult.rows[0].distinct_clusters);
  console.log(`   Distinct clusters assigned: ${distinctClusters}/400`);
  console.log(`   Grid utilization: ${((distinctClusters / 400) * 100).toFixed(1)}%\n`);

  return { pgCoverage: parseFloat(pgCoverage), distinctClusters };
}

// ────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────

async function main() {
  try {
    const matches = await fetchAndMatchSOMClusters();
    const pgResult = await backfillPostgres(matches);
    const verifyResult = await verifyResults();

    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║  Phase 1b Complete ✅                                         ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    if (pgResult.success && verifyResult.pgCoverage >= 85) {
      console.log(`   ✅ SOM synchronization complete`);
      console.log(`   Coverage: ${verifyResult.pgCoverage}%`);
      console.log(`   Clusters: ${verifyResult.distinctClusters}/400\n`);
      console.log('   Next: Re-run health logger and proceed to Phase 2\n');
      process.exit(0);
    } else {
      console.log(`   ⚠️  SOM sync incomplete (coverage: ${verifyResult.pgCoverage}%)\n`);
      process.exit(1);
    }
  } catch (err) {
    console.error('Fatal error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
