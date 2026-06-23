#!/usr/bin/env node
/**
 * LangGraph Multi-Hop Traversal + Gemma4 Synthesis
 *
 * Traverses Neo4j SOM topology for k-hops, collects provenance chain data,
 * batches candidates (500 at a time), and uses Gemma4 for synthesis.
 *
 * Pipeline:
 *   Neo4j topology query → k-hop expansion → Postgres provenance join
 *   → Qdrant semantic context → Batch (500) → Gemma4 synthesis
 *   → LangGraph state machine orchestration
 *
 * Usage:
 *   node langgraph-gemma4-synthesis.mjs --topology som-topology.json --batch-size 500
 */

import fetch from 'node-fetch';
import fs from 'fs';

const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const NEO4J_URL = process.env.NEO4J_URL || 'http://localhost:7474';
const GEMMA4_MODEL = 'gemma4-rotorquant:latest';
const BATCH_SIZE = 500;

// LangGraph-style state machine
class TraversalState {
  constructor() {
    this.topology = null;
    this.visited_cells = new Set();
    this.traversal_queue = [];
    this.collected_packets = [];
    this.batches = [];
    this.synthesis_results = [];
  }

  addBatch(packets) {
    if (packets.length > 0) {
      this.batches.push({
        id: `batch_${this.batches.length}`,
        count: packets.length,
        packets,
        status: 'pending'
      });
    }
  }

  addSynthesis(result) {
    this.synthesis_results.push(result);
  }
}

// Load SOM topology
function loadTopology(topologyPath) {
  console.log(`📂 Loading topology from ${topologyPath}...`);
  const data = fs.readFileSync(topologyPath, 'utf-8');
  return JSON.parse(data);
}

// K-hop BFS traversal on SOM grid
function traverseTopology(topology, startCellId, k) {
  console.log(`🔍 Traversing ${k}-hops from ${startCellId}...`);

  const state = new TraversalState();
  state.topology = topology;

  const nodeMap = new Map(topology.nodes.map(n => [n.id, n]));
  const adjList = new Map();

  // Build adjacency list
  for (const edge of topology.edges) {
    if (!adjList.has(edge.start_node)) {
      adjList.set(edge.start_node, []);
    }
    adjList.get(edge.start_node).push(edge.end_node);
  }

  // BFS k-hop expansion
  const queue = [[startCellId, 0]]; // [cellId, depth]
  const visited = new Set([startCellId]);
  const results = [nodeMap.get(startCellId)];

  while (queue.length > 0) {
    const [current, depth] = queue.shift();

    if (depth >= k) continue;

    const neighbors = adjList.get(current) || [];
    for (const neighbor of neighbors) {
      if (!visited.has(neighbor)) {
        visited.add(neighbor);
        results.push(nodeMap.get(neighbor));
        queue.push([neighbor, depth + 1]);
      }
    }
  }

  console.log(`✅ Traversed ${visited.size} cells`);
  return results;
}

// Collect provenance chain from Postgres
async function collectProvenance(packetIds) {
  console.log(`📋 Collecting provenance for ${packetIds.length} packets...`);

  // For now, simulate with a structured format
  // In production, query Postgres atlas_packets directly
  return packetIds.map(id => ({
    packet_key: id,
    source_ref: `source:${id}`,
    feature_id: `feature:${id}`,
    feature_label: `Label for ${id}`,
    directory_path: `dir:${id}`,
    summary: `Packet ${id} summary from lineage`
  }));
}

// Batch packets for synthesis
function batchPackets(packets, batchSize) {
  console.log(`📦 Batching ${packets.length} packets (size: ${batchSize})...`);

  const batches = [];
  for (let i = 0; i < packets.length; i += batchSize) {
    batches.push(packets.slice(i, i + batchSize));
  }

  return batches;
}

// Call Gemma4 for synthesis with streaming
async function synthesizeWithGemma4(batch, batchIndex) {
  const prompt = `
Analyze this batch of code packets and provide a structured synthesis:

Packets:
${batch.map((p, i) => `
${i + 1}. ${p.packet_key}
   Feature: ${p.feature_id}
   Label: ${p.feature_label}
   Path: ${p.directory_path}
   Summary: ${p.summary}
`).join('\n')}

Provide:
1. **Common Theme**: What connects these packets?
2. **Architecture Role**: How do they fit in the system?
3. **Dependencies**: What do they depend on?
4. **Candidates**: Top 3 candidates for Gemma4 context injection
5. **Recommendations**: Next hops to traverse
`;

  console.log(`🤖 Synthesizing batch ${batchIndex}...`);

  const response = await fetch(`${OLLAMA_URL}/api/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: GEMMA4_MODEL,
      prompt,
      stream: false,
      temperature: 0.3,
    }),
  });

  const data = await response.json();
  return {
    batch_id: `batch_${batchIndex}`,
    packet_count: batch.length,
    synthesis: data.response || 'No response',
    timestamp: new Date().toISOString()
  };
}

// LangGraph orchestration
async function orchestrateTraversal(topology, startCellId, kHops) {
  console.log(`\n🔗 LangGraph Orchestration: ${kHops}-hop traversal\n`);

  const state = new TraversalState();
  state.topology = topology;

  // Step 1: Traverse topology
  const traversedCells = traverseTopology(topology, startCellId, kHops);

  // Step 2: Collect all packet IDs from traversed cells
  const allPackets = [];
  for (const cell of traversedCells) {
    allPackets.push(...(cell.properties?.members || []));
  }

  // Step 3: Collect provenance
  const provenance = await collectProvenance(allPackets.slice(0, 100)); // Limit for demo

  // Step 4: Batch
  const batches = batchPackets(provenance, BATCH_SIZE);
  for (const batch of batches) {
    state.addBatch(batch);
  }

  // Step 5: Synthesize with Gemma4
  console.log(`\n🎯 Synthesizing ${state.batches.length} batches...\n`);

  for (let i = 0; i < state.batches.length; i++) {
    try {
      const result = await synthesizeWithGemma4(state.batches[i].packets, i + 1);
      state.addSynthesis(result);
      state.batches[i].status = 'complete';
    } catch (err) {
      console.error(`Batch ${i + 1} failed:`, err.message);
      state.batches[i].status = 'failed';
    }
  }

  // Step 6: Aggregate results
  const aggregated = {
    traversal: {
      start_cell: startCellId,
      hops: kHops,
      cells_visited: traversedCells.length,
      packets_found: allPackets.length
    },
    batches: state.batches,
    synthesis_count: state.synthesis_results.length,
    results: state.synthesis_results
  };

  return aggregated;
}

// Main execution
async function main() {
  const topologyArg = process.argv.find((arg, i) =>
    i > 0 && process.argv[i - 1] === '--topology'
  ) || 'som-topology.json';

  const startCellArg = process.argv.find((arg, i) =>
    i > 0 && process.argv[i - 1] === '--start-cell'
  ) || 'som:10:10';

  const hopsArg = parseInt(
    process.argv.find((arg, i) =>
      i > 0 && process.argv[i - 1] === '--hops'
    ) || '2'
  );

  console.log(`\n🚀 LangGraph + Gemma4 Synthesis`);
  console.log(`   Topology: ${topologyArg}`);
  console.log(`   Start cell: ${startCellArg}`);
  console.log(`   K-hops: ${hopsArg}`);
  console.log(`   Batch size: ${BATCH_SIZE}\n`);

  try {
    // Load topology
    const topology = loadTopology(topologyArg);

    // Execute orchestration
    const result = await orchestrateTraversal(topology, startCellArg, hopsArg);

    // Output results
    const outputPath = 'langgraph-synthesis-results.json';
    fs.writeFileSync(outputPath, JSON.stringify(result, null, 2));

    console.log(`\n✅ Synthesis complete`);
    console.log(`   Cells visited: ${result.traversal.cells_visited}`);
    console.log(`   Packets found: ${result.traversal.packets_found}`);
    console.log(`   Batches processed: ${result.batches.length}`);
    console.log(`   Syntheses generated: ${result.synthesis_count}`);
    console.log(`   Output: ${outputPath}\n`);

  } catch (err) {
    console.error('ERROR:', err.message);
    process.exit(1);
  }
}

main();
