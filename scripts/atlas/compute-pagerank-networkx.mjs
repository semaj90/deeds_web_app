#!/usr/bin/env node

/**
 * Phase 107: Compute PageRank (Node.js CPU-based)
 *
 * Computes PageRank scores for all topology nodes using pure Node.js.
 * Implements PageRank via power iteration algorithm.
 * Writes results to atlas_topology_index.pagerank.
 *
 * This is a CPU-based fallback when Neo4j GDS is unavailable.
 * Reads graph edges from atlas_topology_edges or reconstructs from Neo4j SIMILAR_TOPOLOGY.
 *
 * Usage:
 *   node scripts/atlas/compute-pagerank-networkx.mjs --dry-run
 *   node scripts/atlas/compute-pagerank-networkx.mjs --apply
 *   node scripts/atlas/compute-pagerank-networkx.mjs --apply --source=neo4j
 *   node scripts/atlas/compute-pagerank-networkx.mjs --apply --damping=0.85 --iterations=100
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../sveltekit-frontend/.env.local') });
dotenv.config({ path: path.join(__dirname, '../../sveltekit-frontend/.env') });

const { Pool } = pg;

// CLI arguments
const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const DRY_RUN = !APPLY;
const VERBOSE = args.includes('--verbose');
const source = args.find(a => a.startsWith('--source='))?.split('=')[1] || 'postgres';
const dampingArg = args.find(a => a.startsWith('--damping='));
const damping = dampingArg ? parseFloat(dampingArg.split('=')[1]) : 0.85;
const iterationsArg = args.find(a => a.startsWith('--iterations='));
const iterations = iterationsArg ? parseInt(iterationsArg.split('=')[1]) : 100;

const pool = new Pool({
  host: '127.0.0.1',
  port: 5434,
  user: 'legal_admin',
  password: '123456',
  database: 'legal_ai_db',
});

async function fetchEdgesFromPostgres() {
  console.log('\n📊 Fetching topology edges from Postgres...');

  try {
    const res = await pool.query(`
      SELECT
        source_packet_key as src,
        target_packet_key as dst,
        relationship_type,
        confidence
      FROM atlas_topology_edges
      LIMIT 100000
    `);

    const edges = res.rows.map(r => [r.src, r.dst]);
    console.log(`   ✓ Loaded ${edges.length} edges from atlas_topology_edges`);
    return edges;
  } catch (err) {
    console.log(`   ⚠️  Table not found or query failed: ${err.message}`);
    console.log('   Falling back to reconstructed edges from atlas_packets...\n');

    // Fallback: reconstruct edges from directory proximity (simple heuristic)
    const res = await pool.query(`
      SELECT DISTINCT
        ap1.packet_key as src,
        ap2.packet_key as dst
      FROM atlas_packets ap1, atlas_packets ap2
      WHERE ap1.packet_key != ap2.packet_key
        AND ap1.payload->'topology_materialized' IS NOT NULL
        AND ap2.payload->'topology_materialized' IS NOT NULL
        AND ap1.source_ref != ap2.source_ref
        -- Simple proximity: same directory or adjacent packages
        AND (
          SUBSTRING(ap1.source_ref, 1, POSITION('/' IN ap1.source_ref)) =
          SUBSTRING(ap2.source_ref, 1, POSITION('/' IN ap2.source_ref))
          OR ABS(LENGTH(ap1.source_ref) - LENGTH(ap2.source_ref)) < 50
        )
      LIMIT 50000
    `);

    const edges = res.rows.map(r => [r.src, r.dst]);
    console.log(`   ✓ Reconstructed ${edges.length} edges from directory proximity`);
    return edges;
  }
}

function computePageRankNodeJS(edges, damping, maxIterations) {
  console.log('\n🔄 Computing PageRank via power iteration (Node.js)...');

  // Build graph structure
  const graph = new Map();
  const nodeSet = new Set();

  for (const [src, dst] of edges) {
    nodeSet.add(src);
    nodeSet.add(dst);
    if (!graph.has(src)) graph.set(src, []);
    graph.get(src).push(dst);
  }

  const nodes = Array.from(nodeSet);
  const n = nodes.length;
  const nodeIndex = new Map(nodes.map((node, i) => [node, i]));

  console.log(`   Graph: ${n} nodes, ${edges.length} edges`);

  // Initialize PageRank
  const pr = new Array(n).fill(1 / n);
  const prNew = new Array(n);

  // Power iteration
  let converged = false;
  let actualIterations = 0;

  for (let iter = 0; iter < maxIterations; iter++) {
    prNew.fill(0);

    // For each node, distribute its PageRank to outlinks
    for (let i = 0; i < n; i++) {
      const node = nodes[i];
      const outlinks = graph.get(node) || [];

      if (outlinks.length === 0) {
        // Dangling node: distribute to all nodes
        for (let j = 0; j < n; j++) {
          prNew[j] += (damping * pr[i]) / n;
        }
      } else {
        // Normal node: distribute to outlinks
        for (const link of outlinks) {
          const j = nodeIndex.get(link);
          prNew[j] += (damping * pr[i]) / outlinks.length;
        }
      }
    }

    // Add teleport probability
    const teleportProb = (1 - damping) / n;
    for (let i = 0; i < n; i++) {
      prNew[i] += teleportProb;
    }

    // Check convergence
    let delta = 0;
    for (let i = 0; i < n; i++) {
      delta += Math.abs(prNew[i] - pr[i]);
    }

    for (let i = 0; i < n; i++) {
      pr[i] = prNew[i];
    }

    actualIterations++;

    if (delta < 1e-6) {
      converged = true;
      break;
    }

    if ((iter + 1) % 10 === 0 && VERBOSE) {
      console.log(`   Iteration ${iter + 1}: delta=${delta.toFixed(8)}`);
    }
  }

  // Normalize scores to [0, 1]
  const minScore = Math.min(...pr);
  const maxScore = Math.max(...pr);
  const range = maxScore - minScore || 1e-10;

  const scores = {};
  for (let i = 0; i < n; i++) {
    const normalizedScore = (pr[i] - minScore) / range;
    scores[nodes[i]] = normalizedScore;
  }

  const avgScore = pr.reduce((a, b) => a + b, 0) / n;

  console.log(`   Converged: ${converged}, Iterations: ${actualIterations}`);
  console.log(`   Score range: ${minScore.toFixed(6)} → ${maxScore.toFixed(6)}`);

  return {
    status: 'success',
    node_count: n,
    scores,
    min_score: minScore,
    max_score: maxScore,
    avg_score: avgScore,
  };
}

async function materializePageRankToDB(pageRankScores) {
  console.log('\n📝 Materializing PageRank to atlas_topology_index...');

  if (DRY_RUN) {
    console.log(`   ⚠️  DRY RUN: Would update ${Object.keys(pageRankScores).length} rows\n`);
    console.log('   Sample updates (first 5):');
    Object.entries(pageRankScores)
      .slice(0, 5)
      .forEach(([packetKey, score]) => {
        console.log(`     ${packetKey}: pagerank = ${score.toFixed(6)}`);
      });
    return;
  }

  let updated = 0;
  let errors = 0;

  // Convert scores object to sorted array for consistent processing
  const sortedScores = Object.entries(pageRankScores).sort((a, b) => a[0].localeCompare(b[0]));

  // Update in sequential batches using individual queries
  const batchSize = 100;
  for (let i = 0; i < sortedScores.length; i += batchSize) {
    const batch = sortedScores.slice(i, i + batchSize);

    try {
      // Use parameterized query to avoid SQL injection
      for (const [packetKey, score] of batch) {
        const res = await pool.query(
          'UPDATE atlas_topology_index SET pagerank = $1, tree_node_id = tree_node_id WHERE packet_key = $2',
          [score, packetKey]
        );
        if (res.rowCount > 0) {
          updated++;
        }
      }
    } catch (err) {
      if (VERBOSE) {
        console.error(`   ❌ Batch error (rows ${i}-${i + batchSize}): ${err.message}`);
      }
      errors++;
    }

    // Progress indicator
    if ((i + batchSize) % 1000 === 0 && VERBOSE) {
      console.log(`   Progress: ${Math.min(i + batchSize, sortedScores.length)} / ${sortedScores.length}`);
    }
  }

  console.log(`   ✓ Updated: ${updated}, Errors: ${errors}\n`);
}

async function verifyPageRankMaterialization() {
  console.log('✅ PHASE 4: Verify PageRank materialization...');

  const res = await pool.query(`
    SELECT
      COUNT(*) as total,
      COUNT(CASE WHEN pagerank IS NOT NULL THEN 1 END) as with_pagerank,
      COUNT(CASE WHEN pagerank > 0 THEN 1 END) as nonzero_pagerank,
      MIN(pagerank) as min_pagerank,
      MAX(pagerank) as max_pagerank,
      AVG(pagerank) as avg_pagerank
    FROM atlas_topology_index
  `);

  const stats = res.rows[0];
  console.log(`   Total rows: ${stats.total}`);
  console.log(`   With PageRank: ${stats.with_pagerank}`);
  console.log(`   Non-zero PageRank: ${stats.nonzero_pagerank}`);
  console.log(`   Range: ${stats.min_pagerank?.toFixed(6)} → ${stats.max_pagerank?.toFixed(6)}`);
  console.log(`   Average: ${stats.avg_pagerank?.toFixed(6)}\n`);

  return stats;
}

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║  Phase 107: Compute PageRank (NetworkX CPU-based)         ║');
  console.log(`║  Mode: ${DRY_RUN ? 'DRY-RUN' : 'APPLY'.padEnd(56)}║`);
  console.log(`║  Damping: ${damping}, Iterations: ${iterations}`.padEnd(61) + '║');
  console.log('╚════════════════════════════════════════════════════════════╝');

  try {
    // Phase 1: Fetch edges
    const edges = await fetchEdgesFromPostgres();

    if (edges.length === 0) {
      console.log('\n❌ No edges found. Cannot compute PageRank.');
      process.exit(1);
    }

    // Phase 2: Compute PageRank
    const prResult = computePageRankNodeJS(edges, damping, iterations);
    console.log(`   ✓ Computed PageRank for ${prResult.node_count} nodes`);
    console.log(`   Scores: min=${prResult.min_score.toFixed(6)}, max=${prResult.max_score.toFixed(6)}, avg=${prResult.avg_score.toFixed(6)}`);

    // Phase 3: Materialize to DB
    await materializePageRankToDB(prResult.scores);

    // Phase 4: Verify
    const stats = await verifyPageRankMaterialization();

    console.log('═══════════════════════════════════════════════════════════');
    console.log('✅ PageRank computation complete!');
    console.log(`   Coverage: ${((stats.with_pagerank / stats.total) * 100).toFixed(1)}%`);
    console.log('   Next: Run registry materialization:');
    console.log('   node scripts/atlas/materialize-feature-registry-alignment.mjs --apply\n');

    await pool.end();
  } catch (err) {
    console.error('\n❌ Error:', err.message);
    if (VERBOSE) console.error(err.stack);
    await pool.end();
    process.exit(1);
  }
}

main();
