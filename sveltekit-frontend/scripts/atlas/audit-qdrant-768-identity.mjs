#!/usr/bin/env node
/**
 * Phase 2/3: Qdrant 768 Identity Reconciliation Audit
 *
 * Read-only audit of all 53,381 Qdrant points against Postgres canonical state.
 * Determines whether the collection is safe for retrieval or requires rebuild/repair.
 *
 * Execution:
 *   npx tsx scripts/atlas/audit-qdrant-768-identity.mjs [--json] [--ndjson]
 *
 * Default: console summary. --json: JSON report to stdout. --ndjson: registry staging NDJSON.
 */

import { Pool } from 'pg';
import fetch from 'node-fetch';
import { loadAtlasEnv } from './load-atlas-env.mjs';

const QDRANT_URL = (process.env.QDRANT_URL ?? 'http://127.0.0.1:6333').replace(/^0\.0\.0\.0/, '127.0.0.1');
const QDRANT_COLLECTION = 'codebase_chunks_768';

const OUTPUT_FORMAT = process.argv.includes('--json') ? 'json'
  : process.argv.includes('--ndjson') ? 'ndjson'
  : 'summary';

await loadAtlasEnv();

const PG_URL = process.env.DATABASE_URL;
if (!PG_URL) {
  console.error('[FAIL] DATABASE_URL not set');
  process.exit(1);
}

const pool = new Pool({ connectionString: PG_URL });

console.log(`🔍 Phase 2/3: Qdrant 768 Identity Reconciliation Audit`);
console.log(`   Collection: ${QDRANT_COLLECTION}`);
console.log(`   Output format: ${OUTPUT_FORMAT}`);
console.log('');

// ─────────────────────────────────────────────────────────────────────────
// Scroll all Qdrant points with correct pagination
// ─────────────────────────────────────────────────────────────────────────

async function scrollAllPoints() {
  const points = [];
  let offset = null;
  let batchCount = 0;

  console.log('📍 Scrolling Qdrant collection...');

  while (true) {
    const body = {
      limit: 1000,
      with_payload: true,
      with_vector: false
    };
    if (offset !== null) {
      body.offset = offset;
    }

    const res = await fetch(
      `${QDRANT_URL}/collections/${QDRANT_COLLECTION}/points/scroll`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }
    );

    if (!res.ok) {
      throw new Error(`Qdrant scroll failed: HTTP ${res.status}`);
    }

    const data = await res.json();
    const batch = data.result?.points ?? [];

    points.push(...batch);
    offset = data.result?.next_page_offset ?? null;
    batchCount++;

    if (batchCount % 10 === 0) {
      console.log(`   Fetched ${points.length} points (batch ${batchCount})`);
    }

    if (!offset || batch.length < 1000) {
      break;
    }
  }

  console.log(`   ✅ Complete: ${points.length} total points`);
  return points;
}

// ─────────────────────────────────────────────────────────────────────────
// Load Postgres canonical identities (single query, no per-point SQL)
// ─────────────────────────────────────────────────────────────────────────

async function loadPostgresIdentities() {
  console.log('');
  console.log('📚 Loading Postgres canonical identities...');

  const res = await pool.query(`
    SELECT
      id,
      qdrant_id,
      relative_path,
      chunk_id,
      content_hash,
      embedding_model,
      updated_at
    FROM codebase_chunk_index
    WHERE content_embedding_768 IS NOT NULL
    ORDER BY id
  `);

  const rows = res.rows;
  console.log(`   ✅ Loaded ${rows.length} eligible Postgres rows`);
  return rows;
}

// ─────────────────────────────────────────────────────────────────────────
// Build lookup maps for fast joining
// ─────────────────────────────────────────────────────────────────────────

function buildLookupMaps(postgresRows) {
  const byPostgresId = new Map();
  const byChunkId = new Map();
  const byPathHash = new Map();
  const byQdrantId = new Map();

  function addMulti(map, key, value) {
    if (!key) return;
    const current = map.get(key) ?? [];
    current.push(value);
    map.set(key, current);
  }

  for (const row of postgresRows) {
    byPostgresId.set(String(row.id), row);

    if (row.chunk_id) {
      addMulti(byChunkId, row.chunk_id, row);
    }

    if (row.relative_path && row.content_hash) {
      const key = `${row.relative_path}|${row.content_hash}`;
      addMulti(byPathHash, key, row);
    }

    if (row.qdrant_id) {
      addMulti(byQdrantId, String(row.qdrant_id), row);
    }
  }

  return { byPostgresId, byChunkId, byPathHash, byQdrantId };
}

// ─────────────────────────────────────────────────────────────────────────
// Classify each Qdrant point with precedence order
// ─────────────────────────────────────────────────────────────────────────

function resolvePoint(point, lookups) {
  const p = point.payload;

  // 1. Try postgres_id exact match
  if (p.postgres_id) {
    const row = lookups.byPostgresId.get(String(p.postgres_id));
    if (row) {
      return { state: 'MATCHED_POSTGRES_ID', row, reason: 'postgres_id exact' };
    }
  }

  // 2. Try chunk_id match
  if (p.chunk_id) {
    const rows = lookups.byChunkId.get(p.chunk_id) ?? [];
    if (rows.length === 1) {
      return { state: 'MATCHED_CHUNK_ID', row: rows[0], reason: 'chunk_id unique' };
    }
    if (rows.length > 1) {
      return { state: 'MATCHED_AMBIGUOUS', candidates: rows, reason: `chunk_id ${rows.length}-way` };
    }
  }

  // 3. Try source_ref + content_hash match
  if (p.source_ref && p.content_hash) {
    const key = `${p.source_ref}|${p.content_hash}`;
    const rows = lookups.byPathHash.get(key) ?? [];
    if (rows.length === 1) {
      return { state: 'MATCHED_PATH_HASH', row: rows[0], reason: 'source_ref+hash unique' };
    }
    if (rows.length > 1) {
      return { state: 'MATCHED_AMBIGUOUS', candidates: rows, reason: `source_ref+hash ${rows.length}-way` };
    }
  }

  // 4. Try qdrant_id match (if existing Postgres UUID)
  if (p.qdrant_point_id) {
    const rows = lookups.byQdrantId.get(String(p.qdrant_point_id)) ?? [];
    if (rows.length === 1) {
      return { state: 'MATCHED_QDRANT_ID', row: rows[0], reason: 'qdrant_id unique' };
    }
  }

  return { state: 'UNMATCHED', reason: 'no matching Postgres identity' };
}

// ─────────────────────────────────────────────────────────────────────────
// Main audit flow
// ─────────────────────────────────────────────────────────────────────────

async function main() {
  try {
    const qdrantPoints = await scrollAllPoints();
    const postgresRows = await loadPostgresIdentities();
    const lookups = buildLookupMaps(postgresRows);

    console.log('');
    console.log('🔗 Classifying all Qdrant points...');

    const classifications = [];
    const stats = {
      matched_postgres_id: 0,
      matched_chunk_id: 0,
      matched_path_hash: 0,
      matched_qdrant_id: 0,
      matched_ambiguous: 0,
      unmatched: 0,
      preexisting_matched: 0,
      preexisting_unmatched: 0,
      backfill_matched: 0,
      backfill_unmatched: 0
    };

    const duplicatePostgresMappings = new Map();

    for (const point of qdrantPoints) {
      const result = resolvePoint(point, lookups);
      const sourceGen = point.id <= 1001 ? 'PREEXISTING' : 'BACKFILL';

      const classif = {
        qdrant_point_id: point.id,
        source_generation: sourceGen,
        payload_postgres_id: point.payload.postgres_id ?? null,
        payload_chunk_id: point.payload.chunk_id ?? null,
        payload_source_ref: point.payload.source_ref ?? null,
        payload_content_hash: point.payload.content_hash ?? null,
        payload_qdrant_point_id: point.payload.qdrant_point_id ?? null,
        payload_representation_id: point.payload.representation_id ?? null,
        payload_packet_version: point.payload.packet_version ?? null,
        payload_model_revision: point.payload.model_revision ?? null,
        payload_packet_key: point.payload.packet_key ?? point.payload.packetKey ?? null,
        payload_source_revision: point.payload.source_revision ?? point.payload.sourceRevision ?? null,
        payload_workspace_revision: point.payload.workspace_revision ?? point.payload.workspaceRevision ?? null,
        match_state: result.state,
        match_reason: result.reason,
        postgres_uuid: result.row?.id ?? null
      };

      classifications.push(classif);
      stats[`${result.state.toLowerCase().replace(/_/g, '_')}`]++;

      if (sourceGen === 'PREEXISTING') {
        stats[`preexisting_${result.state === 'UNMATCHED' ? 'unmatched' : 'matched'}`]++;
      } else {
        stats[`backfill_${result.state === 'UNMATCHED' ? 'unmatched' : 'matched'}`]++;
      }

      // Track duplicate Postgres mappings
      if (result.row && !['MATCHED_AMBIGUOUS', 'UNMATCHED'].includes(result.state)) {
        const pgId = String(result.row.id);
        const qdrantIds = duplicatePostgresMappings.get(pgId) ?? [];
        qdrantIds.push(point.id);
        duplicatePostgresMappings.set(pgId, qdrantIds);
      }
    }

    // Find duplicates (multiple Qdrant points mapping to same Postgres row)
    const duplicateCount = Array.from(duplicatePostgresMappings.values()).filter(ids => ids.length > 1).length;
    const reasonDistribution = (items) => items.reduce((counts, item) => {
      counts[item.match_reason] = (counts[item.match_reason] ?? 0) + 1;
      return counts;
    }, {});
    const duplicateSamples = Array.from(duplicatePostgresMappings.entries())
      .filter(([, ids]) => ids.length > 1)
      .sort((a, b) => b[1].length - a[1].length)
      .slice(0, 25)
      .map(([postgresId, qdrantPointIds]) => ({ postgres_id: postgresId, qdrant_point_ids: qdrantPointIds }));

    // Integer ID analysis
    const intIds = qdrantPoints.map(p => p.id).sort((a, b) => a - b);
    const uniqueIds = new Set(intIds);
    const gaps = [];
    for (let i = 0; i < intIds.length - 1; i++) {
      if (intIds[i + 1] - intIds[i] > 1) {
        gaps.push({ after: intIds[i], before: intIds[i + 1] });
      }
    }

    // Representation ID distribution
    const reprDist = {};
    for (const classif of classifications) {
      const key = classif.payload_representation_id ?? 'NULL';
      reprDist[key] = (reprDist[key] ?? 0) + 1;
    }

    // Packet version distribution
    const pktDist = {};
    for (const classif of classifications) {
      const key = classif.payload_packet_version ?? 'NULL';
      pktDist[key] = (pktDist[key] ?? 0) + 1;
    }

    // A canonical packet may fan out to multiple chunk-level Qdrant points.
    // Keep this separate from the legacy zero-duplicates promotion gate until
    // every point has a revision-qualified chunk bridge.
    const fanoutByPostgres = new Map();
    for (const classif of classifications) {
      if (!classif.postgres_uuid || ['MATCHED_AMBIGUOUS', 'UNMATCHED'].includes(classif.match_state)) continue;
      const entry = fanoutByPostgres.get(classif.postgres_uuid) ?? {
        point_count: 0,
        chunk_id_count: 0,
        content_hash_count: 0,
      };
      entry.point_count += 1;
      if (classif.payload_chunk_id) entry.chunk_id_count += 1;
      if (classif.payload_content_hash) entry.content_hash_count += 1;
      fanoutByPostgres.set(classif.postgres_uuid, entry);
    }
    const fanoutEntries = [...fanoutByPostgres.values()];
    const fanoutDistribution = {};
    for (const entry of fanoutEntries) {
      const key = String(entry.point_count);
      fanoutDistribution[key] = (fanoutDistribution[key] ?? 0) + 1;
    }
    const payloadFieldCounts = {
      chunk_id: classifications.filter((item) => item.payload_chunk_id).length,
      source_ref: classifications.filter((item) => item.payload_source_ref).length,
      content_hash: classifications.filter((item) => item.payload_content_hash).length,
      packet_key: classifications.filter((item) => item.payload_packet_key).length,
      source_revision: classifications.filter((item) => item.payload_source_revision).length,
      workspace_revision: classifications.filter((item) => item.payload_workspace_revision).length,
    };

    const report = {
      timestamp: new Date().toISOString(),
      collection: QDRANT_COLLECTION,
      audit_results: {
        total_qdrant_points: qdrantPoints.length,
        total_eligible_postgres_rows: postgresRows.length,
        preexisting_points: qdrantPoints.filter(p => p.id <= 1001).length,
        backfill_points: qdrantPoints.filter(p => p.id > 1001).length
      },
      classification_summary: {
        matched_postgres_id: stats.matched_postgres_id,
        matched_chunk_id: stats.matched_chunk_id,
        matched_path_hash: stats.matched_path_hash,
        matched_qdrant_id: stats.matched_qdrant_id,
        matched_ambiguous: stats.matched_ambiguous,
        unmatched: stats.unmatched
      },
      preexisting_breakdown: {
        matched: stats.preexisting_matched,
        unmatched: stats.preexisting_unmatched
      },
      backfill_breakdown: {
        matched: stats.backfill_matched,
        unmatched: stats.backfill_unmatched
      },
      integer_id_analysis: {
        minimum_id: intIds[0],
        maximum_id: intIds[intIds.length - 1],
        unique_count: uniqueIds.size,
        duplicate_ids: qdrantPoints.length - uniqueIds.size,
        id_gaps: gaps.length,
        gap_details: gaps
      },
      duplicate_postgres_mappings: duplicateCount,
      match_reason_distribution: reasonDistribution(classifications),
      ambiguous_reason_distribution: reasonDistribution(
        classifications.filter((item) => item.match_state === 'MATCHED_AMBIGUOUS'),
      ),
      unmatched_reason_distribution: reasonDistribution(
        classifications.filter((item) => item.match_state === 'UNMATCHED'),
      ),
      duplicate_postgres_mapping_samples: duplicateSamples,
      payload_field_coverage: {
        representation_id_distribution: reprDist,
        packet_version_distribution: pktDist,
        field_counts: payloadFieldCounts,
      },
      packet_fanout: {
        mapped_postgres_rows: fanoutEntries.length,
        one_point_rows: fanoutEntries.filter((entry) => entry.point_count === 1).length,
        multi_point_rows: fanoutEntries.filter((entry) => entry.point_count > 1).length,
        max_points_per_postgres_row: fanoutEntries.reduce((max, entry) => Math.max(max, entry.point_count), 0),
        fanout_distribution: fanoutDistribution,
        rows_with_chunk_id_on_every_point: fanoutEntries.filter(
          (entry) => entry.chunk_id_count === entry.point_count,
        ).length,
        rows_with_content_hash_on_every_point: fanoutEntries.filter(
          (entry) => entry.content_hash_count === entry.point_count,
        ).length,
      },
      verification_gates: {
        gate_ambiguous_matches_zero: stats.matched_ambiguous === 0,
        gate_unmatched_zero: stats.unmatched === 0,
        gate_duplicate_postgres_zero: duplicateCount === 0,
        gate_integer_ids_unique: uniqueIds.size === qdrantPoints.length,
        gate_integer_ids_continuous: gaps.length === 0
      },
      safe_for_retrieval:
        stats.matched_ambiguous === 0 &&
        stats.unmatched === 0 &&
        duplicateCount === 0 &&
        uniqueIds.size === qdrantPoints.length
    };

    // Output based on format
    if (OUTPUT_FORMAT === 'summary') {
      console.log(`📋 Reconciliation Summary:`);
      console.log('');
      console.log(`  Collection: ${report.collection} (${report.audit_results.total_qdrant_points} points)`);
      console.log(`    Preexisting (ID 1-1001): ${report.audit_results.preexisting_points}`);
      console.log(`    Backfill (ID 1002+): ${report.audit_results.backfill_points}`);
      console.log(`    Postgres eligible rows: ${report.audit_results.total_eligible_postgres_rows}`);
      console.log('');
      console.log(`  Classification Results:`);
      console.log(`    Matched (all types): ${report.audit_results.total_qdrant_points - stats.matched_ambiguous - stats.unmatched}`);
      console.log(`    Ambiguous: ${stats.matched_ambiguous}`);
      console.log(`    Unmatched: ${stats.unmatched}`);
      console.log('');
      console.log(`  Data Quality:`);
      console.log(`    Duplicate Postgres mappings: ${duplicateCount}`);
      console.log(`    Integer ID gaps: ${gaps.length}`);
      console.log(`    Duplicate integer IDs: ${qdrantPoints.length - uniqueIds.size}`);
      console.log('');
      console.log(`  Verification Gates:`);
      console.log(`    ✓ Ambiguous matches = 0: ${report.verification_gates.gate_ambiguous_matches_zero}`);
      console.log(`    ✓ Unmatched = 0: ${report.verification_gates.gate_unmatched_zero}`);
      console.log(`    ✓ Duplicate Postgres mappings = 0: ${report.verification_gates.gate_duplicate_postgres_zero}`);
      console.log(`    ✓ Integer IDs unique: ${report.verification_gates.gate_integer_ids_unique}`);
      console.log(`    ✓ Integer IDs continuous: ${report.verification_gates.gate_integer_ids_continuous}`);
      console.log('');
      console.log(`  Decision: ${report.safe_for_retrieval ? '✅ SAFE FOR RETRIEVAL' : '❌ REQUIRES REBUILD OR REPAIR'}`);

      if (!report.safe_for_retrieval) {
        console.log('');
        console.log(`⚠️  Blockers:`);
        if (stats.matched_ambiguous > 0) console.log(`    - ${stats.matched_ambiguous} ambiguous matches (need resolution)`);
        if (stats.unmatched > 0) console.log(`    - ${stats.unmatched} unmatched points (not in Postgres)`);
        if (duplicateCount > 0) console.log(`    - ${duplicateCount} Postgres rows have multiple Qdrant points`);
        if (!report.verification_gates.gate_integer_ids_unique) console.log(`    - Duplicate integer point IDs detected`);
        if (!report.verification_gates.gate_integer_ids_continuous) console.log(`    - Integer ID gaps detected (unsafe allocation)`);
      }
    } else if (OUTPUT_FORMAT === 'json') {
      console.log(JSON.stringify(report, null, 2));
    } else if (OUTPUT_FORMAT === 'ndjson') {
      for (const classif of classifications) {
        console.log(JSON.stringify({
          collection_name: QDRANT_COLLECTION,
          source_id: classif.postgres_uuid,
          qdrant_point_id: classif.qdrant_point_id,
          payload_identity: `${classif.payload_source_ref}|${classif.payload_content_hash}`,
          content_hash: classif.payload_content_hash,
          representation_id: classif.payload_representation_id,
          projection_revision: classif.payload_model_revision,
          state: classif.match_state,
          match_reason: classif.match_reason,
          source_generation: classif.source_generation
        }));
      }
    }

    await pool.end();
    process.exit(report.safe_for_retrieval ? 0 : 1);
  } catch (err) {
    console.error('❌ Audit failed:', err.message);
    await pool.end();
    process.exit(1);
  }
}

main();
