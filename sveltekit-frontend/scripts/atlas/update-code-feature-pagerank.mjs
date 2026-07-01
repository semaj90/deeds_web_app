#!/usr/bin/env node
/**
 * Update Code Features PageRank Scores
 *
 * Computes PageRank authority scores from code_feature_edges graph.
 * Stores scores back to code_features.page_rank_score.
 * Uses damping factor 0.85, 20 iterations.
 *
 * Usage:
 *   npm run atlas:code-features:pagerank --dry-run
 *   npm run atlas:code-features:pagerank --apply --verbose
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run') || !args.includes('--apply');
const verbose = args.includes('--verbose');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://legal_admin:123456@127.0.0.1:5434/legal_ai_db',
  max: 5,
});

const proof = {
  timestamp: new Date().toISOString(),
  mode: dryRun ? 'dry-run' : 'apply',
  stats: {
    features_total: 0,
    edges_total: 0,
    pagerank_computed: 0,
    pagerank_updated: 0,
    errors: 0,
    iterations: 20,
    damping_factor: 0.85
  },
  errors: []
};

/**
 * Simple PageRank implementation
 * Uses power iteration method: PR(A) = (1-d)/N + d * sum(PR(T)/C(T))
 */
async function computePageRank(features, edges, iterations = 20, dampingFactor = 0.85) {
  const featureIds = features.map(f => f.feature_id);
  const N = featureIds.length;

  // Initialize scores
  let scores = {};
  for (const id of featureIds) {
    scores[id] = 1 / N;
  }

  // Build adjacency graph
  const outlinks = {};
  for (const id of featureIds) {
    outlinks[id] = [];
  }

  for (const edge of edges) {
    if (outlinks[edge.from_feature_id]) {
      outlinks[edge.from_feature_id].push(edge.to_feature_id);
    }
  }

  // Compute out-degree for each node
  const outDegree = {};
  for (const id of featureIds) {
    outDegree[id] = Math.max(outlinks[id].length, 1); // Avoid division by zero
  }

  // Power iteration
  for (let iteration = 0; iteration < iterations; iteration++) {
    const newScores = {};

    for (const id of featureIds) {
      let score = (1 - dampingFactor) / N;

      // Sum contributions from inlinks
      for (const otherId of featureIds) {
        if (outlinks[otherId].includes(id)) {
          score += dampingFactor * (scores[otherId] / outDegree[otherId]);
        }
      }

      newScores[id] = score;
    }

    scores = newScores;
  }

  return scores;
}

/**
 * Fetch features and edges from database
 */
async function fetchGraphData(client) {
  console.log(`[1/4] Fetching code features...`);
  const featuresResult = await client.query(`SELECT feature_id FROM code_features`);
  const features = featuresResult.rows;
  proof.stats.features_total = features.length;
  console.log(`✓ Fetched ${features.length} features`);

  console.log(`[2/4] Fetching code feature edges...`);
  const edgesResult = await client.query(`SELECT from_feature_id, to_feature_id FROM code_feature_edges`);
  const edges = edgesResult.rows;
  proof.stats.edges_total = edges.length;
  console.log(`✓ Fetched ${edges.length} edges`);

  return { features, edges };
}

/**
 * Compute and update PageRank scores
 */
async function updatePageRankScores(client, features, edges) {
  console.log(`[3/4] Computing PageRank (${proof.stats.iterations} iterations, d=${proof.stats.damping_factor})...`);

  const scores = await computePageRank(features, edges, proof.stats.iterations, proof.stats.damping_factor);

  console.log(`✓ Computed ${Object.keys(scores).length} scores`);

  // Normalize scores to 0-1 range for interpretation
  const scoreValues = Object.values(scores);
  const maxScore = Math.max(...scoreValues);
  const minScore = Math.min(...scoreValues);
  const range = maxScore - minScore || 1;

  const normalizedScores = {};
  for (const [id, score] of Object.entries(scores)) {
    normalizedScores[id] = (score - minScore) / range;
  }

  console.log(`[4/4] Updating database...`);

  if (!dryRun) {
    let updated = 0;

    for (const feature of features) {
      const score = normalizedScores[feature.feature_id] || 0;

      try {
        await client.query(`
          UPDATE code_features
          SET page_rank_score = $1, page_rank_updated_at = NOW()
          WHERE feature_id = $2
        `, [score, feature.feature_id]);

        updated++;
      } catch (err) {
        proof.errors.push({
          feature_id: feature.feature_id,
          error: err.message
        });
        proof.stats.errors++;
      }
    }

    proof.stats.pagerank_computed = Object.keys(scores).length;
    proof.stats.pagerank_updated = updated;
    console.log(`✓ Updated ${updated} features`);
  } else {
    proof.stats.pagerank_computed = Object.keys(scores).length;
    console.log(`✓ (DRY-RUN) Would update ${Object.keys(scores).length} features`);
  }

  return normalizedScores;
}

async function main() {
  console.log(`📊 Code Features PageRank Computation\n`);
  console.log(`Mode: ${dryRun ? 'DRY-RUN (no writes)' : 'APPLY (writes enabled)'}\n`);

  try {
    console.log(`Connecting to database...`);
    await pool.connect();
    console.log(`✓ Connected\n`);

    const { features, edges } = await fetchGraphData(pool);

    if (features.length === 0) {
      console.log(`\n⚠️  No features found. Run backfill-code-feature-registry.mjs first.`);
      process.exit(1);
    }

    if (edges.length === 0) {
      console.log(`\n⚠️  No edges found. Backfill features may need to populate edge relations.`);
    }

    const scores = await updatePageRankScores(pool, features, edges);

    // Write proof report
    if (!dryRun) {
      const reportsDir = path.join(REPO_ROOT, 'docs/reports');
      try {
        await fs.mkdir(reportsDir, { recursive: true });
      } catch (err) {
        // Directory may already exist
      }

      await fs.writeFile(
        path.join(reportsDir, 'code-feature-pagerank-proof.json'),
        JSON.stringify(proof, null, 2)
      );
    }

    // Summary
    console.log(`\n✅ PageRank computation complete`);
    console.log(`Summary:`);
    console.log(`  Features: ${proof.stats.features_total}`);
    console.log(`  Edges: ${proof.stats.edges_total}`);
    console.log(`  Scores computed: ${proof.stats.pagerank_computed}`);
    console.log(`  Scores updated: ${proof.stats.pagerank_updated}`);
    console.log(`  Errors: ${proof.stats.errors}`);

    if (!dryRun && proof.stats.pagerank_updated > 0) {
      console.log(`\n📄 Proof: docs/reports/code-feature-pagerank-proof.json`);
    }

    process.exit(proof.stats.errors === 0 ? 0 : 1);
  } catch (err) {
    console.error(`✗ Fatal error:`, err);
    process.exit(1);
  } finally {
    pool.end().catch(() => {});
  }
}

main();
