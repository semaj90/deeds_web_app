#!/usr/bin/env node

/**
 * Sync metadata to Qdrant points by source_ref matching
 *
 * Instead of syncing by packet_id (which don't exist in Qdrant),
 * search Qdrant for points matching source_ref and update their payload
 * with the canonical metadata from atlas_packets.
 *
 * Usage:
 *   npm run atlas:qdrant-metadata:sync:dry
 *   npm run atlas:qdrant-metadata:sync:apply
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
const limit = args.find((arg) => arg.startsWith('--limit='))?.split('=')[1] || '10000';

const reportPath = path.join(REPO_ROOT, 'docs', 'reports', 'sync-qdrant-metadata-by-source.json');
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
    source_ref: pgRow.source_ref || null,
    file_path: pgRow.file_path || null,
    feature_id: pgRow.feature_id,
    feature_label: metadata.feature_label || null,
    updated_at: new Date().toISOString(),
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
      source_ref,
      source_path as file_path,
      feature_id,
      metadata
    FROM atlas_packets
    WHERE source_ref IS NOT NULL
    ORDER BY source_ref
    LIMIT $1 OFFSET $2
    `,
    [batchSize, offset]
  );
  return result.rows;
}

/**
 * Count packets with source_ref
 */
async function countPacketsWithSourceRef() {
  const result = await pgClient.query('SELECT COUNT(*) as count FROM atlas_packets WHERE source_ref IS NOT NULL');
  return parseInt(result.rows[0].count, 10);
}

/**
 * Search Qdrant for points matching source_ref
 */
async function searchQdrantBySourceRef(sourceRef) {
  try {
    const result = await qdrantClient.scrollPoints(QDRANT_COLLECTION, {
      filter: {
        must: [
          {
            key: 'source_ref',
            match: {
              value: sourceRef,
            },
          },
        ],
      },
      limit: 100,
    });
    return result.points || [];
  } catch (err) {
    return [];
  }
}

/**
 * Upsert payload for a point
 */
async function upsertPointPayload(pointId, newPayload) {
  try {
    await qdrantClient.setPayload(QDRANT_COLLECTION, {
      points_selector: {
        points: [pointId],
      },
      payload: newPayload,
    });
    return true;
  } catch (err) {
    console.error(`  Error updating point ${pointId}:`, err.message);
    return false;
  }
}

/**
 * Main sync loop
 */
async function syncQdrantMetadata() {
  console.log('📊 Syncing Qdrant metadata by source_ref matching...\n');

  await connectServices();

  try {
    const total = await countPacketsWithSourceRef();
    console.log(`  Packets with source_ref: ${total}`);

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

      for (const pgRow of batch) {
        if (!pgRow.source_ref) continue;

        // Search for matching points in Qdrant
        const points = await searchQdrantBySourceRef(pgRow.source_ref);

        if (points.length === 0) {
          processedCount++;
          continue;
        }

        // Build metadata
        const metadata = buildCanonicalMetadata(pgRow);

        // Update all matching points
        for (const point of points) {
          if (!isDry) {
            const success = await upsertPointPayload(point.id, metadata);
            if (success) {
              totalUpdated++;
            } else {
              totalErrors++;
            }
          } else {
            totalUpdated++;
          }
        }

        processedCount++;
      }

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

    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
    console.log(`📝 Report written to ${reportPath}`);

    return report;
  } finally {
    await closeServices();
  }
}

// Run
try {
  await syncQdrantMetadata();
} catch (err) {
  console.error('❌ Fatal error:', err.message);
  process.exit(1);
}
