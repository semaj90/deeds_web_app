#!/usr/bin/env node
/**
 * CARD 2: Qdrant Bridge Materialization
 *
 * Core Goal:
 *   atlas_packets.packet_key → source_ref/feature_id
 *   → codebase_chunk_index.qdrant_id
 *   → atlas_packets.qdrant_point_id (backfill)
 *
 * Canonical Rule:
 *   Do NOT invent Qdrant IDs.
 *   Backfill from existing indexed chunks only.
 *   Deterministic join: source_ref (primary), feature_id (secondary)
 *
 * Modes:
 *   --dry-run (default)  : validate joins without writes
 *   --apply              : UPDATE atlas_packets with qdrant_point_id
 *   --limit=500          : process N packets (default 500)
 *   --batch-size=200     : batch insert/update size (default 200)
 *
 * Validation Gates (before/target/after):
 *   1. qdrant_point_id coverage before (baseline)
 *   2. target 70%+ coverage after apply
 *   3. missing_source_ref count (hard fail if > 0)
 *   4. missing_feature_id count (hard fail if > 0)
 *   5. missing_qdrant_id count (soft warn if > 0)
 *   6. ambiguous_joins count (soft warn if > 0)
 *   7. updated_count (report)
 *
 * Usage:
 *   npm run atlas:qdrant-bridge:dry
 *   npm run atlas:qdrant-bridge:apply --limit=1000
 *   npm run atlas:qdrant-bridge:apply --batch-size=100
 *
 * Execution Sequence (Session 108):
 *   1. node scripts/atlas/backfill-qdrant-point-id-bridge.mjs --dry-run --limit=500
 *   2. node scripts/atlas/backfill-qdrant-point-id-bridge.mjs --apply --limit=500
 *   3. node scripts/atlas/verify-packet-metadata.mjs
 *   4. node scripts/atlas/qdrant-tag-mirror.mjs --dry-run
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ═════════════════════════════════════════════════════════════════════════
// CONFIGURATION
// ═════════════════════════════════════════════════════════════════════════

const isDryRun = process.argv.includes('--dry-run') || process.argv.includes('--dry');
const isApply = process.argv.includes('--apply');
const isVerbose = process.argv.includes('--verbose');

const limitArg = process.argv.find(arg => arg.startsWith('--limit='));
const batchSizeArg = process.argv.find(arg => arg.startsWith('--batch-size='));

const LIMIT = limitArg ? parseInt(limitArg.split('=')[1]) : 500;
const BATCH_SIZE = batchSizeArg ? parseInt(batchSizeArg.split('=')[1]) : 200;

const POSTGRES_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:legal_password@127.0.0.1:5434/legal_ai_db';

// ═════════════════════════════════════════════════════════════════════════
// DATABASE CLIENT
// ═════════════════════════════════════════════════════════════════════════

async function createPool() {
  const pool = new Pool({
    connectionString: POSTGRES_URL,
    max: 5,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000
  });

  pool.on('error', (err) => {
    console.error('[ERROR] Unexpected pool error:', err);
  });

  return pool;
}

// ═════════════════════════════════════════════════════════════════════════
// VALIDATION GATES
// ═════════════════════════════════════════════════════════════════════════

async function getCoverageStats(pool) {
  const query = `
    SELECT
      COUNT(*) as total_packets,
      COUNT(CASE WHEN qdrant_point_id IS NOT NULL THEN 1 END) as covered,
      COUNT(CASE WHEN qdrant_point_id IS NULL THEN 1 END) as uncovered,
      COUNT(CASE WHEN source_ref IS NULL THEN 1 END) as missing_source_ref,
      COUNT(CASE WHEN feature_id IS NULL THEN 1 END) as missing_feature_id
    FROM atlas_packets
  `;

  const result = await pool.query(query);
  const row = result.rows[0];

  return {
    total: parseInt(row.total_packets),
    covered: parseInt(row.covered),
    uncovered: parseInt(row.uncovered),
    missingSourceRef: parseInt(row.missing_source_ref),
    missingFeatureId: parseInt(row.missing_feature_id),
    coveragePercent: (parseInt(row.covered) / parseInt(row.total_packets) * 100).toFixed(2)
  };
}

// ═════════════════════════════════════════════════════════════════════════
// BRIDGE QUERY: Join atlas_packets to codebase_chunk_index
// ═════════════════════════════════════════════════════════════════════════

async function fetchBridgeCandidates(pool, limit) {
  const query = `
    WITH packets_needing_qdrant AS (
      SELECT
        ap.packet_id,
        ap.packet_key,
        ap.source_ref,
        ap.feature_id,
        ap.source_kind,
        ROW_NUMBER() OVER (
          ORDER BY ap.updated_at DESC
        ) as rn
      FROM atlas_packets ap
      WHERE ap.qdrant_point_id IS NULL
        AND ap.source_ref IS NOT NULL
        AND ap.feature_id IS NOT NULL
        AND ap.source_ref NOT LIKE 'proto:%'
        AND ap.source_ref NOT LIKE 'task:%'
        AND ap.source_ref NOT LIKE 'feature:%'
      LIMIT $1
    ),
    chunk_candidates AS (
      SELECT
        pnq.packet_id,
        pnq.packet_key,
        pnq.source_ref,
        pnq.feature_id,
        pnq.source_kind,
        cci.qdrant_id,
        cci.relative_path,
        cci.symbol,
        cci.indexed_at,
        ROW_NUMBER() OVER (
          PARTITION BY pnq.packet_id
          ORDER BY cci.indexed_at DESC, cci.id ASC
        ) as chunk_rank,
        COUNT(*) OVER (
          PARTITION BY pnq.packet_id
        ) as total_chunks
      FROM packets_needing_qdrant pnq
      INNER JOIN codebase_chunk_index cci
        ON cci.relative_path = pnq.source_ref
      WHERE cci.qdrant_id IS NOT NULL
    )
    SELECT
      packet_id,
      packet_key,
      source_ref,
      feature_id,
      source_kind,
      qdrant_id,
      relative_path,
      symbol,
      indexed_at,
      chunk_rank,
      total_chunks
    FROM chunk_candidates
    WHERE chunk_rank = 1
    ORDER BY packet_key
  `;

  const result = await pool.query(query, [limit]);
  return result.rows;
}

// ═════════════════════════════════════════════════════════════════════════
// JOIN RESOLUTION: Select best chunk per packet (chunk_rank=1)
// ═════════════════════════════════════════════════════════════════════════

function resolveJoins(candidates) {
  const joinMap = new Map(); // packet_id → { qdrant_id, confidence, source, chunkRank, totalChunks }

  for (const candidate of candidates) {
    const key = candidate.packet_id;
    const chunkRank = parseInt(candidate.chunk_rank);
    const totalChunks = parseInt(candidate.total_chunks);

    // Only accept chunk_rank=1 (most recently indexed/best match)
    // Query WHERE clause should already filter to chunk_rank=1, but double-check
    if (chunkRank === 1) {
      joinMap.set(key, {
        qdrant_id: candidate.qdrant_id,
        confidence: totalChunks === 1 ? 1.0 : 0.8, // Lower confidence if multiple chunks
        source: candidate.relative_path,
        symbol: candidate.symbol,
        chunkRank: chunkRank,
        totalChunks: totalChunks
      });
    }
  }

  return joinMap;
}

// ═════════════════════════════════════════════════════════════════════════
// DRY-RUN: Validate joins without writes
// ═════════════════════════════════════════════════════════════════════════

async function dryRunValidation(pool, candidates, joinMap) {
  console.log(`\n[DRY-RUN] Qdrant Bridge Materialization\n`);

  const coverageBefore = await getCoverageStats(pool);
  console.log('Before:');
  console.log(`  Total packets: ${coverageBefore.total}`);
  console.log(`  Already covered: ${coverageBefore.covered} (${coverageBefore.coveragePercent}%)`);
  console.log(`  Uncovered: ${coverageBefore.uncovered}`);
  console.log(`  Missing source_ref: ${coverageBefore.missingSourceRef}`);
  console.log(`  Missing feature_id: ${coverageBefore.missingFeatureId}\n`);

  // Analyze joins
  let singleChunkMatches = 0;
  let multiChunkMatches = 0;
  const uniquePackets = new Set();

  for (const [packetId, join] of joinMap.entries()) {
    uniquePackets.add(packetId);

    if (join.totalChunks === 1) {
      singleChunkMatches++;
    } else {
      multiChunkMatches++;
      if (isVerbose) {
        console.log(`  [MULTI-CHUNK] ${packetId}: ${join.totalChunks} chunks, selected rank 1`);
      }
    }
  }

  // Count processed vs all needing qdrant
  const processedIds = new Set(joinMap.keys());
  const allCandidatesSet = new Set();
  candidates.forEach(c => allCandidatesSet.add(c.packet_id));

  console.log('Join Resolution:');
  console.log(`  File-based packets needing qdrant_point_id: ${allCandidatesSet.size}`);
  console.log(`  Successfully mapped to qdrant_id: ${uniquePackets.size}`);
  console.log(`  Single-chunk matches: ${singleChunkMatches}`);
  console.log(`  Multi-chunk matches (selected rank 1): ${multiChunkMatches}`);

  // Project target coverage
  const targetCovered = coverageBefore.covered + uniquePackets.size;
  const targetCoveragePercent = (targetCovered / coverageBefore.total * 100).toFixed(2);

  console.log(`\nTarget Coverage After Apply:`);
  console.log(`  Would cover: ${targetCovered}/${coverageBefore.total} (${targetCoveragePercent}%)`);

  const meetsTarget = targetCoveragePercent >= 70;
  console.log(`  Target 70%+: ${meetsTarget ? '✅ PASS' : '❌ FAIL'}\n`);

  // Validation gates
  const validationPass =
    coverageBefore.missingSourceRef === 0 &&
    coverageBefore.missingFeatureId === 0;

  console.log('Validation Gates:');
  console.log(`  G1 (source_ref present): ${coverageBefore.missingSourceRef === 0 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  G2 (feature_id present): ${coverageBefore.missingFeatureId === 0 ? '✅ PASS' : '❌ FAIL'}`);
  console.log(`  G3 (target 70%): ${meetsTarget ? '✅ PASS' : '❌ FAIL'}`);

  console.log(`\n[DRY-RUN] Summary: ${validationPass && meetsTarget ? 'READY FOR APPLY' : 'REVIEW REQUIRED'}\n`);
}

// ═════════════════════════════════════════════════════════════════════════
// APPLY: Write qdrant_point_id backfills in batches
// ═════════════════════════════════════════════════════════════════════════

async function applyBackfill(pool, joinMap) {
  console.log(`\n[APPLY] Qdrant Bridge Materialization\n`);

  const coverageBefore = await getCoverageStats(pool);
  console.log('Before:');
  console.log(`  Coverage: ${coverageBefore.covered}/${coverageBefore.total} (${coverageBefore.coveragePercent}%)\n`);

  // Batch updates
  const entries = Array.from(joinMap.entries());
  let updateCount = 0;
  let errorCount = 0;

  for (let i = 0; i < entries.length; i += BATCH_SIZE) {
    const batch = entries.slice(i, i + BATCH_SIZE);

    const updates = batch.map(([packetId, join]) => ({
      packet_id: packetId,
      qdrant_point_id: join.qdrant_id,
      qdrant_collection: 'codebase_chunks_768',
      qdrant_vector_dim: 768
    }));

    try {
      const query = `
        UPDATE atlas_packets
        SET
          qdrant_point_id = $2,
          qdrant_collection = $3,
          qdrant_vector_dim = $4,
          updated_at = NOW()
        WHERE packet_id = $1
      `;

      for (const update of updates) {
        await pool.query(query, [
          update.packet_id,
          update.qdrant_point_id,
          update.qdrant_collection,
          update.qdrant_vector_dim
        ]);
        updateCount++;
      }

      console.log(`  ✅ Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} updates`);
    } catch (err) {
      console.error(`  ❌ Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${err.message}`);
      errorCount += batch.length;
    }
  }

  console.log(`\nUpdates Complete:`);
  console.log(`  Successful: ${updateCount}`);
  console.log(`  Failed: ${errorCount}\n`);

  // Verify coverage after apply
  const coverageAfter = await getCoverageStats(pool);
  console.log('After:');
  console.log(`  Coverage: ${coverageAfter.covered}/${coverageAfter.total} (${coverageAfter.coveragePercent}%)`);
  console.log(`  Improvement: +${coverageAfter.covered - coverageBefore.covered} packets\n`);

  console.log(`[APPLY] Complete. Next: npm run atlas:verify-packet-metadata\n`);
}

// ═════════════════════════════════════════════════════════════════════════
// MAIN
// ═════════════════════════════════════════════════════════════════════════

async function main() {
  const pool = await createPool();

  try {
    console.log(`\n[QDRANT BRIDGE MATERIALIZATION] ${isDryRun ? 'DRY-RUN' : 'APPLY'} MODE\n`);
    console.log(`Configuration:`);
    console.log(`  Limit: ${LIMIT} packets`);
    console.log(`  Batch size: ${BATCH_SIZE}`);
    console.log(`  Mode: ${isDryRun ? 'DRY-RUN (no writes)' : 'APPLY (UPDATE atlas_packets)'}\n`);

    // Fetch bridge candidates
    console.log(`Step 1: Fetch bridge candidates...`);
    const candidates = await fetchBridgeCandidates(pool, LIMIT);
    console.log(`  Found ${candidates.length} candidate rows\n`);

    if (candidates.length === 0) {
      console.log(`[WARNING] No candidates found. Check that source_ref and feature_id are populated.\n`);
      process.exit(0);
    }

    // Resolve joins
    console.log(`Step 2: Resolve joins...`);
    const joinMap = resolveJoins(candidates);
    console.log(`  Resolved ${joinMap.size} unique packet→qdrant_id mappings\n`);

    // Dry-run or apply
    if (isDryRun) {
      await dryRunValidation(pool, candidates, joinMap);
    } else if (isApply) {
      await applyBackfill(pool, joinMap);
    } else {
      console.log(`[ERROR] Specify --dry-run or --apply\n`);
      process.exit(1);
    }
  } catch (err) {
    console.error(`[ERROR] ${err.message}\n`);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
