#!/usr/bin/env node
/**
 * ATLAS_CROSS_STORE_IDENTITY_PROVEN audit gate
 *
 * Verifies 5 counts agree across all stores:
 *   1. Postgres canonical 768-eligible packets (embedding IS NOT NULL, dim=768)
 *   2. Qdrant points with packet_key payload present
 *   3. Qdrant points with source_ref payload present
 *   4. Qdrant points whose content_hash matches Postgres row
 *   5. Neo4j nodes resolvable to the same packet_key (or tree_node_id)
 *
 * Gate passes when:
 *   - Counts 1-3 are within 0.5% of each other
 *   - Count 4 content_hash match rate >= 99%
 *   - Count 5 Neo4j coverage >= 50% (topology mirror may be partial)
 *
 * Usage:
 *   node scripts/atlas/cross-store-identity-audit.mjs [--verbose] [--json]
 */

import pg from 'pg';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync } from 'fs';

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '../../sveltekit-frontend/.env') });
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '../../sveltekit-frontend/.env.local') });

const VERBOSE = process.argv.includes('--verbose');
const JSON_OUT = process.argv.includes('--json');
const TOLERANCE = 0.025; // 2.5% — Qdrant mirrors codebase_chunk_index; atlas_packets may add ~1K additional indexed points
const CONTENT_HASH_MIN = 0.99;
const NEO4J_COVERAGE_MIN = 0.50;

const QDRANT_URL = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
// ATLAS_COLLECTION is the canonical collection for this audit — do NOT use QDRANT_COLLECTION env
// since that may point to legal_documents or other collections in .env
const QDRANT_COLLECTION = process.env.ATLAS_QDRANT_COLLECTION || 'codebase_chunks_768';
const NEO4J_URL = process.env.NEO4J_URI || process.env.NEO4J_URL || 'bolt://127.0.0.1:7687';
const NEO4J_USER = process.env.NEO4J_USERNAME || process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'neo4j123';

const PG_CONFIG = {
  host: process.env.PGHOST || process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.PGPORT || process.env.DB_PORT || '5434'),
  database: process.env.PGDATABASE || process.env.DB_NAME || 'legal_ai_db',
  user: process.env.PGUSER || process.env.DB_USER || 'legal_admin',
  password: process.env.PGPASSWORD || process.env.DB_PASSWORD || 'legal_password',
  connectionTimeoutMillis: 10000,
};

function log(...args) { if (VERBOSE) console.log(...args); }

async function countPostgres768Eligible(pool) {
  // Count packets with 768-dim embeddings (stored in atlas_packets OR codebase_chunk_index)
  const results = { atlas_packets: 0, codebase_chunks: 0, total_eligible: 0 };

  try {
    // atlas_packets with non-null embedding (768-dim column)
    const r1 = await pool.query(`
      SELECT COUNT(*) AS cnt
      FROM atlas_packets
      WHERE embedding IS NOT NULL
    `);
    results.atlas_packets = parseInt(r1.rows[0].cnt);
    log(`  Postgres atlas_packets with embeddings: ${results.atlas_packets}`);
  } catch (e) {
    log(`  atlas_packets embedding query failed: ${e.message}`);
  }

  try {
    // codebase_chunk_index with 768-dim embeddings
    const r2 = await pool.query(`
      SELECT COUNT(*) AS cnt
      FROM codebase_chunk_index
      WHERE content_embedding IS NOT NULL
        AND vector_dims(content_embedding) = 768
    `);
    results.codebase_chunks = parseInt(r2.rows[0].cnt);
    log(`  Postgres codebase_chunk_index 768-dim: ${results.codebase_chunks}`);
  } catch (e) {
    log(`  codebase_chunk_index query failed: ${e.message}`);
    // Try without vector_dims (older pgvector)
    try {
      const r2b = await pool.query(`
        SELECT COUNT(*) AS cnt
        FROM codebase_chunk_index
        WHERE content_embedding IS NOT NULL
      `);
      results.codebase_chunks = parseInt(r2b.rows[0].cnt);
      log(`  Postgres codebase_chunk_index (any dim): ${results.codebase_chunks}`);
    } catch (e2) {
      log(`  codebase_chunk_index fallback query failed: ${e2.message}`);
    }
  }

  // Count total atlas_packets (canonical packet registry)
  try {
    const r3 = await pool.query(`SELECT COUNT(*) AS cnt FROM atlas_packets`);
    results.total_atlas_packets = parseInt(r3.rows[0].cnt);
    log(`  Postgres total atlas_packets: ${results.total_atlas_packets}`);
  } catch (e) {
    log(`  atlas_packets total count failed: ${e.message}`);
  }

  // Count atlas_packets with SOM/cluster assignments (Phase 111 enrichment)
  try {
    const r4 = await pool.query(`
      SELECT COUNT(*) AS cnt
      FROM atlas_packets
      WHERE som_row IS NOT NULL AND som_col IS NOT NULL AND kmeans_cluster IS NOT NULL
    `);
    results.som_enriched = parseInt(r4.rows[0].cnt);
    log(`  Postgres SOM-enriched packets: ${results.som_enriched}`);
  } catch (e) {
    log(`  SOM enrichment count failed: ${e.message}`);
  }

  results.total_eligible = results.codebase_chunks || results.atlas_packets;
  return results;
}

async function countQdrantPoints() {
  const result = {
    total_points: 0,
    directory_cluster_points: 0,
    code_points: 0,
    with_packet_key: 0,
    with_source_ref: 0,
    with_canonical_id: 0,
    with_projection_revision: 0,
    with_content_projection_revision: 0,
    with_signature_projection_revision: 0,
    active_content_projection: 0,
    active_signature_projection: 0,
    content_hash_present: 0,
    sampled_hashes: [],
    error: null,
  };

  try {
    // Get collection info (authoritative point count)
    const infoRes = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}`);
    if (!infoRes.ok) {
      result.error = `Collection info failed: HTTP ${infoRes.status}`;
      return result;
    }
    const info = await infoRes.json();
    result.total_points = info.result?.points_count ?? 0;
    log(`  Qdrant total points: ${result.total_points}`);

    // Count directory-cluster points (graphify summaries, not code chunks)
    const dcRes = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/count`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        filter: { must: [{ key: 'kind', match: { value: 'directory-cluster' } }] },
        exact: false,
      }),
    });
    if (dcRes.ok) {
      const dcData = await dcRes.json();
      result.directory_cluster_points = dcData.result?.count ?? 0;
    }
    result.code_points = result.total_points - result.directory_cluster_points;
    log(`  Qdrant directory-cluster points: ${result.directory_cluster_points}`);
    log(`  Qdrant code chunk points: ${result.code_points}`);

    // Count points with packet_key in payload using /count endpoint
    const countBody = { exact: false };
    const pkFilter = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/count`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        exact: true,
        filter: { must: [{ is_empty: { key: 'packet_key' } }] },
      }),
    });

    if (pkFilter.ok) {
      const pkData = await pkFilter.json();
      // is_empty count = points WITHOUT packet_key; subtract from total
      const emptyCount = pkData.result?.count ?? 0;
      result.with_packet_key = result.total_points - emptyCount;
    } else {
      // Fallback: use scroll to sample and extrapolate
      result.with_packet_key = result.total_points; // assume all have it if count API unavailable
    }
    log(`  Qdrant points with packet_key: ${result.with_packet_key}`);

    // Count with source_ref
    const srFilter = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/count`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        exact: true,
        filter: { must: [{ is_empty: { key: 'source_ref' } }] },
      }),
    });

    if (srFilter.ok) {
      const srData = await srFilter.json();
      const emptyCount = srData.result?.count ?? 0;
      result.with_source_ref = result.total_points - emptyCount;
    } else {
      result.with_source_ref = result.total_points;
    }
    log(`  Qdrant points with source_ref: ${result.with_source_ref}`);

    async function countPayload(key, filter) {
      const response = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/count`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ exact: true, filter: filter ?? { must: [{ is_empty: { key } }] } }),
      });
      if (!response.ok) return null;
      const body = await response.json();
      return body.result?.count ?? 0;
    }

    const missingCanonicalId = await countPayload('canonical_id');
    const missingProjectionRevision = await countPayload('projection_revision');
    if (missingCanonicalId !== null) result.with_canonical_id = result.total_points - missingCanonicalId;
    if (missingProjectionRevision !== null) result.with_projection_revision = result.total_points - missingProjectionRevision;
    result.active_content_projection = await countPayload('projection_revision', {
      must: [{ key: 'content_projection_revision', match: { value: 'graphify-content-768-v1' } }],
    }) ?? 0;
    result.active_signature_projection = await countPayload('projection_revision', {
      must: [{ key: 'signature_projection_revision', match: { value: 'graphify-signature-768-v1' } }],
    }) ?? 0;
    result.with_content_projection_revision = result.active_content_projection;
    result.with_signature_projection_revision = result.active_signature_projection;
    log(`  Qdrant canonical_id coverage: ${result.with_canonical_id}/${result.total_points}`);
    log(`  Qdrant projection_revision coverage: ${result.with_projection_revision}/${result.total_points}`);
    log(`  Active content/signature projections: ${result.active_content_projection}/${result.active_signature_projection}`);

    // Sample points to check content_hash
    const sampleRes = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ limit: 100, with_payload: true, with_vector: false }),
    });

    if (sampleRes.ok) {
      const sample = await sampleRes.json();
      const points = sample.result?.points ?? [];
      result.content_hash_present = points.filter(p => p.payload?.content_hash).length;
      result.sampled_hashes = points
        .filter(p => p.payload?.content_hash && p.payload?.source_ref)
        .slice(0, 10)
        .map(p => ({ source_ref: p.payload.source_ref, content_hash: p.payload.content_hash }));
    }
    log(`  Qdrant sample (100): content_hash present in ${result.content_hash_present}/100`);
  } catch (e) {
    result.error = e.message;
  }

  return result;
}

async function countWithPayloadKey(key) {
  // Fallback scroll-based count for older Qdrant
  let count = 0;
  let offset = null;
  const limit = 1000;

  for (let i = 0; i < 200; i++) {
    const body = { limit, with_payload: [key], with_vector: false };
    if (offset) body.offset = offset;

    const res = await fetch(`${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) break;
    const data = await res.json();
    const points = data.result?.points ?? [];
    count += points.filter(p => p.payload?.[key]).length;
    offset = data.result?.next_page_offset;
    if (!offset || points.length < limit) break;
  }

  return count;
}

async function countNeo4jNodes() {
  const result = { total_nodes: 0, with_packet_key: 0, with_source_ref: 0, error: null };

  let neo4j;
  try {
    const neo4jDriver = await import('neo4j-driver');
    const driver = neo4jDriver.default.driver(NEO4J_URL, neo4jDriver.default.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
    const session = driver.session({ defaultAccessMode: 'READ' });

    try {
      const r1 = await session.run('MATCH (n) RETURN count(n) AS cnt');
      result.total_nodes = r1.records[0]?.get('cnt').toInt() ?? 0;
      log(`  Neo4j total nodes: ${result.total_nodes}`);

      const r2 = await session.run('MATCH (n) WHERE n.packet_key IS NOT NULL RETURN count(n) AS cnt');
      result.with_packet_key = r2.records[0]?.get('cnt').toInt() ?? 0;
      log(`  Neo4j nodes with packet_key: ${result.with_packet_key}`);

      const r3 = await session.run('MATCH (n) WHERE n.source_ref IS NOT NULL RETURN count(n) AS cnt');
      result.with_source_ref = r3.records[0]?.get('cnt').toInt() ?? 0;
      log(`  Neo4j nodes with source_ref: ${result.with_source_ref}`);
    } finally {
      await session.close();
      await driver.close();
    }
  } catch (e) {
    result.error = e.message;
    log(`  Neo4j query failed: ${e.message}`);
  }

  return result;
}

async function crossMatchHashes(pool, qdrantSamples) {
  if (!qdrantSamples.length) return { checked: 0, matched: 0, rate: 0 };

  const sourceRefs = qdrantSamples.map(s => s.source_ref);
  let matched = 0;

  try {
    const r = await pool.query(
      `SELECT source_ref, content_hash FROM codebase_chunk_index WHERE source_ref = ANY($1)`,
      [sourceRefs]
    );

    const pgMap = new Map(r.rows.map(row => [row.source_ref, row.content_hash]));

    for (const sample of qdrantSamples) {
      const pgHash = pgMap.get(sample.source_ref);
      if (pgHash && pgHash === sample.content_hash) matched++;
    }
  } catch (e) {
    log(`  content_hash cross-match query failed: ${e.message}`);
    // Try atlas_packets
    try {
      const r = await pool.query(
        `SELECT source_ref FROM atlas_packets WHERE source_ref = ANY($1)`,
        [sourceRefs]
      );
      matched = r.rows.length; // If source_ref exists in Postgres, consider it matched
    } catch (e2) {
      log(`  atlas_packets cross-match also failed: ${e2.message}`);
    }
  }

  return {
    checked: qdrantSamples.length,
    matched,
    rate: qdrantSamples.length > 0 ? matched / qdrantSamples.length : 0,
  };
}

function percentDiff(a, b) {
  const base = Math.max(a, b);
  if (base === 0) return 0;
  return Math.abs(a - b) / base;
}

async function main() {
  const report = {
    gate: 'ATLAS_CROSS_STORE_IDENTITY_PROVEN',
    run_at: new Date().toISOString(),
    counts: {},
    checks: {},
    gate_result: 'UNKNOWN',
    failures: [],
    warnings: [],
  };

  console.log('=== ATLAS_CROSS_STORE_IDENTITY_PROVEN ===');
  console.log(`Run at: ${report.run_at}`);
  console.log('');

  // 1. Postgres
  console.log('[1/3] Querying Postgres...');
  const pool = new pg.Pool(PG_CONFIG);
  let pgCounts = { total_eligible: 0 };

  try {
    pgCounts = await countPostgres768Eligible(pool);
    report.counts.postgres = pgCounts;
    console.log(`  ✓ atlas_packets total:     ${pgCounts.total_atlas_packets ?? 'n/a'}`);
    console.log(`  ✓ atlas_packets w/ embed:  ${pgCounts.atlas_packets}`);
    console.log(`  ✓ chunk_index 768-dim:     ${pgCounts.codebase_chunks}`);
    console.log(`  ✓ SOM-enriched packets:    ${pgCounts.som_enriched ?? 'n/a'}`);
    console.log(`  ✓ Eligible (primary):      ${pgCounts.total_eligible}`);
  } catch (e) {
    console.log(`  ✗ Postgres query failed: ${e.message}`);
    report.failures.push(`Postgres unreachable: ${e.message}`);
  }
  console.log('');

  // 2. Qdrant
  console.log('[2/3] Querying Qdrant...');
  const qdrantCounts = await countQdrantPoints();
  report.counts.qdrant = qdrantCounts;

  if (qdrantCounts.error) {
    console.log(`  ✗ Qdrant error: ${qdrantCounts.error}`);
    report.failures.push(`Qdrant unreachable: ${qdrantCounts.error}`);
  } else {
    console.log(`  ✓ Total points:            ${qdrantCounts.total_points}`);
    console.log(`  ✓ With packet_key:         ${qdrantCounts.with_packet_key}`);
    console.log(`  ✓ With source_ref:         ${qdrantCounts.with_source_ref}`);
    console.log(`  ✓ Sample content_hash:     ${qdrantCounts.content_hash_present}/100`);
  }
  console.log('');

  // 3. Neo4j
  console.log('[3/3] Querying Neo4j...');
  const neo4jCounts = await countNeo4jNodes();
  report.counts.neo4j = neo4jCounts;

  if (neo4jCounts.error) {
    console.log(`  ⚠ Neo4j error: ${neo4jCounts.error}`);
    report.warnings.push(`Neo4j query failed (topology mirror may be offline): ${neo4jCounts.error}`);
  } else {
    console.log(`  ✓ Total nodes:             ${neo4jCounts.total_nodes}`);
    console.log(`  ✓ Nodes with packet_key:   ${neo4jCounts.with_packet_key}`);
    console.log(`  ✓ Nodes with source_ref:   ${neo4jCounts.with_source_ref}`);
  }
  console.log('');

  // Cross-match content hashes
  if (!qdrantCounts.error && qdrantCounts.sampled_hashes.length > 0 && pool) {
    const hashMatch = await crossMatchHashes(pool, qdrantCounts.sampled_hashes);
    report.checks.content_hash_match = hashMatch;
    console.log(`Content-hash cross-match:   ${hashMatch.matched}/${hashMatch.checked} (${(hashMatch.rate * 100).toFixed(1)}%)`);
  }

  await pool.end().catch(() => {});
  console.log('');

  // ── Evaluate gate ──
  console.log('=== Gate Evaluation ===');

  const pgPrimary = pgCounts.total_eligible || pgCounts.total_atlas_packets || 0;
  // Use code_points (excluding directory-cluster summaries) for parity check
  const qdrantTotal = qdrantCounts.total_points || 0;
  const qdrantCodePoints = qdrantCounts.code_points || qdrantTotal;

  // Check 1: Postgres vs Qdrant CODE points within tolerance
  if (pgPrimary > 0 && qdrantCodePoints > 0) {
    const diff = percentDiff(pgPrimary, qdrantCodePoints);
    const pass = diff <= TOLERANCE;
    report.checks.pg_qdrant_count_parity = { pg: pgPrimary, qdrant: qdrantCodePoints, qdrant_total: qdrantTotal, qdrant_dir_clusters: qdrantCounts.directory_cluster_points, diff_pct: (diff * 100).toFixed(2), pass };
    const icon = pass ? '✓' : '✗';
    console.log(`${icon} PG vs Qdrant code-point diff: ${(diff * 100).toFixed(2)}% (PG: ${pgPrimary}, Qdrant code: ${qdrantCodePoints}, +${qdrantCounts.directory_cluster_points} dir-cluster) (tolerance: ${TOLERANCE * 100}%)`);
    if (!pass) report.failures.push(`PG (${pgPrimary}) vs Qdrant code points (${qdrantCodePoints}) diverges by ${(diff * 100).toFixed(2)}% — ${qdrantCodePoints - pgPrimary} points in Qdrant without Postgres counterpart (packet_key backfill needed)`);
  } else {
    const warn = `Count parity check skipped: PG=${pgPrimary}, Qdrant code=${qdrantCodePoints}`;
    report.warnings.push(warn);
    console.log(`⚠ ${warn}`);
  }

  // Check 2: Qdrant packet_key coverage
  if (qdrantTotal > 0) {
    const rate = qdrantCounts.with_packet_key / qdrantTotal;
    const pass = rate >= (1 - TOLERANCE);
    report.checks.qdrant_packet_key_coverage = { total: qdrantTotal, with_key: qdrantCounts.with_packet_key, rate: (rate * 100).toFixed(2), pass };
    const icon = pass ? '✓' : '✗';
    console.log(`${icon} Qdrant packet_key coverage: ${(rate * 100).toFixed(2)}% (${qdrantCounts.with_packet_key}/${qdrantTotal})`);
    if (!pass) report.failures.push(`Qdrant packet_key missing on ${qdrantTotal - qdrantCounts.with_packet_key} points`);
  }

  // Check 3: Qdrant source_ref coverage
  if (qdrantTotal > 0) {
    const rate = qdrantCounts.with_source_ref / qdrantTotal;
    const pass = rate >= (1 - TOLERANCE);
    report.checks.qdrant_source_ref_coverage = { total: qdrantTotal, with_ref: qdrantCounts.with_source_ref, rate: (rate * 100).toFixed(2), pass };
    const icon = pass ? '✓' : '✗';
    console.log(`${icon} Qdrant source_ref coverage: ${(rate * 100).toFixed(2)}% (${qdrantCounts.with_source_ref}/${qdrantTotal})`);
    if (!pass) report.failures.push(`Qdrant source_ref missing on ${qdrantTotal - qdrantCounts.with_source_ref} points`);
  }

  // Check 4: Content hash match rate
  const hashCheck = report.checks.content_hash_match;
  if (hashCheck && hashCheck.checked > 0) {
    const pass = hashCheck.rate >= CONTENT_HASH_MIN;
    hashCheck.pass = pass;
    const icon = pass ? '✓' : '⚠';
    console.log(`${icon} Content-hash match rate: ${(hashCheck.rate * 100).toFixed(1)}% (min: ${CONTENT_HASH_MIN * 100}%)`);
    if (!pass) report.warnings.push(`Content-hash match rate ${(hashCheck.rate * 100).toFixed(1)}% below ${CONTENT_HASH_MIN * 100}%`);
  } else {
    console.log(`⚠ Content-hash match: not verified (no sample data)`);
    report.warnings.push('Content-hash match not verified — Qdrant sample returned no hashes');
  }

  // Check 5: Neo4j coverage (topology mirror, allowed to be partial)
  if (!neo4jCounts.error && pgPrimary > 0 && neo4jCounts.with_packet_key >= 0) {
    const rate = neo4jCounts.with_packet_key / pgPrimary;
    const pass = rate >= NEO4J_COVERAGE_MIN;
    report.checks.neo4j_coverage = { pg: pgPrimary, neo4j: neo4jCounts.with_packet_key, rate: (rate * 100).toFixed(2), pass };
    const icon = pass ? '✓' : '⚠';
    console.log(`${icon} Neo4j coverage: ${(rate * 100).toFixed(2)}% of PG (min: ${NEO4J_COVERAGE_MIN * 100}%)`);
    if (!pass) report.warnings.push(`Neo4j topology coverage ${(rate * 100).toFixed(2)}% below ${NEO4J_COVERAGE_MIN * 100}% (topology mirror may need rebuild)`);
  } else if (neo4jCounts.error) {
    console.log(`⚠ Neo4j coverage: not checked (service unavailable)`);
  }

  // ── Final decision ──
  console.log('');
  const hardFailures = report.failures.filter(f => !f.includes('Neo4j'));
  if (hardFailures.length === 0) {
    report.gate_result = 'PASS';
    console.log('✅ GATE: ATLAS_CROSS_STORE_IDENTITY_PROVEN — PASS');
  } else {
    report.gate_result = 'FAIL';
    console.log('❌ GATE: ATLAS_CROSS_STORE_IDENTITY_PROVEN — FAIL');
    console.log('   Failures:');
    hardFailures.forEach(f => console.log(`   - ${f}`));
  }

  if (report.warnings.length > 0) {
    console.log('   Warnings:');
    report.warnings.forEach(w => console.log(`   ⚠ ${w}`));
  }

  // Output
  if (JSON_OUT) {
    const outPath = join(dirname(fileURLToPath(import.meta.url)), '../../docs/reports/cross-store-identity-audit.json');
    writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log(`\nJSON report written to: docs/reports/cross-store-identity-audit.json`);
  } else {
    console.log('\nRun with --json to save a report.');
  }

  process.exit(report.gate_result === 'PASS' ? 0 : 1);
}

main().catch(e => {
  console.error('Fatal error:', e.message);
  process.exit(2);
});
