#!/usr/bin/env node

/**
 * Phase 3 KMeans Clustering — Real Postgres Embeddings
 *
 * Reads 768-dim content_embedding vectors from codebase_chunk_index,
 * runs mini-batch K-means (pure JS, no GPU dependency for correctness),
 * then writes cluster assignments to atlas_packets via the confirmed join key:
 *   atlas_packets.source_ref = 'sveltekit-frontend/' || codebase_chunk_index.relative_path
 *
 * Also writes topolog_cluster, topolog_confidence, topolog_method, topolog_applied_at
 * to atlas_packets (matching the existing column contract).
 *
 * Usage:
 *   node scripts/phase-3-kmeans-cluster.mjs [--dry-run] [--verbose] [--k 32] [--limit 2000]
 *   node scripts/phase-3-kmeans-cluster.mjs --k 32 --limit 1000   (1K sample proof-of-concept)
 *   node scripts/phase-3-kmeans-cluster.mjs --k 64                (full dataset)
 */

import pg from 'pg';

const { Pool } = pg;

const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');
const K_IDX = process.argv.indexOf('--k');
const K = K_IDX !== -1 && process.argv[K_IDX + 1] ? parseInt(process.argv[K_IDX + 1], 10) : 32;
const LIMIT_IDX = process.argv.indexOf('--limit');
const LIMIT = LIMIT_IDX !== -1 && process.argv[LIMIT_IDX + 1] ? parseInt(process.argv[LIMIT_IDX + 1], 10) : 0;
const ITERS = 25; // mini-batch iterations
const BATCH_WRITE = 500;

const pool = new Pool({
  host: process.env.DB_HOST || '127.0.0.1',
  port: parseInt(process.env.DB_PORT || '5434'),
  user: process.env.DB_USER || 'legal_admin',
  password: process.env.DB_PASSWORD || '123456',
  database: process.env.DB_NAME || 'legal_ai_db',
  max: 5,
});

// ─── Mini-batch K-means (pure JS) ───────────────────────────────────────────

function dot(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}

function norm(a) {
  return Math.sqrt(dot(a, a));
}

function cosineSim(a, b) {
  const na = norm(a);
  const nb = norm(b);
  if (na === 0 || nb === 0) return 0;
  return dot(a, b) / (na * nb);
}

function cosineDistance(a, b) {
  return 1 - cosineSim(a, b);
}

function nearestCentroid(vec, centroids) {
  let bestIdx = 0;
  let bestDist = Infinity;
  for (let i = 0; i < centroids.length; i++) {
    const d = cosineDistance(vec, centroids[i]);
    if (d < bestDist) {
      bestDist = d;
      bestIdx = i;
    }
  }
  return { idx: bestIdx, dist: bestDist };
}

function initCentroidsKpp(vectors, k) {
  // K-means++ initialization
  const n = vectors.length;
  const chosen = [Math.floor(Math.random() * n)];
  const centroids = [vectors[chosen[0]].slice()];

  while (centroids.length < k) {
    // compute min distances to nearest centroid for each point
    const dists = vectors.map(v => {
      let minD = Infinity;
      for (const c of centroids) {
        const d = cosineDistance(v, c);
        if (d < minD) minD = d;
      }
      return minD * minD;
    });
    const sum = dists.reduce((a, b) => a + b, 0);
    let r = Math.random() * sum;
    let pick = 0;
    for (let i = 0; i < n; i++) {
      r -= dists[i];
      if (r <= 0) { pick = i; break; }
    }
    centroids.push(vectors[pick].slice());
    chosen.push(pick);
  }
  return centroids;
}

function runKmeans(vectors, k, iters) {
  const dim = vectors[0].length;
  const n = vectors.length;

  if (VERBOSE) console.log(`  K-means++: initializing ${k} centroids from ${n} vectors (dim=${dim})...`);
  let centroids = initCentroidsKpp(vectors, k);

  const assignments = new Int32Array(n);
  const counts = new Int32Array(k);
  let inertia = 0;

  for (let iter = 0; iter < iters; iter++) {
    // Assignment step
    inertia = 0;
    for (let i = 0; i < n; i++) {
      const { idx, dist } = nearestCentroid(vectors[i], centroids);
      assignments[i] = idx;
      inertia += dist;
    }

    // Update step — recompute centroids as mean of assigned vectors
    const newCentroids = Array.from({ length: k }, () => new Float64Array(dim));
    counts.fill(0);

    for (let i = 0; i < n; i++) {
      const c = assignments[i];
      counts[c]++;
      const v = vectors[i];
      const nc = newCentroids[c];
      for (let d = 0; d < dim; d++) nc[d] += v[d];
    }

    for (let c = 0; c < k; c++) {
      if (counts[c] === 0) {
        // Re-seed empty cluster from farthest point
        let maxDist = -1, maxIdx = 0;
        for (let i = 0; i < n; i++) {
          if (nearestCentroid(vectors[i], centroids).dist > maxDist) {
            maxDist = nearestCentroid(vectors[i], centroids).dist;
            maxIdx = i;
          }
        }
        newCentroids[c] = vectors[maxIdx].slice();
        counts[c] = 1;
      } else {
        const inv = 1 / counts[c];
        for (let d = 0; d < dim; d++) newCentroids[c][d] *= inv;
      }
    }

    centroids = newCentroids.map(c => Array.from(c));

    if (VERBOSE && (iter + 1) % 5 === 0) {
      console.log(`  iter ${iter + 1}/${iters}  inertia=${inertia.toFixed(4)}`);
    }
  }

  // Compute per-point confidence (1 - normalized distance)
  const maxDist = Math.max(...Array.from(assignments).map((c, i) => cosineDistance(vectors[i], centroids[c])));
  const confidences = Array.from(assignments).map((c, i) => {
    const d = cosineDistance(vectors[i], centroids[c]);
    return maxDist > 0 ? Math.max(0, 1 - d / maxDist) : 0.5;
  });

  return { assignments: Array.from(assignments), centroids, confidences, inertia, counts: Array.from(counts) };
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now();
  console.log('🔢 Phase 3 KMeans Clustering\n');
  console.log(`Mode:    ${DRY_RUN ? 'DRY RUN' : 'APPLY'}`);
  console.log(`K:       ${K} clusters`);
  console.log(`Limit:   ${LIMIT > 0 ? LIMIT + ' rows (sample)' : 'all rows'}`);
  console.log(`Iters:   ${ITERS}`);
  console.log('');

  const client = await pool.connect();
  try {
    // 1. Count available embeddings
    const countRes = await client.query(`
      SELECT COUNT(*) AS total
      FROM codebase_chunk_index ci
      JOIN atlas_packets ap ON ap.source_ref = 'sveltekit-frontend/' || ci.relative_path
      WHERE ci.content_embedding IS NOT NULL
        AND length(ci.relative_path) > 0
    `);
    const total = parseInt(countRes.rows[0].total);
    const fetchLimit = LIMIT > 0 ? Math.min(LIMIT, total) : total;
    console.log(`Joinable chunk→packet rows: ${total.toLocaleString()}`);
    console.log(`Fetching: ${fetchLimit.toLocaleString()} rows\n`);

    if (fetchLimit < K) {
      console.error(`ERROR: Need at least ${K} rows to form ${K} clusters. Only ${fetchLimit} available.`);
      process.exit(1);
    }

    // 2. Fetch embeddings from Postgres
    console.log('── Step 1: Loading embeddings from Postgres ──');
    const limitClause = LIMIT > 0 ? `LIMIT ${LIMIT}` : '';
    const rows = await client.query(`
      SELECT
        ci.relative_path,
        ap.packet_key,
        ap.source_ref,
        ci.content_embedding::text AS embedding_text
      FROM codebase_chunk_index ci
      JOIN atlas_packets ap ON ap.source_ref = 'sveltekit-frontend/' || ci.relative_path
      WHERE ci.content_embedding IS NOT NULL
        AND length(ci.relative_path) > 0
      ORDER BY ci.relative_path
      ${limitClause}
    `);

    console.log(`  Loaded ${rows.rows.length.toLocaleString()} rows`);

    // 3. Parse vectors from Postgres halfvec text format: [0.1,0.2,...]
    console.log('── Step 2: Parsing embedding vectors ──');
    const records = [];
    let parseErrors = 0;
    for (const row of rows.rows) {
      try {
        // halfvec text format: "[0.1,0.2,...]"
        const text = row.embedding_text;
        const nums = text.slice(1, -1).split(',').map(Number);
        if (nums.length < 64 || nums.some(isNaN)) {
          parseErrors++;
          continue;
        }
        records.push({
          packet_key: row.packet_key,
          source_ref: row.source_ref,
          relative_path: row.relative_path,
          vec: nums,
        });
      } catch {
        parseErrors++;
      }
    }
    console.log(`  Parsed: ${records.length.toLocaleString()} vectors (${parseErrors} parse errors skipped)`);
    if (records.length === 0) {
      console.error('ERROR: No valid vectors to cluster');
      process.exit(1);
    }
    const dim = records[0].vec.length;
    console.log(`  Vector dim: ${dim}`);

    if (DRY_RUN) {
      console.log('\n── DRY RUN: Would cluster with these parameters ──');
      console.log(`  Vectors: ${records.length.toLocaleString()}`);
      console.log(`  K: ${K}`);
      console.log(`  Iterations: ${ITERS}`);
      console.log(`  Sample vectors (first 3):`);
      for (const r of records.slice(0, 3)) {
        console.log(`    ${r.source_ref.slice(0, 60)} vec[0..4]=[${r.vec.slice(0, 4).map(v => v.toFixed(4)).join(',')}...]`);
      }
      console.log('\nDRY RUN complete. Re-run without --dry-run to cluster and write.');
      return;
    }

    // 4. Run K-means
    console.log(`\n── Step 3: Running K-means (K=${K}, ${ITERS} iters) ──`);
    const vectors = records.map(r => r.vec);
    const { assignments, centroids, confidences, inertia, counts } = runKmeans(vectors, K, ITERS);

    // Cluster size summary
    const nonEmptyClusters = counts.filter(c => c > 0).length;
    const maxClusterSize = Math.max(...counts);
    const minClusterSize = Math.min(...counts.filter(c => c > 0));
    console.log(`  Inertia: ${inertia.toFixed(4)}`);
    console.log(`  Non-empty clusters: ${nonEmptyClusters}/${K}`);
    console.log(`  Cluster sizes: min=${minClusterSize}, max=${maxClusterSize}, avg=${(records.length / nonEmptyClusters).toFixed(0)}`);

    if (VERBOSE) {
      const top5 = counts.map((c, i) => ({ i, c })).sort((a, b) => b.c - a.c).slice(0, 5);
      console.log('  Top 5 clusters by size:');
      for (const { i, c } of top5) {
        console.log(`    cluster ${i}: ${c} packets`);
      }
    }

    // 5. Write assignments to atlas_packets
    console.log(`\n── Step 4: Writing cluster assignments to atlas_packets ──`);
    const appliedAt = new Date().toISOString();
    let updated = 0;
    let skipped = 0;

    for (let batchStart = 0; batchStart < records.length; batchStart += BATCH_WRITE) {
      const batch = records.slice(batchStart, batchStart + BATCH_WRITE);
      const batchAssignments = assignments.slice(batchStart, batchStart + BATCH_WRITE);
      const batchConfidences = confidences.slice(batchStart, batchStart + BATCH_WRITE);

      // Build unnest arrays
      const packetKeys = batch.map(r => r.packet_key);
      const clusterIds = batchAssignments;
      const confValues = batchConfidences;

      try {
        const res = await client.query(`
          UPDATE atlas_packets ap
          SET
            topolog_cluster    = data.cluster_id,
            topolog_confidence = data.confidence,
            topolog_method     = 'phase3_kmeans_js',
            topolog_applied_at = $1,
            updated_at         = NOW()
          FROM (
            SELECT
              unnest($2::text[])  AS packet_key,
              unnest($3::int[])   AS cluster_id,
              unnest($4::real[])  AS confidence
          ) AS data
          WHERE ap.packet_key = data.packet_key
        `, [appliedAt, packetKeys, clusterIds, confValues]);

        updated += res.rowCount ?? 0;
      } catch (err) {
        console.error(`  Batch write error at offset ${batchStart}: ${err.message}`);
        skipped += batch.length;
      }

      if (!VERBOSE) {
        process.stdout.write(`\r  Written: ${(updated + skipped).toLocaleString()} / ${records.length.toLocaleString()} ...`);
      }
    }
    if (!VERBOSE) console.log('');

    // 6. Summary
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('\n📊 KMeans Clustering Complete');
    console.log('═'.repeat(60));
    console.log(`Vectors clustered:  ${records.length.toLocaleString()}`);
    console.log(`Clusters (K):       ${K}`);
    console.log(`Non-empty clusters: ${nonEmptyClusters}`);
    console.log(`Packets updated:    ${updated.toLocaleString()}`);
    console.log(`Skipped/errors:     ${skipped}`);
    console.log(`Final inertia:      ${inertia.toFixed(4)}`);
    console.log(`Duration:           ${duration}s`);
    console.log('═'.repeat(60));

    // 7. Verify
    const verifyRes = await client.query(`
      SELECT
        COUNT(*) FILTER (WHERE topolog_cluster IS NOT NULL) AS clustered,
        COUNT(*) AS total
      FROM atlas_packets
    `);
    const v = verifyRes.rows[0];
    console.log(`\nVerification: ${parseInt(v.clustered).toLocaleString()} / ${parseInt(v.total).toLocaleString()} packets now have topolog_cluster`);

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
