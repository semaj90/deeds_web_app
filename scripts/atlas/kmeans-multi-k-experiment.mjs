#!/usr/bin/env node
/**
 * KMeans Multi-K Experiment
 *
 * Runs KMeans clustering at K=25, 32, 64, 96, 128 on the exported topology
 * feature vectors and evaluates each K with:
 *   - Inertia (within-cluster sum of squared distances)
 *   - Silhouette coefficient approximation (sample-based)
 *   - Domain purity (how well clusters align with source directory)
 *   - Cluster size distribution (min/max/stddev)
 *
 * Uses atlas_topology_features as input and writes results to
 * atlas_cluster_models with comparison metrics.
 *
 * Usage:
 *   node scripts/atlas/kmeans-multi-k-experiment.mjs [--dry-run] [--verbose] [--k 25,32,64] [--json]
 */

import pg from 'pg';
import * as dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { writeFileSync } from 'fs';

dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '../../sveltekit-frontend/.env') });
dotenv.config({ path: join(dirname(fileURLToPath(import.meta.url)), '../../sveltekit-frontend/.env.local') });

const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');
const JSON_OUT = process.argv.includes('--json');
const K_ARG = process.argv.find(a => a.startsWith('--k=') || a === '--k');
const K_VALUES = K_ARG
  ? (K_ARG.includes('=') ? K_ARG.split('=')[1] : process.argv[process.argv.indexOf('--k') + 1])
      .split(',').map(Number).filter(k => k > 0)
  : [25, 32, 64, 96, 128];

const PG_CONFIG = {
  host: process.env.PGHOST || process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.PGPORT || process.env.DB_PORT || '5434'),
  database: process.env.PGDATABASE || process.env.DB_NAME || 'legal_ai_db',
  user: process.env.PGUSER || process.env.DB_USER || 'legal_admin',
  password: process.env.PGPASSWORD || process.env.DB_PASSWORD || 'legal_password',
  connectionTimeoutMillis: 15000,
};

function log(...args) { if (VERBOSE) console.log(...args); }

// ── Pure JS KMeans++ implementation ──────────────────────────────────────────
function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function distSq(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) { const d = a[i] - b[i]; s += d * d; }
  return s;
}

function kmeanspp(vectors, k, rng) {
  const n = vectors.length;
  const centroids = [];

  // Pick first centroid randomly
  centroids.push(vectors[Math.floor(rng() * n)].slice());

  for (let c = 1; c < k; c++) {
    // Compute D^2 for each point
    const dists = vectors.map(v => Math.min(...centroids.map(cen => distSq(v, cen))));
    const total = dists.reduce((s, d) => s + d, 0);
    let r = rng() * total;
    let idx = 0;
    for (; idx < n - 1 && r > dists[idx]; idx++) r -= dists[idx];
    centroids.push(vectors[idx].slice());
  }

  return centroids;
}

function kmeans(vectors, k, maxIter = 50, seed = 42) {
  const n = vectors.length;
  const dim = vectors[0].length;

  // Simple LCG RNG for reproducibility
  let state = seed;
  const rng = () => { state = (state * 1664525 + 1013904223) >>> 0; return state / 0x100000000; };

  let centroids = kmeanspp(vectors, k, rng);
  let assignments = new Int32Array(n);
  let changed = true;
  let iter = 0;

  while (changed && iter < maxIter) {
    changed = false;
    iter++;

    // Assign step
    for (let i = 0; i < n; i++) {
      let bestDist = Infinity, bestC = 0;
      for (let c = 0; c < k; c++) {
        const d = distSq(vectors[i], centroids[c]);
        if (d < bestDist) { bestDist = d; bestC = c; }
      }
      if (assignments[i] !== bestC) { assignments[i] = bestC; changed = true; }
    }

    // Update step
    const newCentroids = Array.from({ length: k }, () => new Float64Array(dim));
    const counts = new Int32Array(k);

    for (let i = 0; i < n; i++) {
      const c = assignments[i];
      counts[c]++;
      const vec = vectors[i];
      const cen = newCentroids[c];
      for (let d = 0; d < dim; d++) cen[d] += vec[d];
    }

    for (let c = 0; c < k; c++) {
      if (counts[c] > 0) {
        for (let d = 0; d < dim; d++) newCentroids[c][d] /= counts[c];
        centroids[c] = Array.from(newCentroids[c]);
      }
    }
  }

  return { assignments: Array.from(assignments), centroids, iterations: iter };
}

function computeInertia(vectors, assignments, centroids) {
  return vectors.reduce((sum, v, i) => sum + distSq(v, centroids[assignments[i]]), 0);
}

function computeSilhouetteSample(vectors, assignments, k, sampleSize = 1000) {
  const n = vectors.length;
  const sample = [];
  const step = Math.max(1, Math.floor(n / sampleSize));
  for (let i = 0; i < n; i += step) sample.push(i);

  let totalS = 0;
  for (const i of sample) {
    const ci = assignments[i];
    let intraSum = 0, intraCount = 0;
    const interSums = new Float64Array(k);
    const interCounts = new Int32Array(k);

    // Sample 200 points to estimate distances (not full N scan)
    const innerStep = Math.max(1, Math.floor(n / 200));
    for (let j = 0; j < n; j += innerStep) {
      if (j === i) continue;
      const d = Math.sqrt(distSq(vectors[i], vectors[j]));
      const cj = assignments[j];
      if (cj === ci) { intraSum += d; intraCount++; }
      else { interSums[cj] += d; interCounts[cj]++; }
    }

    const a = intraCount > 0 ? intraSum / intraCount : 0;
    let b = Infinity;
    for (let c = 0; c < k; c++) {
      if (c !== ci && interCounts[c] > 0) {
        b = Math.min(b, interSums[c] / interCounts[c]);
      }
    }
    if (b === Infinity) b = 0;
    totalS += a === 0 && b === 0 ? 0 : (b - a) / Math.max(a, b);
  }

  return totalS / sample.length;
}

function computeDomainPurity(assignments, sourceRefs, k) {
  // Extract top-level directory as domain
  const domains = sourceRefs.map(ref => ref.split('/').slice(0, 3).join('/'));
  const clusterDomains = Array.from({ length: k }, () => ({}));

  for (let i = 0; i < assignments.length; i++) {
    const c = assignments[i];
    const dom = domains[i];
    clusterDomains[c][dom] = (clusterDomains[c][dom] ?? 0) + 1;
  }

  // Purity = weighted average of dominant class fraction per cluster
  let totalPurity = 0;
  const counts = new Int32Array(k);
  for (let i = 0; i < assignments.length; i++) counts[assignments[i]]++;

  for (let c = 0; c < k; c++) {
    if (counts[c] === 0) continue;
    const maxCount = Math.max(...Object.values(clusterDomains[c]));
    totalPurity += (maxCount / counts[c]) * counts[c];
  }

  return totalPurity / assignments.length;
}

function computeSizeStats(assignments, k) {
  const sizes = new Int32Array(k);
  for (const a of assignments) sizes[a]++;
  const s = Array.from(sizes);
  const mean = s.reduce((a, b) => a + b, 0) / k;
  const variance = s.reduce((sum, x) => sum + (x - mean) ** 2, 0) / k;
  return {
    min: Math.min(...s),
    max: Math.max(...s),
    mean: Math.round(mean),
    stddev: Math.round(Math.sqrt(variance)),
    empty_clusters: s.filter(x => x === 0).length,
  };
}

async function main() {
  console.log(`=== KMeans Multi-K Experiment — ${DRY_RUN ? 'DRY RUN' : 'LIVE'} ===`);
  console.log(`K values: ${K_VALUES.join(', ')}`);
  console.log('');

  const pool = new pg.Pool(PG_CONFIG);

  // Load topology feature vectors
  console.log('Loading atlas_topology_features...');
  const r = await pool.query(`
    SELECT packet_key, source_ref, feature_vector,
           som_row, som_col, kmeans_cluster, pagerank_score
    FROM atlas_topology_features
    WHERE feature_vector IS NOT NULL
    ORDER BY packet_key
  `);
  console.log(`  Loaded ${r.rows.length} feature vectors`);

  if (r.rows.length === 0) {
    console.log('❌ No topology features found — run atlas:gpu:export first');
    await pool.end();
    process.exit(1);
  }

  const vectors = r.rows.map(row => row.feature_vector.map(Number));
  const sourceRefs = r.rows.map(row => row.source_ref);
  const packetKeys = r.rows.map(row => row.packet_key);
  const dim = vectors[0].length;
  console.log(`  Feature dim: ${dim}`);
  console.log('');

  const results = [];

  for (const k of K_VALUES) {
    console.log(`[K=${k}] Running KMeans...`);
    const t0 = Date.now();

    const { assignments, centroids, iterations } = kmeans(vectors, k);
    const elapsed = Date.now() - t0;

    const inertia = computeInertia(vectors, assignments, centroids);
    console.log(`  Converged in ${iterations} iterations (${elapsed}ms)`);
    console.log(`  Inertia: ${inertia.toFixed(2)}`);

    const silhouette = computeSilhouetteSample(vectors, assignments, k);
    console.log(`  Silhouette (sample): ${silhouette.toFixed(4)}`);

    const domainPurity = computeDomainPurity(assignments, sourceRefs, k);
    console.log(`  Domain purity: ${(domainPurity * 100).toFixed(1)}%`);

    const sizeStats = computeSizeStats(assignments, k);
    console.log(`  Cluster sizes: min=${sizeStats.min}, max=${sizeStats.max}, mean=${sizeStats.mean}, stddev=${sizeStats.stddev}, empty=${sizeStats.empty_clusters}`);

    const result = {
      k,
      inertia,
      silhouette,
      domain_purity: domainPurity,
      size_stats: sizeStats,
      iterations,
      elapsed_ms: elapsed,
    };
    results.push(result);

    if (!DRY_RUN) {
      // Write assignments back to atlas_topology_features and atlas_packets
      console.log(`  Writing K=${k} assignments to atlas_packets...`);
      for (let i = 0; i < assignments.length; i += 500) {
        const batch = assignments.slice(i, i + 500);
        const keys = packetKeys.slice(i, i + 500);
        await pool.query(`
          UPDATE atlas_packets
          SET kmeans_cluster = data.cluster
          FROM (SELECT unnest($1::text[]) AS key, unnest($2::int[]) AS cluster) AS data
          WHERE atlas_packets.packet_key = data.key
        `, [keys, batch]);
      }

      // Store model in atlas_cluster_models
      try {
        await pool.query(`
          INSERT INTO atlas_cluster_models
            (model_type, k, inertia, silhouette_score, domain_purity,
             cluster_size_min, cluster_size_max, cluster_size_mean, cluster_size_stddev,
             empty_clusters, iterations, elapsed_ms, feature_dim)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          ON CONFLICT DO NOTHING
        `, [
          'kmeans_topology',
          k,
          inertia,
          silhouette,
          domainPurity,
          sizeStats.min,
          sizeStats.max,
          sizeStats.mean,
          sizeStats.stddev,
          sizeStats.empty_clusters,
          iterations,
          elapsed,
          dim,
        ]);
      } catch (e) {
        log(`  atlas_cluster_models insert failed (may not exist): ${e.message}`);
      }
    }
    console.log('');
  }

  await pool.end().catch(() => {});

  // Print comparison table
  console.log('=== KMeans Evaluation Summary ===');
  console.log(`${'K'.padEnd(6)} ${'Inertia'.padEnd(14)} ${'Silhouette'.padEnd(12)} ${'Purity'.padEnd(10)} ${'Empty'.padEnd(7)} ${'Time(ms)'}`);
  console.log('-'.repeat(62));
  for (const r of results) {
    console.log(
      `${String(r.k).padEnd(6)} ${r.inertia.toFixed(0).padEnd(14)} ${r.silhouette.toFixed(4).padEnd(12)} ${(r.domain_purity * 100).toFixed(1).padEnd(10)} ${String(r.size_stats.empty_clusters).padEnd(7)} ${r.elapsed_ms}`
    );
  }
  console.log('');

  // Recommend best K: highest silhouette, ≥80% purity, 0 empty clusters
  const eligible = results.filter(r => r.size_stats.empty_clusters === 0 && r.domain_purity >= 0.75);
  if (eligible.length > 0) {
    const best = eligible.reduce((a, b) => a.silhouette > b.silhouette ? a : b);
    console.log(`✅ Best K (silhouette): K=${best.k} — silhouette=${best.silhouette.toFixed(4)}, purity=${(best.domain_purity * 100).toFixed(1)}%`);
  } else {
    const best = results.reduce((a, b) => a.silhouette > b.silhouette ? a : b);
    console.log(`⚠ Best K (no ideal candidate): K=${best.k} — silhouette=${best.silhouette.toFixed(4)}, purity=${(best.domain_purity * 100).toFixed(1)}%`);
  }

  if (JSON_OUT) {
    const outPath = join(dirname(fileURLToPath(import.meta.url)), '../../docs/reports/kmeans-multi-k-experiment.json');
    writeFileSync(outPath, JSON.stringify({ k_values: K_VALUES, results, run_at: new Date().toISOString(), dry_run: DRY_RUN }, null, 2));
    console.log(`\nJSON report: docs/reports/kmeans-multi-k-experiment.json`);
  }
}

main().catch(e => {
  console.error('Fatal:', e.message);
  process.exit(2);
});
