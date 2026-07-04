#!/usr/bin/env node

/**
 * Sync canonical packet metadata from Postgres atlas_packets to Qdrant codebase_chunks_768
 *
 * After feature_id backfill completes, upsert the canonical metadata JSONB envelope
 * into Qdrant payload field for every point in codebase_chunks_768 collection.
 *
 * Canonical metadata fields (15-field envelope):
 *   - packet_key, source_ref, file_path, feature_id, feature_label
 *   - group_id, cluster_id, community_id, som_cluster, centroid_id
 *   - domain, ontology, karpathy_score, redis_hot_key, qdrant_point_id, neo4j_node_id
 *   - feature_id_inferred, feature_id_source, updated_at
 *
 * Usage:
 *   npm run atlas:qdrant-payload:sync:dry
 *   npm run atlas:qdrant-payload:sync:apply
 */

import { Client } from 'pg';
import { QdrantClient } from '@qdrant/js-client-rest';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'node:url';
import { loadRepoEnv, resolveDatabaseUrl } from '../../../scripts/atlas/connection-config.mjs';

const env = loadRepoEnv(process.env);
const POSTGRES_URL = resolveDatabaseUrl(env);
const QDRANT_URL = env.QDRANT_URL || 'http://127.0.0.1:6333';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

const args = process.argv.slice(2);
const isApply = args.includes('--apply');
const isDry = args.includes('--dry') || !isApply;
const isSilent = args.includes('--silent');
const limit = args.find((arg) => arg.startsWith('--limit='))?.split('=')[1] || '10000';

const reportPath = path.join(REPO_ROOT, 'docs', 'reports', 'sync-qdrant-payload.json');
const BATCH_SIZE = 100;
const QDRANT_COLLECTION = 'codebase_chunks_768';

let pgClient = null;
let qdrantClient = null;

async function connectServices() {
  pgClient = new Client({ connectionString: POSTGRES_URL, statement_timeout: 30000 });
  await pgClient.connect();
  qdrantClient = new QdrantClient({ url: QDRANT_URL });
}

async function closeServices() {
  if (pgClient) await pgClient.end();
}

/**
 * Build canonical metadata envelope from postgres row
 */
function buildCanonicalMetadata(pgRow) {
  const metadata = (pgRow.metadata && typeof pgRow.metadata === 'object') ? pgRow.metadata : {};
  return {
    packet_key: pgRow.packet_key || null,
    source_ref: pgRow.source_ref || null,
    file_path: pgRow.file_path || null,
    feature_id: pgRow.feature_id,
    feature_label: metadata.feature_label || null,
    updated_at: new Date().toISOString(),
    ...metadata,
  };
}

/**
 * Fetch packets from Postgres with pagination
 */
async function fetchPacketBatch(offset, batchSize) {
  const result = await pgClient.query(
    `
    SELECT
      packet_id,
      packet_key,
      source_ref,
      source_path as file_path,
      feature_id,
      metadata
    FROM atlas_packets
    ORDER BY packet_id
    LIMIT $1 OFFSET $2
    `,
    [batchSize, offset]
  );
  return result.rows;
}

/**
 * Count total packets for progress tracking
 */
async function countTotalPackets() {
  const result = await pgClient.query('SELECT COUNT(*) as count FROM atlas_packets');
  return parseInt(result.rows[0].count, 10);
}

/**
 * Upsert points in Qdrant with payload
 */
async function upsertQdrantPayload(points) {
  if (points.length === 0) return { updated: 0, errors: 0 };

  let updated = 0;
  let errors = 0;

  for (const point of points) {
    try {
      await qdrantClient.upsert(QDRANT_COLLECTION, {
        points: [
          {
            id: point.pointId,
            payload: point.payload,
          },
        ],
      });
      updated++;
    } catch (err) {
      if (!isSilent) {
        console.error(`  Error upserting point ${point.pointId}:`, err.message);
      }
      errors++;
    }
  }

  return { updated, errors };
}

/**
 * Main sync loop
 */
async function syncQdrantPayload() {
  console.log('📊 Syncing Qdrant payload from atlas_packets...\n');

  await connectServices();

  try {
    const total = await countTotalPackets();
    console.log(`  Total packets: ${total}`);

    if (isDry) {
      console.log(`  Mode: DRY RUN (no Qdrant updates)`);
    } else {
      console.log(`  Mode: APPLY (updating Qdrant)`);
    }
    console.log();

    let processedCount = 0;
    let totalUpdated = 0;
    let totalErrors = 0;
    const batchSize = parseInt(limit, 10);

    for (let offset = 0; offset < total; offset += batchSize) {
      const batch = await fetchPacketBatch(offset, batchSize);

      if (batch.length === 0) break;

      // Prepare points for upsert
      const points = batch.map((row) => ({
        pointId: row.packet_id, // Qdrant expects string or number ID
        payload: buildCanonicalMetadata(row),
      }));

      if (!isDry) {
        const { updated, errors } = await upsertQdrantPayload(points);
        totalUpdated += updated;
        totalErrors += errors;
      } else {
        // In dry mode, just count
        totalUpdated += points.length;
      }

      processedCount += batch.length;
      const pct = Math.round((processedCount / total) * 100);
      console.log(`  [${pct}%] Processed ${processedCount}/${total} packets...`);
    }

    console.log(`\n✅ Sync complete: ${totalUpdated} points ${isDry ? 'would be' : ''} updated, ${totalErrors} errors`);

    const report = {
      timestamp: new Date().toISOString(),
      mode: isDry ? 'dry-run' : 'apply',
      collection: QDRANT_COLLECTION,
      stats: {
        totalPackets: total,
        updated: totalUpdated,
        errors: totalErrors,
        batchSize,
      },
    };

    if (!isSilent) {
      fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
      console.log(`📝 Report written to ${reportPath}`);
    }

    return report;
  } finally {
    await closeServices();
  }
}

// Run
try {
  await syncQdrantPayload();
} catch (err) {
  console.error('❌ Fatal error:', err.message);
  process.exit(1);
}
