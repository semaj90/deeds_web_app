#!/usr/bin/env node
/**
 * Phase 1, Step 6: Build Qdrant HNSW Index (384-dim)
 *
 * - Create collection "codebase_chunks_384" with HNSW config
 * - Upsert 5K points with payload metadata
 * - Configuration: m=16, ef_construct=200 (recommended for 384-dim)
 *
 * Usage:
 *   npx tsx build-qdrant-384-hnsw.mts [--dry-run] [--verbose]
 */

import path from 'path';
import { fileURLToPath } from 'url';
import Database from 'duckdb-async';
import { QdrantClient } from '@qdrant/js-client-rest';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SNAPSHOT_PATH = path.join(__dirname, '../../data/atlas-ml/snapshot_5k_384dim.parquet');

interface QdrantPoint {
  id: string;
  vector: number[];
  payload: {
    packet_key: string;
    source_ref: string;
    feature_id: string;
    domain_class: string;
  };
}

async function buildQdrantIndex(): Promise<void> {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const verbose = args.includes('--verbose');

  const qdrantHost = process.env.QDRANT_HOST || '127.0.0.1';
  const qdrantPort = parseInt(process.env.QDRANT_PORT || '6333');

  const client = new QdrantClient({
    host: qdrantHost,
    port: qdrantPort,
  });

  try {
    if (verbose) {
      console.log(`[Qdrant Build] Host: ${qdrantHost}:${qdrantPort}`);
      console.log(`[Qdrant Build] Collection: codebase_chunks_384`);
      console.log(`[Qdrant Build] Snapshot: ${SNAPSHOT_PATH}`);
    }

    // Health check
    if (verbose) console.log('[Qdrant Build] Checking Qdrant health...');
    const health = await client.healthCheck();
    if (!health.ok) {
      throw new Error('Qdrant health check failed');
    }

    // Check if collection exists
    let collectionExists = false;
    try {
      await client.getCollection('codebase_chunks_384');
      collectionExists = true;
      if (verbose) console.log('[Qdrant Build] Collection exists, recreating...');

      if (!dryRun) {
        await client.deleteCollection('codebase_chunks_384');
      }
    } catch (err) {
      if (verbose) console.log('[Qdrant Build] Collection does not exist, creating...');
    }

    // Create collection
    if (!dryRun) {
      if (verbose) console.log('[Qdrant Build] Creating collection with HNSW config...');

      await client.createCollection('codebase_chunks_384', {
        vectors: {
          size: 384,
          distance: 'Cosine',
        },
        optimizers_config: {
          default_segment_number: 4,
          snapshot_on_disk: true,
        },
        hnsw_config: {
          m: 16,
          ef_construct: 200,
          full_scan_threshold: 10000,
          max_indexing_threads: 4,
        },
      });

      if (verbose) console.log('[Qdrant Build] Collection created');
    }

    // Load points from snapshot
    if (verbose) console.log('[Qdrant Build] Loading points from snapshot...');

    const db = new Database(':memory:');

    const pointsQuery = `
      SELECT
        packet_key,
        source_ref,
        feature_id,
        domain_class,
        embedding
      FROM read_parquet('${SNAPSHOT_PATH}')
      GROUP BY packet_key, source_ref, feature_id, domain_class, embedding
      ORDER BY packet_key
    `;

    const rows = (await db.all(pointsQuery)) as any[];

    if (rows.length === 0) {
      throw new Error('No points found in snapshot');
    }

    if (verbose) console.log(`[Qdrant Build] Loaded ${rows.length} points`);

    // Prepare points for upsert
    const points: QdrantPoint[] = rows.map((row, idx) => ({
      id: `${idx}`,
      vector: row.embedding as number[],
      payload: {
        packet_key: row.packet_key,
        source_ref: row.source_ref,
        feature_id: row.feature_id,
        domain_class: row.domain_class,
      },
    }));

    // Upsert points in batches
    const batchSize = 100;
    if (!dryRun) {
      if (verbose) console.log(`[Qdrant Build] Upserting ${points.length} points in batches of ${batchSize}...`);

      for (let i = 0; i < points.length; i += batchSize) {
        const batch = points.slice(i, i + batchSize);

        await client.upsert('codebase_chunks_384', {
          points: batch.map((p) => ({
            id: parseInt(p.id),
            vector: p.vector,
            payload: p.payload,
          })),
        });

        if (verbose && (i + batchSize) % 500 === 0) {
          console.log(`  - Upserted ${Math.min(i + batchSize, points.length)} / ${points.length}`);
        }
      }

      if (verbose) console.log('[Qdrant Build] Upsert complete');
    }

    // Verify collection
    if (!dryRun) {
      if (verbose) console.log('[Qdrant Build] Verifying collection...');

      const collection = await client.getCollection('codebase_chunks_384');
      const pointCount = collection.points_count;

      console.log('\n=== Qdrant HNSW Index Build Complete ===');
      console.log(`Collection: codebase_chunks_384`);
      console.log(`Points: ${pointCount}`);
      console.log(`Dimension: 384`);
      console.log(`Distance metric: Cosine`);
      console.log(`HNSW m: 16, ef_construct: 200`);
      console.log(`✅ Step 6 complete`);
    } else {
      console.log('\n=== Qdrant HNSW Index Build (Dry-run) ===');
      console.log(`Collection: codebase_chunks_384`);
      console.log(`Points to upsert: ${points.length}`);
      console.log(`Dimension: 384`);
      console.log(`Distance metric: Cosine`);
      console.log(`HNSW m: 16, ef_construct: 200`);
      console.log(`(Dry-run mode. Use without --dry-run to apply.)`);
    }

    await db.close();
  } catch (err) {
    console.error('❌ Step 6 failed:', err);
    process.exit(1);
  }
}

buildQdrantIndex();
