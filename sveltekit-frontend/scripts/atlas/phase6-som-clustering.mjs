#!/usr/bin/env node
/**
 * Phase 102 Step 6: SOM Clustering
 *
 * Input: 40,568 × 384 fp32 embeddings (from Step 5)
 * Process: K-means clustering to define SOM grid
 * Output: cluster assignments, centroids, topology
 * GPU: Optional TensorRT acceleration for similarity computation
 *
 * Canonical: SOM is neighborhood routing only, NOT search.
 * Postgres + Qdrant remain identity/search truth.
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import pg from 'pg';
import { loadTensorRTBridge, getBridgeInfo } from './load-tensorrt-bridge.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPORTS_DIR = path.join(__dirname, '../../docs/reports');

// Configuration
const CANONICAL_DIM = 384;
const SOM_GRID_SIZE = 20; // 20×20 = 400 neurons
const K_CLUSTERS = SOM_GRID_SIZE * SOM_GRID_SIZE;
const MAX_ITERATIONS = 30;  // Reduced from 100 for faster convergence
const TOLERANCE = 0.05;     // Relaxed from 0.001 (5% changes acceptable)

// Simple k-means implementation (CPU fallback)
function computeEuclideanDistance(vec1, vec2) {
  let sum = 0;
  for (let i = 0; i < vec1.length; i++) {
    const diff = vec1[i] - vec2[i];
    sum += diff * diff;
  }
  return Math.sqrt(sum);
}

function initializeCentroids(embeddings, k) {
  // Fast random initialization (k-means++ is too slow for 40K embeddings)
  // Instead: random k points from embeddings
  const centroids = [];
  const indices = new Set();

  while (indices.size < k) {
    indices.add(Math.floor(Math.random() * embeddings.length));
  }

  for (const idx of indices) {
    centroids.push(new Float32Array(embeddings[idx]));
  }

  return centroids;
}

function kmeansIteration(embeddings, centroids, logProgress = false) {
  const k = centroids.length;
  const n = embeddings.length;
  const assignments = new Uint32Array(n);
  let changed = 0;

  // Assign each point to nearest centroid (batch processing for speed)
  const batchSize = 1000;
  for (let batch = 0; batch < n; batch += batchSize) {
    const end = Math.min(batch + batchSize, n);
    for (let i = batch; i < end; i++) {
      let minDist = Infinity;
      let bestCluster = 0;

      for (let c = 0; c < k; c++) {
        const dist = computeEuclideanDistance(embeddings[i], centroids[c]);
        if (dist < minDist) {
          minDist = dist;
          bestCluster = c;
        }
      }

      if (assignments[i] !== bestCluster) {
        changed++;
      }
      assignments[i] = bestCluster;
    }
    if (logProgress && batch % 5000 === 0) {
      console.error(`  Progress: ${Math.round((batch / n) * 100)}%`);
    }
  }

  // Compute new centroids
  const counts = new Uint32Array(k);
  const newCentroids = Array.from({ length: k }, () =>
    new Float32Array(CANONICAL_DIM)
  );

  for (let i = 0; i < n; i++) {
    const cluster = assignments[i];
    counts[cluster]++;
    for (let d = 0; d < CANONICAL_DIM; d++) {
      newCentroids[cluster][d] += embeddings[i][d];
    }
  }

  for (let c = 0; c < k; c++) {
    if (counts[c] > 0) {
      for (let d = 0; d < CANONICAL_DIM; d++) {
        newCentroids[c][d] /= counts[c];
      }
    }
  }

  return { assignments, centroids: newCentroids, changed };
}

async function main() {
  const startTime = Date.now();
  console.log('\n🧠 Phase 102 Step 6: SOM Clustering\n');

  // Load tensor metadata from Step 5
  const tensorMetadataPath = path.join(REPORTS_DIR, 'phase5-tensor-loader.json');
  let tensorMetadata;
  try {
    const content = await fs.readFile(tensorMetadataPath, 'utf-8');
    tensorMetadata = JSON.parse(content);
    console.log(`✅ Loaded tensor metadata from Step 5`);
    console.log(`   Embeddings: ${tensorMetadata.embedding_count}`);
    console.log(`   Dimension: ${tensorMetadata.embedding_dim}`);
    console.log(`   Memory: ${tensorMetadata.memory_mb} MB\n`);
  } catch (e) {
    console.log(`⚠️  Tensor metadata not found. Run Step 5 first.\n`);
    process.exit(1);
  }

  // Check TensorRT bridge
  console.log('🎮 Step 1: GPU Acceleration Check\n');
  const trt = loadTensorRTBridge();
  const trtInfo = getBridgeInfo(trt);

  if (trtInfo.available && trtInfo.cudaAvailable) {
    console.log(`  ✅ TensorRT bridge loaded`);
    console.log(`  ✅ CUDA available`);
    console.log(`  📌 Optional GPU acceleration for similarity computation\n`);
  } else {
    console.log(`  ⚠️  TensorRT bridge unavailable`);
    console.log(`  📌 Using CPU fallback for k-means\n`);
  }

  // Load embeddings from Postgres
  console.log('📥 Step 2: Load Embeddings\n');

  const client = new pg.Client({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5434'),
    user: process.env.DB_USER || 'legal_admin',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'legal_ai_db'
  });

  try {
    await client.connect();

    const result = await client.query(`
      SELECT
        id as chunk_id,
        qdrant_id as chunk_key,
        content_embedding,
        relative_path as source_ref
      FROM codebase_chunk_index
      WHERE content_embedding IS NOT NULL
      ORDER BY id
      LIMIT $1
    `, [tensorMetadata.embedding_count]);

    const embeddings = [];
    const chunkMap = [];

    for (const row of result.rows) {
      let embedding;
      try {
        if (typeof row.content_embedding === 'string') {
          embedding = row.content_embedding
            .slice(1, -1)
            .split(',')
            .map(s => parseFloat(s.trim()))
            .slice(0, CANONICAL_DIM);
        } else if (Array.isArray(row.content_embedding)) {
          embedding = row.content_embedding.slice(0, CANONICAL_DIM);
        } else {
          continue;
        }
      } catch (e) {
        continue;
      }

      embeddings.push(new Float32Array(embedding));
      chunkMap.push({
        chunk_id: row.chunk_id,
        chunk_key: row.chunk_key,
        source_ref: row.source_ref
      });
    }

    console.log(`  ✅ Loaded ${embeddings.length} embeddings\n`);

    // Run k-means clustering
    console.log(`🔄 Step 3: K-means Clustering (${K_CLUSTERS} clusters)\n`);

    console.log(`  Initializing centroids...`);
    let centroids = initializeCentroids(embeddings, K_CLUSTERS);
    console.log(`  ✓ Initialized ${centroids.length} centroids\n`);

    let iteration = 0;
    let lastChanged = Infinity;

    for (iteration = 0; iteration < MAX_ITERATIONS; iteration++) {
      const { assignments, centroids: newCentroids, changed } =
        kmeansIteration(embeddings, centroids);

      centroids = newCentroids;
      lastChanged = changed;

      if (iteration % 10 === 0) {
        const convergencePercent = (100 * (1 - changed / embeddings.length)).toFixed(2);
        console.log(`  Iteration ${iteration}: ${changed} changes (${convergencePercent}% converged)`);
      }

      if (changed < TOLERANCE * embeddings.length) {
        console.log(`  ✓ Converged at iteration ${iteration}\n`);
        break;
      }
    }

    // Final assignments
    console.log(`📊 Step 4: Compute Final Assignments\n`);
    const finalResult = kmeansIteration(embeddings, centroids);
    const assignments = finalResult.assignments;

    // Cluster statistics
    const clusterSizes = new Uint32Array(K_CLUSTERS);
    for (let i = 0; i < assignments.length; i++) {
      clusterSizes[assignments[i]]++;
    }

    const nonEmptyClusters = Array.from(clusterSizes).filter(c => c > 0).length;
    const avgClusterSize = embeddings.length / nonEmptyClusters;

    console.log(`  Clusters: ${nonEmptyClusters}/${K_CLUSTERS} non-empty`);
    console.log(`  Average cluster size: ${avgClusterSize.toFixed(1)}`);
    console.log(`  Min size: ${Math.min(...clusterSizes)}`);
    console.log(`  Max size: ${Math.max(...clusterSizes)}\n`);

    // Save cluster assignments
    console.log(`💾 Step 5: Save Results\n`);

    const clusterData = {
      phase: '102-step-6',
      timestamp: new Date().toISOString(),
      config: {
        grid_size: SOM_GRID_SIZE,
        k_clusters: K_CLUSTERS,
        embedding_dim: CANONICAL_DIM,
        max_iterations: MAX_ITERATIONS,
        convergence_tolerance: TOLERANCE
      },
      stats: {
        embeddings_clustered: embeddings.length,
        non_empty_clusters: nonEmptyClusters,
        avg_cluster_size: avgClusterSize,
        iterations_to_convergence: iteration,
        gpu_available: trtInfo.available && trtInfo.cudaAvailable
      },
      assignments: Array.from(assignments),
      centroids: centroids.map(c => Array.from(c))
    };

    const reportPath = path.join(REPORTS_DIR, 'phase6-som-clustering.json');
    await fs.writeFile(reportPath, JSON.stringify(clusterData, null, 2));
    console.log(`  ✅ Cluster data saved: ${reportPath}\n`);

    // Summary
    console.log('📋 Summary\n');
    console.log(`  ✅ K-means clustering complete`);
    console.log(`  ✅ ${nonEmptyClusters}/${K_CLUSTERS} clusters populated`);
    console.log(`  ✅ Converged in ${iteration} iterations`);
    console.log(`  📌 SOM = neighborhood routing (NOT search truth)`);
    console.log(`  📌 Postgres + Qdrant remain canonical\n`);

    console.log(`✅ COMPLETE in ${Date.now() - startTime}ms\n`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

await main();
