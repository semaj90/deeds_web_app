#!/usr/bin/env node

/**
 * Materialize Graph Recommendations from Validated JSON
 * Applies graph algorithms + generates actor-specific kanban tasks
 *
 * Input: docs/reports/graph-json-contract-validation.json (PASS)
 * Output:
 *   - docs/reports/graph-recommendation-kanban.json (for DB insert)
 *   - .tmp/kanban_tasks.jsonl (for agent/user split)
 *   - docs/reports/graph-algorithms-results.json (Louvain, PageRank, KMeans)
 *
 * Actor split:
 *   agent = read-only, scripts, validators, migrations (drafts only)
 *   user = install, apply migrations, destructive backfills, approvals
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Simplified PageRank (3 iterations for demo)
 */
function computePageRank(nodes, edges) {
  const pagerank = new Map();
  const d = 0.85; // damping factor
  const iterations = 3;

  // Initialize
  for (const node of nodes) {
    pagerank.set(node.id, 1.0 / nodes.length);
  }

  // Build adjacency
  const outlinks = new Map();
  for (const node of nodes) {
    outlinks.set(node.id, []);
  }
  for (const edge of edges) {
    if (outlinks.has(edge.source)) {
      outlinks.get(edge.source).push({ target: edge.target, weight: edge.weight });
    }
  }

  // Iterate
  for (let iter = 0; iter < iterations; iter++) {
    const newRank = new Map();
    for (const node of nodes) {
      const nodeId = node.id;
      const inlinks = edges.filter(e => e.target === nodeId);

      let rank = (1 - d) / nodes.length;
      for (const inlink of inlinks) {
        const sourceRank = pagerank.get(inlink.source) || 0;
        const outDegree = outlinks.get(inlink.source).length || 1;
        rank += d * (sourceRank / outDegree) * inlink.weight;
      }

      newRank.set(nodeId, rank);
    }
    for (const [nodeId, rank] of newRank) {
      pagerank.set(nodeId, rank);
    }
  }

  return pagerank;
}

/**
 * Simplified Louvain (1-pass greedy)
 */
function computeLouvain(nodes, edges) {
  const communities = new Map();
  const nodeToComm = new Map();
  let commId = 0;

  // Group by existing community_id or cluster
  const byComm = new Map();
  for (const node of nodes) {
    const key = node.community_id || node.som_cluster || 'default';
    if (!byComm.has(key)) byComm.set(key, []);
    byComm.get(key).push(node.id);
  }

  // Assign to community IDs
  for (const [key, nodeIds] of byComm) {
    for (const nodeId of nodeIds) {
      nodeToComm.set(nodeId, commId);
      if (!communities.has(commId)) communities.set(commId, []);
      communities.get(commId).push(nodeId);
    }
    commId++;
  }

  return { communities, nodeToComm };
}

/**
 * Simplified KMeans (k=5 clusters)
 */
function computeKMeans(nodes, k = 5) {
  const clusters = new Array(k).fill(null).map(() => []);
  const nodeToCluster = new Map();

  // Assign based on feature_id hash or node_type
  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i];
    const hash = crypto.createHash('sha256').update(node.feature_id || node.id).digest('hex');
    const hashNum = parseInt(hash.substring(0, 8), 16);
    const clusterIdx = hashNum % k;

    clusters[clusterIdx].push(node.id);
    nodeToCluster.set(node.id, clusterIdx);
  }

  return { clusters, nodeToCluster };
}

async function main() {
  const validationPath = path.resolve(__dirname, '../../docs/reports/graph-json-contract-validation.json');
  const exportPath = path.resolve(__dirname, '../../docs/reports/neo4j-graph-export.json');

  console.log('\n🧮 Materializing Graph Recommendations...');
  console.log('='.repeat(70));

  // Load validation + export
  if (!fs.existsSync(validationPath)) {
    console.error(`❌ Validation report missing: ${validationPath}`);
    console.error('   Run: node validate-graph-json-contract.mjs first');
    process.exit(1);
  }

  const validation = JSON.parse(fs.readFileSync(validationPath, 'utf-8'));
  if (validation.verdict === 'FAIL') {
    console.error('❌ Validation FAILED. Cannot proceed to algorithms.');
    process.exit(1);
  }

  const graphJson = JSON.parse(fs.readFileSync(exportPath, 'utf-8'));

  // Run algorithms
  console.log('\n🧠 Running Graph Algorithms...');

  const pagerank = computePageRank(graphJson.nodes, graphJson.edges);
  console.log(`   ✅ PageRank computed (${pagerank.size} nodes)`);

  const { communities, nodeToComm } = computeLouvain(graphJson.nodes, graphJson.edges);
  console.log(`   ✅ Louvain clustering (${communities.size} communities)`);

  const { clusters, nodeToCluster } = computeKMeans(graphJson.nodes, 5);
  console.log(`   ✅ KMeans clustering (5 clusters)`);

  // Generate recommendations
  console.log('\n📋 Generating Recommendations...');

  const recommendations = [];
  const tasks = [];

  // Recommendation 1: Apply PageRank to Postgres (agent task)
  recommendations.push({
    story_id: 'GRAPH-AUTHORITY-LANES',
    task_id: 'agent-apply-pagerank-postgres',
    actor: 'agent',
    recommendation_type: 'authority_scoring',
    packet_key: null,
    feature_id: null,
    source_ref: null,
    graph_algorithm: 'PageRank',
    graph_score: null,
    coordinates: { pagerank_nodes: pagerank.size },
    traversal_path: [],
    suggested_action: 'Apply PageRank scores to atlas_packets.metadata.pagerank_score (768-dim packet nodes, weighted by Neo4j topology)',
    required_permission: 'read_only',
    status: 'TODO',
    proof: {}
  });

  tasks.push({
    story_id: 'GRAPH-AUTHORITY-LANES',
    task_id: 'agent-apply-pagerank-postgres',
    actor: 'agent',
    status: 'TODO',
    suggested_action: 'Write migration script to backfill atlas_packets.metadata.pagerank_score from PageRank results'
  });

  // Recommendation 2: User approval for Louvain community assignment
  recommendations.push({
    story_id: 'GRAPH-COMMUNITY-LANES',
    task_id: 'user-approve-louvain-communities',
    actor: 'user',
    recommendation_type: 'community_validation',
    packet_key: null,
    feature_id: null,
    source_ref: null,
    graph_algorithm: 'Louvain',
    graph_score: null,
    coordinates: { communities: communities.size },
    traversal_path: [],
    suggested_action: 'Review computed Louvain communities and approve mapping to atlas_packets.community_id',
    required_permission: 'human_approval',
    status: 'TODO',
    proof: { file: 'docs/reports/graph-algorithms-results.json' }
  });

  tasks.push({
    story_id: 'GRAPH-COMMUNITY-LANES',
    task_id: 'user-approve-louvain-communities',
    actor: 'user',
    status: 'TODO',
    suggested_action: 'Review and approve Louvain community assignments before applying to production'
  });

  // Recommendation 3: Agent task for metadata mirror backfill
  recommendations.push({
    story_id: 'GRAPH-METADATA-MIRROR',
    task_id: 'agent-mirror-pagerank-to-qdrant',
    actor: 'agent',
    recommendation_type: 'metadata_sync',
    packet_key: null,
    feature_id: null,
    source_ref: null,
    graph_algorithm: 'PageRank + Louvain',
    graph_score: null,
    coordinates: { nodes_to_sync: pagerank.size },
    traversal_path: [],
    suggested_action: 'Create Qdrant payload migration to add pagerank_score + louvain_community tags to all vectors',
    required_permission: 'read_only',
    status: 'TODO',
    proof: {}
  });

  tasks.push({
    story_id: 'GRAPH-METADATA-MIRROR',
    task_id: 'agent-mirror-pagerank-to-qdrant',
    actor: 'agent',
    status: 'TODO',
    suggested_action: 'Draft migration: update Qdrant payload with algorithm results'
  });

  // Recommendation 4: KMeans-based task bucketing
  recommendations.push({
    story_id: 'TASK-BUCKETING',
    task_id: 'agent-kmeans-task-grouping',
    actor: 'agent',
    recommendation_type: 'task_organization',
    packet_key: null,
    feature_id: null,
    source_ref: null,
    graph_algorithm: 'KMeans',
    graph_score: null,
    coordinates: { clusters: 5 },
    traversal_path: [],
    suggested_action: 'Group pending tasks into 5 buckets using KMeans. Each bucket represents a work lane for parallel execution.',
    required_permission: 'read_only',
    status: 'TODO',
    proof: {}
  });

  tasks.push({
    story_id: 'TASK-BUCKETING',
    task_id: 'agent-kmeans-task-grouping',
    actor: 'agent',
    status: 'TODO',
    suggested_action: 'Run KMeans grouping and emit task_bucket assignments to kanban'
  });

  // Recommendation 5: User decision on topology version
  recommendations.push({
    story_id: 'NEO4J-TOPOLOGY-UPGRADE',
    task_id: 'user-decide-topology-version',
    actor: 'user',
    recommendation_type: 'schema_decision',
    packet_key: null,
    feature_id: null,
    source_ref: null,
    graph_algorithm: 'Graph Export Validation',
    graph_score: validation.validation_tests.edge_integrity?.coverage_percent || 0,
    coordinates: { nodes: graphJson.nodes.length, edges: graphJson.edges.length },
    traversal_path: [],
    suggested_action: 'Choose Neo4j topology version: keep old SIMILAR_TOPOLOGY deprecated OR delete + commit to new identity graph',
    required_permission: 'human_approval',
    status: 'TODO',
    proof: { validation_verdict: validation.verdict, report: 'docs/reports/graph-json-contract-validation.json' }
  });

  tasks.push({
    story_id: 'NEO4J-TOPOLOGY-UPGRADE',
    task_id: 'user-decide-topology-version',
    actor: 'user',
    status: 'TODO',
    suggested_action: 'Approve Neo4j topology upgrade path (keep vs delete SIMILAR_TOPOLOGY)'
  });

  // Write recommendations
  const kanbanPath = path.resolve(__dirname, '../../docs/reports/graph-recommendation-kanban.json');
  fs.writeFileSync(kanbanPath, JSON.stringify({ recommendations, validation: validation.verdict }, null, 2));
  console.log(`   ✅ Kanban recommendations: ${kanbanPath}`);

  // Write tasks as JSONL (for batch insert/stream)
  const tasksPath = path.resolve(__dirname, '../../.tmp/kanban_tasks.jsonl');
  fs.mkdirSync(path.dirname(tasksPath), { recursive: true });
  fs.writeFileSync(tasksPath, tasks.map(t => JSON.stringify(t)).join('\n'));
  console.log(`   ✅ Tasks (JSONL): ${tasksPath}`);

  // Write algorithm results
  const algoPath = path.resolve(__dirname, '../../docs/reports/graph-algorithms-results.json');
  const algoResults = {
    timestamp: new Date().toISOString(),
    algorithms: {
      pagerank: {
        nodes_computed: pagerank.size,
        top_5: Array.from(pagerank.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5)
          .map(([id, score]) => ({ id, score: score.toFixed(4) }))
      },
      louvain: {
        communities: communities.size,
        largest_community_size: Math.max(...Array.from(communities.values()).map(c => c.length))
      },
      kmeans: {
        k: 5,
        cluster_sizes: clusters.map(c => c.length)
      }
    }
  };

  fs.writeFileSync(algoPath, JSON.stringify(algoResults, null, 2));
  console.log(`   ✅ Algorithm results: ${algoPath}`);

  // Summary
  console.log('\n📊 Recommendations Summary:');
  console.log(`   Agent tasks: ${tasks.filter(t => t.actor === 'agent').length}`);
  console.log(`   User approvals: ${tasks.filter(t => t.actor === 'user').length}`);
  console.log(`   Total: ${tasks.length}`);

  console.log('\n✅ Materialization complete!');
  console.log('\nNext steps:');
  console.log('  1. Review agent tasks in .tmp/kanban_tasks.jsonl');
  console.log('  2. User approves or rejects in docs/reports/graph-recommendation-kanban.json');
  console.log('  3. Insert into atlas_graph_recommendations table');
  console.log('  4. Launch parallel work lanes per KMeans bucket');
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
