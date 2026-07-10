#!/usr/bin/env node
/**
 * P2 — Qdrant Payload Sync: Topology Signals
 *
 * Verifies and syncs lineage, topology, and graph-authority fields from
 * canonical Postgres packets to Qdrant codebase_chunks_768 payloads.
 *
 * Usage:
 *   npm run atlas:p2:qdrant-payload-sync:verify      # Dry-run audit
 *   npm run atlas:p2:qdrant-payload-sync:sync         # Apply backfill
 *   npm run atlas:p2:qdrant-payload-sync:verify:full  # Full scan (no sampling)
 *
 * Entry point: HTTP API client (fetch), not docker exec
 * Reason: Type-safe, batching, proper error handling, schema validation
 */

import fetch from 'node-fetch';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from '../../../scripts/atlas/connection-config.mjs';

const __dir = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dir, '../..');

const env = loadRepoEnv(process.env);
const QDRANT_URL = env.QDRANT_URL || 'http://127.0.0.1:6333';
const COLLECTION = 'codebase_chunks_768';
const BATCH_SIZE = 100;
const LIMIT_ARG = process.argv.find((arg) => arg.startsWith('--limit='));
const SAMPLE_SIZE = LIMIT_ARG
  ? Number.parseInt(LIMIT_ARG.slice('--limit='.length), 10)
  : process.argv.includes('--full') ? 50000 : 500;
const DRY_RUN = !process.argv.includes('--apply');

// Topology fields to sync (P2 contract)
const TOPOLOGY_FIELDS = [
  'tree_node_id',
  'parent_packet_key',
  'topolog_cluster',
  'som_cluster',
  'som_row',
  'som_col',
  'som_index',
  'kmeans_cluster',
  'community_id',
  'page_rank_score',
];
const TARGET_COVERAGE = {
  tree_node_id: 0.95,
  parent_packet_key: 0.0,
  topolog_cluster: 0.66,
  som_cluster: 0.66,
  som_row: 0.95,
  som_col: 0.95,
  som_index: 0.95,
  kmeans_cluster: 0.95,
  community_id: 0.90,
  page_rank_score: 0.90,
};

function isMissing(value) {
  return value === null || value === undefined || value === '';
}

function qdrantPointId(value) {
  const text = String(value ?? '').trim();
  if (!text) return null;
  if (/^\d+$/.test(text)) {
    const number = Number(text);
    return Number.isSafeInteger(number) ? number : null;
  }
  return text;
}

function canonicalPayload(row) {
  return Object.fromEntries([
    ['packet_key', row.packet_key],
    ['source_ref', row.source_ref],
    ['feature_id', row.feature_id],
    ['feature_label', row.feature_label],
    ['title_id', row.title_id],
    ...TOPOLOGY_FIELDS.map((field) => [field, row[field]]),
  ].filter(([, value]) => !isMissing(value)));
}

console.log(`\n═══ P2: Qdrant Payload Sync — Topology Signals ═══\n`);
console.log(`Collection: ${COLLECTION}`);
console.log(`URL: ${QDRANT_URL}`);
console.log(`Fields: ${TOPOLOGY_FIELDS.join(', ')}`);
console.log(`Mode: ${DRY_RUN ? 'VERIFY (dry-run)' : 'SYNC (apply backfill)'}`);
console.log(`Sample size: ${SAMPLE_SIZE}\n`);

// 1. Connect to Postgres (truth source)
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(env) });

// 2. Verify Qdrant connection via HTTP API
async function verifyQdrantConnection() {
  try {
    const ready = await fetch(`${QDRANT_URL}/readyz`, { signal: AbortSignal.timeout(5000) });
    if (!ready.ok) {
      const collection = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`, {
        signal: AbortSignal.timeout(5000),
      });
      if (!collection.ok) throw new Error(`Qdrant readiness failed: ${ready.status}; collection probe: ${collection.status}`);
    }
    console.log(`✅ Qdrant connection OK\n`);
    return true;
  } catch (err) {
    console.error(`❌ Qdrant connection failed: ${err.message}\n`);
    return false;
  }
}

// 3. Get Qdrant collection stats
async function getCollectionStats() {
  const res = await fetch(`${QDRANT_URL}/collections/${COLLECTION}`);
  if (!res.ok) {
    throw new Error(`Qdrant ${res.status}: ${await res.text()}`);
  }
  const { result } = await res.json();
  return {
    pointsCount: result.points_count,
    vectorsCount: result.vectors_count,
    indexedVectorsCount: result.indexed_vectors_count
  };
}

// 4. Audit payload coverage
async function auditPayloadCoverage() {
  console.log('📊 Auditing payload coverage...\n');

  const stats = await getCollectionStats();
  console.log(`Total points: ${stats.pointsCount.toLocaleString()}`);
  console.log(`Indexed vectors: ${stats.indexedVectorsCount.toLocaleString()}\n`);

  const fieldCoverage = {};
  TOPOLOGY_FIELDS.forEach(f => {
    fieldCoverage[f] = { present: 0, missing: 0, null: 0 };
  });

  let scrollOffset = null;
  let pointsScanned = 0;
  const samplePoints = [];

  while (pointsScanned < SAMPLE_SIZE) {
    const scrollRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/scroll`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        limit: Math.min(500, SAMPLE_SIZE - pointsScanned),
        offset: scrollOffset,
        with_payload: true
      })
    });

    if (!scrollRes.ok) {
      throw new Error(`Scroll ${scrollRes.status}`);
    }

    const { result } = await scrollRes.json();
    if (!result.points || result.points.length === 0) break;

    for (const point of result.points) {
      const payload = point.payload || {};
      samplePoints.push({
        id: point.id,
        packet_key: payload.packet_key,
        ...Object.fromEntries(TOPOLOGY_FIELDS.map((field) => [field, payload[field]])),
      });

      // Count coverage
      TOPOLOGY_FIELDS.forEach(field => {
        if (isMissing(payload[field])) {
          fieldCoverage[field].missing++;
        } else {
          fieldCoverage[field].present++;
        }
      });

      pointsScanned++;
    }

    scrollOffset = result.next_page_offset;
    if (!scrollOffset) break;
  }

  console.log('Field Coverage (sample of ' + pointsScanned.toLocaleString() + '):');
  TOPOLOGY_FIELDS.forEach(field => {
    const { present, missing } = fieldCoverage[field];
    const coverage = present / (present + missing);
    const target = TARGET_COVERAGE[field];
    const status = coverage >= target ? '✅' : '⚠️';
    console.log(
      `  ${status} ${field}: ${coverage.toFixed(1)}% (${present}/${present + missing}) [target: ${(target * 100).toFixed(0)}%]`
    );
  });

  return { samplePoints, fieldCoverage, pointsScanned };
}

// 5. Load canonical packets from Postgres
async function loadCanonicalPackets(packet_keys) {
  const query = `
    SELECT
      packet_key,
      tree_node_id::text AS tree_node_id,
      parent_packet_key,
      topolog_cluster,
      som_cluster,
      som_row,
      som_col,
      som_index,
      kmeans_cluster,
      community_id,
      page_rank_score
    FROM atlas_packets
    WHERE packet_key = ANY($1::text[])
  `;

  const result = await pool.query(query, [packet_keys]);
  return result.rows.reduce((acc, row) => {
    acc[row.packet_key] = {
      tree_node_id: row.tree_node_id,
      parent_packet_key: row.parent_packet_key,
      topolog_cluster: row.topolog_cluster,
      som_cluster: row.som_cluster,
      som_row: row.som_row,
      som_col: row.som_col,
      som_index: row.som_index,
      kmeans_cluster: row.kmeans_cluster,
      community_id: row.community_id,
      page_rank_score: row.page_rank_score,
    };
    return acc;
  }, {});
}

async function loadCanonicalPointsDirect(limit) {
  const result = await pool.query(`
    WITH eligible AS (
      SELECT
        qdrant_point_id,
        COUNT(*) OVER (PARTITION BY qdrant_point_id) AS point_owners,
        packet_key,
        source_ref,
        feature_id,
        feature_label,
        title_id,
        tree_node_id::text AS tree_node_id,
        parent_packet_key,
        topolog_cluster,
        som_cluster,
        som_row,
        som_col,
        som_index,
        kmeans_cluster,
        community_id,
        page_rank_score,
        updated_at
      FROM atlas_packets
      WHERE qdrant_point_id IS NOT NULL
        AND LENGTH(TRIM(qdrant_point_id)) > 0
    )
    SELECT *
    FROM eligible
    ORDER BY qdrant_point_id, updated_at DESC NULLS LAST, packet_key
    LIMIT $1
  `, [limit]);

  const ambiguous = result.rows.filter((row) => Number(row.point_owners) > 1);
  const rows = result.rows.filter((row) => Number(row.point_owners) === 1 && qdrantPointId(row.qdrant_point_id) !== null);
  return { rows, ambiguous };
}

async function syncCanonicalByPointId(limit) {
  const { rows, ambiguous } = await loadCanonicalPointsDirect(limit);
  console.log(`Direct Postgres bridge: ${rows.length} unique point IDs, ${ambiguous.length} ambiguous rows`);

  let synced = 0;
  let failed = 0;
  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    const operations = batch.map((row) => ({
      set_payload: {
        payload: canonicalPayload(row),
        points: [qdrantPointId(row.qdrant_point_id)],
      },
    }));

    if (DRY_RUN) {
      synced += operations.length;
      console.log(`[DRY-RUN] Would patch ${operations.length} existing points in batch ${Math.floor(i / BATCH_SIZE) + 1}`);
      continue;
    }

    const response = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/batch?wait=true`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ operations }),
    });
    if (!response.ok) {
      failed += operations.length;
      console.error(`Batch ${Math.floor(i / BATCH_SIZE) + 1} failed: ${response.status} ${await response.text()}`);
      continue;
    }
    synced += operations.length;
    console.log(`Patched ${operations.length} existing points in batch ${Math.floor(i / BATCH_SIZE) + 1}`);
  }

  let verification = null;
  if (!DRY_RUN && synced > 0) {
    const sample = rows.slice(0, Math.min(20, rows.length));
    const response = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ids: sample.map((row) => qdrantPointId(row.qdrant_point_id)),
        with_payload: true,
        with_vector: false,
      }),
    });
    if (response.ok) {
      const payload = await response.json();
      const returned = payload.result ?? [];
      const byId = new Map(returned.map((point) => [String(point.id), point.payload ?? {}]));
      verification = {
        requested: sample.length,
        returned: returned.length,
        packet_key_matches: sample.filter((row) => byId.get(String(row.qdrant_point_id))?.packet_key === row.packet_key).length,
        tree_node_id_matches: sample.filter((row) => byId.get(String(row.qdrant_point_id))?.tree_node_id === row.tree_node_id).length,
        som_coordinates_present: sample.filter((row) => {
          const point = byId.get(String(row.qdrant_point_id));
          return point?.som_row != null && point?.som_col != null;
        }).length,
        page_rank_present: sample.filter((row) => byId.get(String(row.qdrant_point_id))?.page_rank_score != null).length,
      };
    }
  }

  return { synced, failed, skipped: ambiguous.length, ambiguous: ambiguous.length, verification };
}

// 6. Sync missing payloads
async function syncMissingPayloads(samplePoints) {
  console.log(`\n🔄 Syncing payloads (${DRY_RUN ? 'DRY-RUN' : 'APPLY'})...\n`);

  // Filter points with missing fields
  const pointsToSync = samplePoints.filter((point) =>
    TOPOLOGY_FIELDS.some((field) => isMissing(point[field]))
  );

  if (pointsToSync.length === 0) {
    console.log('✅ All sampled points have topology fields. No sync needed.\n');
    return { synced: 0, failed: 0, skipped: pointsToSync.length };
  }

  console.log(`Found ${pointsToSync.length} points needing sync.\n`);

  // Load canonical data from Postgres
  const packet_keys = pointsToSync.map(p => p.packet_key).filter(Boolean);
  if (packet_keys.length === 0) {
    console.log('⚠️  No packet_keys to sync. Skipping.\n');
    return { synced: 0, failed: 0, skipped: pointsToSync.length };
  }

  console.log(`Loading canonical packets from Postgres (${packet_keys.length})...`);
  const canonicalData = await loadCanonicalPackets(packet_keys);
  console.log(`Loaded ${Object.keys(canonicalData).length} packets.\n`);

  let synced = 0;
  let failed = 0;

  // Batch update Qdrant points
  for (let i = 0; i < pointsToSync.length; i += BATCH_SIZE) {
    const batch = pointsToSync.slice(i, i + BATCH_SIZE);
    const updates = [];

    for (const point of batch) {
      const canonical = canonicalData[point.packet_key];
      if (!canonical) continue;

      const updatePayload = {};
      TOPOLOGY_FIELDS.forEach(field => {
        if (canonical[field] !== null && canonical[field] !== undefined) {
          updatePayload[field] = canonical[field];
        }
      });

      if (Object.keys(updatePayload).length > 0) {
        updates.push({
          id: point.id,
          payload: updatePayload
        });
      }
    }

    if (updates.length === 0) continue;

    if (DRY_RUN) {
      console.log(`[DRY-RUN] Would update ${updates.length} points in batch ${i / BATCH_SIZE + 1}`);
      synced += updates.length;
    } else {
      try {
        const updateRes = await fetch(`${QDRANT_URL}/collections/${COLLECTION}/points/batch?wait=true`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            operations: updates.map((update) => ({
              set_payload: {
                payload: update.payload,
                points: [update.id],
              },
            })),
          })
        });

        if (!updateRes.ok) {
          const err = await updateRes.text();
          throw new Error(`${updateRes.status}: ${err}`);
        }

        synced += updates.length;
        console.log(`✅ Synced batch ${i / BATCH_SIZE + 1}: ${updates.length} points`);
      } catch (err) {
        failed += updates.length;
        console.error(`❌ Batch ${i / BATCH_SIZE + 1} failed: ${err.message}`);
      }
    }
  }

  return { synced, failed, skipped: samplePoints.length - pointsToSync.length };
}

// 7. Main execution
async function main() {
  try {
    const connected = await verifyQdrantConnection();
    if (!connected) {
      console.error('Cannot proceed without Qdrant connection.\n');
      process.exit(1);
    }

    // Audit
    const { samplePoints, fieldCoverage, pointsScanned } = await auditPayloadCoverage();

    // The deterministic bridge is Postgres qdrant_point_id -> existing Qdrant
    // point. Scroll payload packet_key is audit evidence only and may be absent.
    const syncResult = await syncCanonicalByPointId(SAMPLE_SIZE);

    // Report
    console.log(`\n📋 Summary (${DRY_RUN ? 'DRY-RUN' : 'APPLIED'}):`);
    console.log(`  Points scanned: ${pointsScanned.toLocaleString()}`);
    console.log(`  Synced: ${syncResult.synced}`);
    console.log(`  Failed: ${syncResult.failed}`);
    console.log(`  Skipped: ${syncResult.skipped}\n`);
    if (syncResult.verification) {
      console.log(`  Direct verification: ${syncResult.verification.tree_node_id_matches}/${syncResult.verification.requested} tree IDs matched`);
    }

    const reportDir = join(ROOT, 'docs', 'reports');
    mkdirSync(reportDir, { recursive: true });
    writeFileSync(join(reportDir, 'p2-qdrant-payload-sync-topology.json'), JSON.stringify({
      generated_at: new Date().toISOString(),
      mode: DRY_RUN ? 'dry-run' : 'apply',
      collection: COLLECTION,
      points_scanned: pointsScanned,
      field_coverage: fieldCoverage,
      direct_bridge: syncResult,
      contract: {
        identity_source: 'atlas_packets.qdrant_point_id',
        mutation: 'qdrant_set_payload_batch',
        tree_node_id_role: 'graph_fanout_and_topology_rerank_join',
      },
    }, null, 2));

    // Next steps
    if (DRY_RUN) {
      console.log('✅ Verify looks good. Run with --apply to backfill Qdrant.\n');
      console.log('Next: npm run atlas:p2:qdrant-payload-sync:sync\n');
    } else {
      console.log(`✅ Synced ${syncResult.synced} points to Qdrant. Topology fields now available for P3.\n`);
      console.log('Next: npm run atlas:p3:neo4j-topology-edges:backfill\n');
    }

    process.exit(0);
  } catch (err) {
    console.error(`\n❌ Error: ${err.message}\n`);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
