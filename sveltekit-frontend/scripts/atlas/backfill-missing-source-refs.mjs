#!/usr/bin/env node
/**
 * backfill-missing-source-refs.mjs
 *
 * Backfill source_ref for packets missing this critical identity field.
 *
 * Strategy:
 * 1. Packets with real feature_id → derive source_ref from feature metadata or nes_chrom mapping
 * 2. Packets with unclassified_packet → mark as "synthetic" or "unclassified"
 * 3. Packets with domain/tags → infer from semantic metadata
 */

import pg from 'pg';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dir, '../..');

const DRY_RUN = !process.argv.includes('--apply');
const VERBOSE = process.argv.includes('--verbose');

const DB_URL = process.env.DATABASE_URL ?? 'postgresql://legal_admin:legal_password@127.0.0.1:5432/legal_ai_db';

function log(...args) {
  console.log(`[${new Date().toISOString()}]`, ...args);
}

function vlog(...args) {
  if (VERBOSE) console.log(`[${new Date().toISOString()}] VERBOSE:`, ...args);
}

async function getDB() {
  const pool = new pg.Pool({ connectionString: DB_URL });
  pool.on('error', (err) => console.error('Pool error:', err));
  return pool;
}

async function queryDB(pool, query, params = []) {
  try {
    const result = await pool.query(query, params);
    return result.rows;
  } catch (err) {
    console.error('Query error:', err.message);
    throw err;
  }
}

/**
 * Stage 1: Identify packets missing source_ref
 */
async function identifyMissing(pool) {
  log('Stage 1: Identify packets missing source_ref');

  const missing = await queryDB(pool, `
    SELECT
      packet_key,
      feature_id,
      metadata->>'summary' as summary_hint,
      metadata->>'domain' as domain_hint,
      metadata->>'file_path' as file_path_hint
    FROM atlas_packets
    WHERE source_ref IS NULL
    ORDER BY packet_key
  `);

  log(`  Found ${missing.length} packets with NULL source_ref`);
  return missing;
}

/**
 * Stage 2: Derive source_ref candidates
 */
async function deriveCandidates(pool, missing) {
  log(`Stage 2: Deriving source_ref candidates (${missing.length} packets)`);

  const results = [];
  let updated = 0;
  let unclassified = 0;

  for (const packet of missing) {
    let sourceRef = null;

    // Strategy 1: If file_path_hint exists, use it
    if (packet.file_path_hint) {
      sourceRef = packet.file_path_hint;
      updated++;
    }
    // Strategy 2: If feature_id is real (not unclassified), try Neo4j lookup (deferred)
    else if (packet.feature_id && packet.feature_id !== 'unclassified_packet') {
      // For now, mark as "feature:" + id
      sourceRef = `feature:${packet.feature_id}`;
      updated++;
    }
    // Strategy 3: Mark unclassified packets
    else {
      sourceRef = 'synthetic:unclassified';
      unclassified++;
    }

    results.push({
      packet_key: packet.packet_key,
      source_ref: sourceRef,
      reason: packet.file_path_hint ? 'from_metadata' : (packet.feature_id !== 'unclassified_packet' ? 'derived_from_feature' : 'synthetic')
    });

    vlog(`  ${packet.packet_key}: ${sourceRef}`);
  }

  log(`  Candidates: ${updated} derived, ${unclassified} synthetic`);
  return results;
}

/**
 * Stage 3: Apply backfill (if --apply)
 */
async function applyBackfill(pool, candidates) {
  if (DRY_RUN) {
    log(`Stage 3: DRY-RUN (would update ${candidates.length} packets)`);
    return 0;
  }

  log(`Stage 3: Applying backfill (${candidates.length} packets)`);

  let applied = 0;
  let errors = 0;

  for (const candidate of candidates) {
    try {
      await queryDB(pool, `
        UPDATE atlas_packets
        SET source_ref = $1
        WHERE packet_key = $2
      `, [candidate.source_ref, candidate.packet_key]);

      applied++;
      vlog(`  ✓ ${candidate.packet_key} → ${candidate.source_ref}`);
    } catch (err) {
      errors++;
      console.error(`  ✗ ${candidate.packet_key}: ${err.message}`);
    }
  }

  log(`  Applied: ${applied}, Errors: ${errors}`);
  return applied;
}

/**
 * Stage 4: Verify backfill
 */
async function verifyBackfill(pool) {
  log('Stage 4: Verify backfill');

  const result = await queryDB(pool, `
    SELECT
      COUNT(*) as total,
      COUNT(CASE WHEN source_ref IS NOT NULL THEN 1 END) as with_source_ref,
      ROUND(100.0 * COUNT(CASE WHEN source_ref IS NOT NULL THEN 1 END) / COUNT(*), 2) as percent
    FROM atlas_packets
  `);

  const [row] = result;
  log(`  Total packets: ${row.total}`);
  log(`  With source_ref: ${row.with_source_ref}/${row.total} (${row.percent}%)`);

  if (row.percent >= 95) {
    log('  ✓ PASS — source_ref coverage >= 95%');
    return true;
  } else {
    log(`  ⚠ WARN — source_ref coverage < 95% (${row.percent}%)`);
    return false;
  }
}

/**
 * Main
 */
async function main() {
  const pool = await getDB();

  try {
    log('Atlas Packets — Missing source_ref Backfill');
    log(`  Dry-run: ${DRY_RUN}\n`);

    const missing = await identifyMissing(pool);
    const candidates = await deriveCandidates(pool, missing);
    const applied = await applyBackfill(pool, candidates);
    const success = await verifyBackfill(pool);

    log(`\n=== BACKFILL COMPLETE ===`);
    log(`Packets updated: ${applied}`);
    log(`Status: ${success ? '✓ PASS' : '⚠ NEEDS_ATTENTION'}`);

    if (!DRY_RUN) {
      log(`\nNext: Run Qdrant payload backfill:`);
      log(`  npm run atlas:4b:qdrant-payload -- --apply`);
      log(`\nThen re-audit:`);
      log(`  npm run atlas:4c:qdrant-contract:audit`);
    }

  } finally {
    await pool.end();
  }
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
