#!/usr/bin/env node
/**
 * Phase 102 Step 6: Fast SOM Clustering
 * Optimized for speed: random init + 10 iterations
 * Trade-off: Approximate clustering for fast execution
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.join(__dirname, '../../docs/reports');

const CANONICAL_DIM = 384;
const SOM_GRID_SIZE = 20;
const K_CLUSTERS = 400;
const MAX_ITERATIONS = 15;
const TOLERANCE = 0.10; // 10% changes acceptable

async function main() {
  const startTime = Date.now();
  console.log('\n🚀 Phase 102 Step 6: Fast SOM Clustering\n');

  // Load embeddings from Postgres
  const client = new pg.Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5434'),
    user: process.env.DB_USER || 'legal_admin',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'legal_ai_db'
  });

  try {
    await client.connect();
    console.log('📥 Loading embeddings...\n');

    const result = await client.query(`
      SELECT
        id,
        qdrant_id,
        content_embedding,
        relative_path
      FROM codebase_chunk_index
      WHERE content_embedding IS NOT NULL
      ORDER BY id
      LIMIT 40568
    `);

    const rows = result.rows;
    console.log(`✅ Loaded ${rows.length} embeddings\n`);

    // Convert to Float32Array
    const embeddings = rows.map(r => {
      const vec = r.content_embedding;
      if (Array.isArray(vec)) return new Float32Array(vec);
      if (vec instanceof Float32Array) return vec;
      return new Float32Array(Object.values(vec));
    });

    // Fast random initialization
    console.log('🎯 Initializing 400 centroids (random)...\n');
    const centroids = [];
    const seen = new Set();
    while (centroids.length < K_CLUSTERS) {
      const idx = Math.floor(Math.random() * embeddings.length);
      if (!seen.has(idx)) {
        seen.add(idx);
        centroids.push(new Float32Array(embeddings[idx]));
      }
    }

    // Simple distance function
    function distance(a, b) {
      let sum = 0;
      for (let i = 0; i < CANONICAL_DIM; i++) {
        const d = a[i] - b[i];
        sum += d * d;
      }
      return Math.sqrt(sum);
    }

    // K-means iterations
    console.log('🔄 Running k-means...\n');
    let assignments = new Uint32Array(embeddings.length);

    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      const startIter = Date.now();

      // Assign
      let changed = 0;
      for (let i = 0; i < embeddings.length; i++) {
        let minDist = Infinity;
        let bestCluster = 0;

        for (let c = 0; c < K_CLUSTERS; c++) {
          const d = distance(embeddings[i], centroids[c]);
          if (d < minDist) {
            minDist = d;
            bestCluster = c;
          }
        }

        if (assignments[i] !== bestCluster) {
          changed++;
        }
        assignments[i] = bestCluster;
      }

      // Update centroids
      const counts = new Uint32Array(K_CLUSTERS);
      const newCentroids = Array.from({ length: K_CLUSTERS }, () =>
        new Float32Array(CANONICAL_DIM)
      );

      for (let i = 0; i < embeddings.length; i++) {
        const c = assignments[i];
        counts[c]++;
        for (let d = 0; d < CANONICAL_DIM; d++) {
          newCentroids[c][d] += embeddings[i][d];
        }
      }

      for (let c = 0; c < K_CLUSTERS; c++) {
        if (counts[c] > 0) {
          for (let d = 0; d < CANONICAL_DIM; d++) {
            newCentroids[c][d] /= counts[c];
          }
        }
      }

      for (let c = 0; c < K_CLUSTERS; c++) {
        centroids[c] = newCentroids[c];
      }

      const convergence = ((100 * (1 - changed / embeddings.length)).toFixed(1));
      const elapsed = Math.round((Date.now() - startIter) / 1000);
      console.log(`  Iter ${iter}: ${changed} changes (${convergence}% converged, ${elapsed}s)`);

      if (changed < TOLERANCE * embeddings.length) {
        console.log(`  ✓ Converged!\n`);
        break;
      }
    }

    // Write results to Postgres
    console.log('💾 Writing results to Postgres...\n');

    // Create temp table for assignments
    await client.query(`
      CREATE TEMP TABLE temp_som_assignments AS
      SELECT * FROM codebase_chunk_index WHERE FALSE
    `);

    // Update with SOM metadata
    for (let i = 0; i < rows.length; i++) {
      const cluster = assignments[i];
      const row = cluster % 20;
      const col = Math.floor(cluster / 20);

      await client.query(
        `UPDATE codebase_chunk_index
         SET som_cluster = $1, som_bmu_row = $2, som_bmu_col = $3
         WHERE id = $4`,
        [cluster, row, col, rows[i].id]
      );
    }

    // Write report
    const report = {
      timestamp: new Date().toISOString(),
      algorithm: 'kmeans-fast',
      embeddings: embeddings.length,
      clusters: K_CLUSTERS,
      iterations: MAX_ITERATIONS,
      dimensions: CANONICAL_DIM,
      grid_size: SOM_GRID_SIZE,
      centroids: centroids.map(c => Array.from(c)),
      assignments: Array.from(assignments)
    };

    await fs.writeFile(
      path.join(REPORTS_DIR, 'phase6-som-clustering.json'),
      JSON.stringify(report, null, 2)
    );

    const elapsed = Math.round((Date.now() - startTime) / 1000);
    console.log(`✅ Complete in ${elapsed}s`);
    console.log(`📄 Report: ${path.join(REPORTS_DIR, 'phase6-som-clustering.json')}\n`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
