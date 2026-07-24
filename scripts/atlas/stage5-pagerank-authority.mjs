#!/usr/bin/env node
/**
 * Stage 5: Authority Ranking via PageRank
 *
 * Input: docs/stage4/topology_facts.ndjson (nodes and edges)
 * Process: Compute PageRank scores on extracted graph
 * Output: docs/stage5/pagerank_authority.ndjson
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';

const WORKSPACE_ID = 'legal-ai:deeds-web-app';
const REPO_ROOT = process.cwd();
const INPUT_FILE = path.join(REPO_ROOT, 'docs', 'stage4', 'topology_facts.ndjson');
const OUTPUT_DIR = path.join(REPO_ROOT, 'docs', 'stage5');
const OUTPUT_FILE = path.join(OUTPUT_DIR, 'pagerank_authority.ndjson');

const DAMPING_FACTOR = 0.85;
const MAX_ITERATIONS = 10;
const CONVERGENCE_THRESHOLD = 0.001;

// Ensure output directory exists
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

class SimplePageRank {
  constructor() {
    this.nodes = new Map();
    this.edges = new Map();
    this.ranks = new Map();
  }

  addNode(id) {
    if (!this.nodes.has(id)) {
      this.nodes.set(id, { id, inDegree: 0, outDegree: 0 });
      this.ranks.set(id, 1.0);
    }
  }

  addEdge(source, target) {
    this.addNode(source);
    this.addNode(target);

    if (!this.edges.has(source)) {
      this.edges.set(source, []);
    }
    this.edges.get(source).push(target);

    const targetNode = this.nodes.get(target);
    targetNode.inDegree++;

    const sourceNode = this.nodes.get(source);
    sourceNode.outDegree++;
  }

  compute() {
    const n = this.nodes.size;
    if (n === 0) return;

    const newRanks = new Map();
    for (const nodeId of this.nodes.keys()) {
      newRanks.set(nodeId, (1 - DAMPING_FACTOR) / n);
    }

    for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
      let maxDelta = 0;

      for (const [nodeId, rank] of this.ranks) {
        const outEdges = this.edges.get(nodeId) || [];
        const contribution = rank / (outEdges.length || 1);

        for (const targetId of outEdges) {
          newRanks.set(targetId, (newRanks.get(targetId) || 0) + DAMPING_FACTOR * contribution);
        }
      }

      for (const [nodeId, newRank] of newRanks) {
        const oldRank = this.ranks.get(nodeId);
        const delta = Math.abs(newRank - oldRank);
        maxDelta = Math.max(maxDelta, delta);
        this.ranks.set(nodeId, newRank);
      }

      if (maxDelta < CONVERGENCE_THRESHOLD) {
        break;
      }
    }
  }

  getRank(nodeId) {
    return this.ranks.get(nodeId) || 0;
  }
}

async function execute() {
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('GRAPHIFY STAGE 5: AUTHORITY RANKING (PAGERANK)');
  console.log('═══════════════════════════════════════════════════════════\n');

  console.log('[Stage 5] Step 1: Load topology facts');
  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`[ERROR] Input file not found: ${INPUT_FILE}`);
    console.log('[Stage 5] Skipping — Stage 4 not yet complete');
    process.exit(0);
  }

  const topologyFacts = [];
  const readline_instance = readline.createInterface({
    input: fs.createReadStream(INPUT_FILE),
    crlfDelay: Infinity
  });

  for await (const line of readline_instance) {
    if (line.trim().length > 0) {
      try {
        topologyFacts.push(JSON.parse(line));
      } catch (err) {
        // Skip malformed lines
      }
    }
  }

  console.log(`  → Loaded: ${topologyFacts.length} topology facts`);

  console.log('\n[Stage 5] Step 2: Build graph from topology facts');
  const pr = new SimplePageRank();
  let nodeCount = 0;
  let edgeCount = 0;

  for (const fact of topologyFacts) {
    if (fact.type === 'node') {
      pr.addNode(`${fact.normalized_path}:${fact.symbol_name}`);
      nodeCount++;
    } else if (fact.type === 'edge') {
      pr.addEdge(fact.source, fact.target);
      edgeCount++;
    }
  }

  console.log(`  → Graph: ${nodeCount} nodes, ${edgeCount} edges`);

  console.log('\n[Stage 5] Step 3: Compute PageRank');
  pr.compute();
  console.log(`  → PageRank computed (${MAX_ITERATIONS} max iterations, threshold ${CONVERGENCE_THRESHOLD})`);

  console.log('\n[Stage 5] Step 4: Output authority scores');
  const authorityScores = [];

  for (const fact of topologyFacts) {
    if (fact.type === 'node') {
      const nodeId = `${fact.normalized_path}:${fact.symbol_name}`;
      const rank = pr.getRank(nodeId);

      authorityScores.push({
        workspace_id: WORKSPACE_ID,
        normalized_path: fact.normalized_path,
        symbol_name: fact.symbol_name,
        symbol_type: fact.kind,
        language: fact.language,
        pagerank_score: rank,
        authority_level: rank > 0.05 ? 'high' : rank > 0.01 ? 'medium' : 'low',
        extraction_version: '1.0',
        computed_at: new Date().toISOString()
      });
    }
  }

  // Sort by PageRank descending
  authorityScores.sort((a, b) => b.pagerank_score - a.pagerank_score);

  const ndjson = authorityScores.map(s => JSON.stringify(s)).join('\n') + (authorityScores.length > 0 ? '\n' : '');
  fs.writeFileSync(OUTPUT_FILE, ndjson, 'utf-8');

  console.log(`  → Output: pagerank_authority.ndjson (${authorityScores.length} scores)`);

  // Print top 20
  console.log('\n[Stage 5] Top 20 high-authority symbols:');
  const top20 = authorityScores.slice(0, 20);
  for (let i = 0; i < top20.length; i++) {
    const score = top20[i];
    console.log(`  ${i + 1}. ${score.symbol_name} (${score.normalized_path}) - PageRank: ${score.pagerank_score.toFixed(6)}`);
  }

  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('✓ STAGE 5 COMPLETE: AUTHORITY RANKING FINISHED');
  console.log('═══════════════════════════════════════════════════════════\n');
  console.log('Next: Execute Stage 6 (Validation & Consolidation)');
  console.log('Reference: memory/STAGE-5-PAGERANK-AUTHORITY.md\n');
}

execute().catch(err => {
  console.error('[ERROR]', err);
  process.exit(1);
});
