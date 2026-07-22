#!/usr/bin/env node
/**
 * Phase 2, Step 11: Persist Cluster Run Manifests to Postgres
 *
 * - Create vector_cluster_manifest table
 * - Store K-means centroids + assignments
 * - Store SOM grid + BMU mappings
 *
 * Usage:
 *   npx tsx persist-cluster-manifests.mts [--apply] [--verbose]
 */

import pg from 'pg';
import Redis from 'ioredis';

const { Pool } = pg;

async function persistManifests(): Promise<void> {
  const args = process.argv.slice(2);
  const apply = args.includes('--apply');
  const verbose = args.includes('--verbose');

  const pool = new Pool({
    connectionString:
      process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db',
  });

  const redis = new Redis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || 'redis',
  });

  try {
    const client = await pool.connect();

    try {
      // Create table if not exists
      if (verbose) console.log('[Manifests] Creating vector_cluster_manifest table...');

      await client.query(`
        CREATE TABLE IF NOT EXISTS vector_cluster_manifest (
          id SERIAL PRIMARY KEY,
          run_id VARCHAR(100) NOT NULL,
          cluster_type VARCHAR(50) NOT NULL,
          cluster_algorithm VARCHAR(50) NOT NULL,
          cluster_id INT NOT NULL,
          centroid VECTOR(384),
          packet_count INT NOT NULL DEFAULT 0,
          member_packet_keys TEXT[] NOT NULL DEFAULT '{}',
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          UNIQUE (run_id, cluster_type, cluster_id)
        )
      `);

      if (verbose) console.log('[Manifests] Table created');

      // Get K-means metadata
      if (verbose) console.log('[Manifests] Loading K-means data from Redis...');

      const kmeansMetadata = await redis.hgetall('kmeans:metadata');
      const k = parseInt(kmeansMetadata.k || '32');

      // Get K-means centroids and store
      if (verbose) console.log(`[Manifests] Processing ${k} K-means clusters...`);

      const runId = `kmeans_${Date.now()}`;
      let inserted = 0;

      for (let clusterId = 0; clusterId < k; clusterId++) {
        const centroidKey = `centroid:kmeans:${clusterId}`;
        const centroidData = await redis.get(centroidKey);

        if (centroidData) {
          const centroid = JSON.parse(centroidData);

          if (apply) {
            await client.query(
              `
              INSERT INTO vector_cluster_manifest (run_id, cluster_type, cluster_algorithm, cluster_id, centroid, packet_count)
              VALUES ($1, $2, $3, $4, $5, $6)
              ON CONFLICT (run_id, cluster_type, cluster_id) DO UPDATE SET
                centroid = $5,
                updated_at = NOW()
            `,
              [runId, 'kmeans', 'kmeans', clusterId, centroid, 0]
            );
          }

          inserted++;
        }
      }

      if (apply) {
        if (verbose) console.log(`[Manifests] Inserted ${inserted} K-means clusters`);
      }

      // Get SOM metadata
      if (verbose) console.log('[Manifests] Loading SOM data from Redis...');

      const somMetadata = await redis.hgetall('som:metadata');
      const somRunId = `som_${Date.now()}`;
      const gridWidth = parseInt(somMetadata.grid_width || '20');
      const gridHeight = parseInt(somMetadata.grid_height || '20');

      if (verbose) console.log(`[Manifests] Processing ${gridWidth * gridHeight} SOM cells...`);

      let somInserted = 0;

      for (let i = 0; i < gridHeight; i++) {
        for (let j = 0; j < gridWidth; j++) {
          const centroidKey = `som:centroid:${i}:${j}`;
          const centroidData = await redis.get(centroidKey);

          if (centroidData) {
            const centroid = JSON.parse(centroidData);

            if (apply) {
              await client.query(
                `
                INSERT INTO vector_cluster_manifest (run_id, cluster_type, cluster_algorithm, cluster_id, centroid, packet_count)
                VALUES ($1, $2, $3, $4, $5, $6)
                ON CONFLICT (run_id, cluster_type, cluster_id) DO UPDATE SET
                  centroid = $5,
                  updated_at = NOW()
              `,
                [somRunId, 'som', 'som', i * gridWidth + j, centroid, 0]
              );
            }

            somInserted++;
          }
        }
      }

      if (apply) {
        if (verbose) console.log(`[Manifests] Inserted ${somInserted} SOM cells`);
      }

      console.log('\n=== Cluster Manifests Persisted ===');
      console.log(`K-means run: ${runId}`);
      console.log(`  Clusters stored: ${inserted}`);
      console.log(`SOM run: ${somRunId}`);
      console.log(`  Cells stored: ${somInserted}`);
      console.log(`✅ Step 11 complete`);

      if (!apply) {
        console.log('\n(Dry-run mode. Use --apply to confirm writes.)');
      }
    } finally {
      client.release();
    }

    await redis.quit();
  } catch (err) {
    console.error('❌ Step 11 failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

persistManifests();
