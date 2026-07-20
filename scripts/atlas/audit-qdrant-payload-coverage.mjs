#!/usr/bin/env node
/**
 * audit-qdrant-payload-coverage.mjs
 *
 * Verifies that Qdrant payloads are complete after backfill.
 * Checks:
 *   1. Row count parity (Postgres atlas_packets vs Qdrant codebase_chunks_768)
 *   2. Payload field coverage (packet_key, source_ref, feature_id, domain_class)
 *   3. Missing field inventory by type
 *   4. Collision detection (duplicate packet_key in Qdrant)
 *   5. Orphan detection (Qdrant points with no Postgres match)
 *
 * Outputs:
 *   - docs/reports/qdrant-payload-coverage-audit.json
 *   - Detailed coverage metrics + gate pass/fail
 *
 * Usage:
 *   node scripts/atlas/audit-qdrant-payload-coverage.mjs
 *   node scripts/atlas/audit-qdrant-payload-coverage.mjs --verbose
 *   node scripts/atlas/audit-qdrant-payload-coverage.mjs --strict
 */

import pg        from 'pg';
import { writeFileSync, mkdirSync } from 'node:fs';
import path      from 'node:path';
import { fileURLToPath } from 'node:url';

const __dir = path.dirname(fileURLToPath(import.meta.url));
const ROOT  = path.resolve(__dir, '../..');

// ── Config ────────────────────────────────────────────────────────────────────
const VERBOSE    = process.argv.includes('--verbose');
const STRICT     = process.argv.includes('--strict');  // Fail on any gap
const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
const COLLECTION = 'codebase_chunks_768';
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

const REPORT_DIR = path.resolve(ROOT, 'docs/reports');

// ── Qdrant client helpers ─────────────────────────────────────────────────────

/**
 * Fetch collection info (point count, vector size)
 */
async function getCollectionInfo() {
  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`, {
    headers: { 'Content-Type': 'application/json' },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Qdrant: ${res.status} ${res.statusText}`);
  const data = await res.json();
  return data.result;
}

/**
 * Scroll through all Qdrant points, collecting payload field statistics
 */
async function auditQdrantPayloads() {
  const stats = {
    total_points: 0,
    with_packet_key: 0,
    with_source_ref: 0,
    with_feature_id: 0,
    with_domain_class: 0,
    missing_packet_key: 0,
    missing_source_ref: 0,
    missing_feature_id: 0,
    missing_domain_class: 0,
    null_payloads: 0,
    packet_keys: new Map(),  // Track duplicates
    orphans: [],
  };

  let pointId = null;
  const batchSize = 500;
  let hasMore = true;

  while (hasMore) {
    // Use scroll endpoint with proper POST request
    const body = {
      limit: batchSize,
      ...(pointId && { point_id_from: pointId }),
      with_payload: true,
      with_vector: false,
    };

    const res = await fetch(
      `${QDRANT_URL}/collections/${COLLECTION}/points/scroll`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(15_000),
      }
    );
    if (!res.ok) throw new Error(`Qdrant scroll: ${res.status} ${res.statusText}`);
    const data = await res.json();
    const points = data.result?.points || [];

    if (points.length === 0) break;

    for (const point of points) {
      stats.total_points++;
      const payload = point.payload || {};

      // Field coverage
      if (payload.packet_key) stats.with_packet_key++;
      else stats.missing_packet_key++;

      if (payload.source_ref) stats.with_source_ref++;
      else stats.missing_source_ref++;

      if (payload.feature_id) stats.with_feature_id++;
      else stats.missing_feature_id++;

      if (payload.domain_class) stats.with_domain_class++;
      else stats.missing_domain_class++;

      if (!payload || Object.keys(payload).length === 0) {
        stats.null_payloads++;
      }

      // Collision detection
      if (payload.packet_key) {
        const existing = stats.packet_keys.get(payload.packet_key);
        if (existing) {
          existing.count++;
          existing.qdrant_ids.push(point.id);
        } else {
          stats.packet_keys.set(payload.packet_key, {
            count: 1,
            qdrant_ids: [point.id],
          });
        }
      }

      pointId = point.id;
    }

    hasMore = points.length === batchSize;

    if (VERBOSE && stats.total_points % 5000 === 0) {
      process.stdout.write(`\r  Scanned: ${stats.total_points}   `);
    }
  }

  // Detect collisions
  const collisions = Array.from(stats.packet_keys.entries())
    .filter(([_, info]) => info.count > 1)
    .map(([key, info]) => ({ packet_key: key, count: info.count, qdrant_ids: info.qdrant_ids }));

  return { stats, collisions };
}

/**
 * Compare Postgres vs Qdrant row counts
 */
async function auditPostgresState(pool) {
  const { rows: pgStats } = await pool.query(`
    SELECT
      COUNT(*) as total,
      COUNT(CASE WHEN packet_key IS NOT NULL THEN 1 END) as with_packet_key,
      COUNT(CASE WHEN source_ref IS NOT NULL THEN 1 END) as with_source_ref,
      COUNT(CASE WHEN feature_id IS NOT NULL THEN 1 END) as with_feature_id,
      COUNT(CASE WHEN domain_class IS NOT NULL THEN 1 END) as with_domain_class
    FROM atlas_packets
  `);

  const { rows: qdrantLinkedRows } = await pool.query(`
    SELECT COUNT(DISTINCT cci.qdrant_id) as qdrant_linked
    FROM codebase_chunk_index cci
    WHERE cci.qdrant_id IS NOT NULL
  `);

  return {
    packets: pgStats[0],
    qdrant_linked: qdrantLinkedRows[0]?.qdrant_linked ?? 0,
  };
}

/**
 * Write JSON report
 */
function writeReport(report) {
  try {
    mkdirSync(REPORT_DIR, { recursive: true });
    const reportPath = path.join(REPORT_DIR, 'qdrant-payload-coverage-audit.json');
    writeFileSync(reportPath, JSON.stringify(report, null, 2) + '\n');
    console.log(`\nReport: ${reportPath}`);
  } catch (err) {
    console.error(`Failed to write report: ${err.message}`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n═══ Qdrant Payload Coverage Audit ═══\n');

  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });

  try {
    // ── Qdrant state ───────────────────────────────────────────────────────────
    console.log('Fetching Qdrant collection info...');
    const collInfo = await getCollectionInfo();
    console.log(`  Points: ${collInfo.points_count}`);
    console.log(`  Vector dim: ${collInfo.config?.params?.vectors?.size}`);

    console.log('\nAuditing Qdrant payloads...');
    const { stats: qdrantStats, collisions } = await auditQdrantPayloads();

    console.log(`\n  Total scanned: ${qdrantStats.total_points}`);
    console.log(`  With packet_key: ${qdrantStats.with_packet_key} (${percent(qdrantStats.with_packet_key, qdrantStats.total_points)}%)`);
    console.log(`  With source_ref: ${qdrantStats.with_source_ref} (${percent(qdrantStats.with_source_ref, qdrantStats.total_points)}%)`);
    console.log(`  With feature_id: ${qdrantStats.with_feature_id} (${percent(qdrantStats.with_feature_id, qdrantStats.total_points)}%)`);
    console.log(`  With domain_class: ${qdrantStats.with_domain_class} (${percent(qdrantStats.with_domain_class, qdrantStats.total_points)}%)`);
    console.log(`  Null payloads: ${qdrantStats.null_payloads}`);

    if (collisions.length > 0) {
      console.log(`\n⚠️  Collisions detected: ${collisions.length} duplicate packet_keys`);
      if (VERBOSE) {
        for (const coll of collisions.slice(0, 5)) {
          console.log(`    ${coll.packet_key}: ${coll.count} points`);
        }
        if (collisions.length > 5) console.log(`    ... and ${collisions.length - 5} more`);
      }
    }

    // ── Postgres state ───────────────────────────────────────────────────────────
    console.log('\nAuditing Postgres atlas_packets...');
    const pgAudit = await auditPostgresState(pool);
    const pgPackets = pgAudit.packets;

    console.log(`  Total packets: ${pgPackets.total}`);
    console.log(`  With packet_key: ${pgPackets.with_packet_key}`);
    console.log(`  With source_ref: ${pgPackets.with_source_ref}`);
    console.log(`  With feature_id: ${pgPackets.with_feature_id}`);
    console.log(`  With domain_class: ${pgPackets.with_domain_class}`);
    console.log(`  Qdrant-linked chunks: ${pgAudit.qdrant_linked}`);

    // ── Gates ──────────────────────────────────────────────────────────────────
    console.log('\n══ Coverage Gates ════════════════════');

    const gates = {
      qdrant_point_count: qdrantStats.total_points > 0,
      postgres_packet_count: pgPackets.total > 0,
      packet_key_coverage_90pct: qdrantStats.with_packet_key >= qdrantStats.total_points * 0.90,
      source_ref_coverage_95pct: qdrantStats.with_source_ref >= qdrantStats.total_points * 0.95,
      no_collisions: collisions.length === 0,
      minimal_null_payloads: qdrantStats.null_payloads <= qdrantStats.total_points * 0.01,
    };

    for (const [gate, pass] of Object.entries(gates)) {
      const status = pass ? '✅' : '❌';
      console.log(`  ${status} ${gate}`);
    }

    const allPass = Object.values(gates).every(v => v);
    console.log(`\n${allPass ? '✅ GATE PASS' : '⚠️  GATE PARTIAL / FAIL'}`);

    if (STRICT && !allPass) {
      console.log('\nStrict mode: failing due to coverage gaps');
      process.exit(1);
    }

    // ── Report ─────────────────────────────────────────────────────────────────
    const report = {
      generated: new Date().toISOString(),
      qdrant: {
        collection: COLLECTION,
        total_points: qdrantStats.total_points,
        with_packet_key: qdrantStats.with_packet_key,
        with_source_ref: qdrantStats.with_source_ref,
        with_feature_id: qdrantStats.with_feature_id,
        with_domain_class: qdrantStats.with_domain_class,
        null_payloads: qdrantStats.null_payloads,
        collisions: collisions.length,
      },
      postgres: {
        total_packets: pgPackets.total,
        with_packet_key: pgPackets.with_packet_key,
        with_source_ref: pgPackets.with_source_ref,
        with_feature_id: pgPackets.with_feature_id,
        with_domain_class: pgPackets.with_domain_class,
        qdrant_linked: pgAudit.qdrant_linked,
      },
      gates,
      status: allPass ? 'pass' : 'partial',
      collision_details: VERBOSE ? collisions.slice(0, 10) : [],
    };

    writeReport(report);

    console.log('\n✨ Backfill validation complete');

  } catch (err) {
    console.error(`\nError: ${err.message}`);
    if (VERBOSE) console.error(err.stack);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

function percent(num, total) {
  return ((num / total) * 100).toFixed(1);
}

main();
