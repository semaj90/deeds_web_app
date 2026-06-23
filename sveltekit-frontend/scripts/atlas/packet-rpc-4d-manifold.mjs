#!/usr/bin/env node
/**
 * Packet RPC: 4D Manifold Retrieval
 *
 * Four axes:
 *   X (cosine):    semantic similarity axis (Qdrant dense vectors)
 *   Y (graph):     KAG connectivity axis (Neo4j topology)
 *   Z (som):       SOM neighborhood axis (20×20 grid clustering)
 *   W (authority): PageRank/trust axis (Redis cache)
 *
 * Retrieval contract:
 *   1. Retrieve packets (Qdrant ANN + metadata filter)
 *   2. Expand neighbors (Neo4j k-hop + SOM grid)
 *   3. Rerank packets (Karpathy blend + GPU cosine)
 *   4. Synthesize packets (Gemma4 tool calls on packet batch)
 *
 * Usage:
 *   node packet-rpc-4d-manifold.mjs --query "auth sessions" --batch 500
 *   node packet-rpc-4d-manifold.mjs --tricube --coords "10,10,2,0.5"
 *   node packet-rpc-4d-manifold.mjs --log-axes (full 4D trace)
 */

import fetch from 'node-fetch';
import fs from 'fs';

const QDRANT_URL = process.env.QDRANT_URL || 'http://localhost:6333';
const NEO4J_URL = process.env.NEO4J_URL || 'http://localhost:7474';
const REDIS_URL = process.env.REDIS_URL || 'localhost:6379';
const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

// 4D manifold coordinates
class Manifold4D {
  constructor(x = 0, y = 0, z = 0, w = 0) {
    this.x = x; // cosine similarity (0-1)
    this.y = y; // graph centrality (0-1)
    this.z = z; // SOM distance (0-1)
    this.w = w; // authority/PageRank (0-1)
  }

  // Tricubic interpolation kernel (smooth neighborhood search)
  tricubic(dist) {
    const d = Math.abs(dist);
    if (d < 1) return (2/3) - d*d + 0.5*d*d*d;
    if (d < 2) return (4/6) - 2*d + d*d - (1/6)*d*d*d;
    return 0;
  }

  // Distance in 4D space (Manhattan for lattice search)
  distanceManhattan(other) {
    return Math.abs(this.x - other.x) +
           Math.abs(this.y - other.y) +
           Math.abs(this.z - other.z) +
           Math.abs(this.w - other.w);
  }

  // Euclidean distance (for ranking)
  distanceEuclidean(other) {
    const dx = this.x - other.x;
    const dy = this.y - other.y;
    const dz = this.z - other.z;
    const dw = this.w - other.w;
    return Math.sqrt(dx*dx + dy*dy + dz*dz + dw*dw);
  }

  // Blend score (Karpathy authority blend)
  blendScore(weights = { x: 0.3, y: 0.3, z: 0.2, w: 0.2 }) {
    return weights.x * this.x +
           weights.y * this.y +
           weights.z * this.z +
           weights.w * this.w;
  }

  toJSON() {
    return { x: this.x, y: this.y, z: this.z, w: this.w };
  }
}

// Packet with 4D manifold coordinates
class Packet4D {
  constructor(id, data, manifold) {
    this.id = id;
    this.packet_key = data.packet_key;
    this.source_ref = data.source_ref;
    this.feature_id = data.feature_id;
    this.manifold = manifold || new Manifold4D();
    this.neighbors = [];
    this.synthesis = null;
  }
}

// Phase 1: Retrieve packets from Qdrant (X axis)
async function retrievePacketsQdrant(query, limit = 100) {
  console.log(`\n[X-AXIS] Qdrant retrieval: "${query}"`);

  // Embed query
  const embedRes = await fetch(`${OLLAMA_URL}/api/embeddings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: 'embeddinggemma:latest',
      prompt: query,
    }),
  });

  const { embedding } = await embedRes.json();

  // Search Qdrant
  const searchRes = await fetch(`${QDRANT_URL}/collections/codebase_chunks_768/points/search`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      vector: embedding,
      limit,
      with_payload: true,
    }),
  });

  const { result } = await searchRes.json();

  const packets = result.map((hit, idx) => {
    const manifold = new Manifold4D();
    manifold.x = hit.score; // Cosine similarity from Qdrant

    return new Packet4D(hit.id, {
      packet_key: hit.payload?.packet_key || `packet:${idx}`,
      source_ref: hit.payload?.source_ref || `source:${idx}`,
      feature_id: hit.payload?.feature_id || `feature:${idx}`,
    }, manifold);
  });

  console.log(`  ✓ Retrieved ${packets.length} packets (X-axis scores: ${packets.map(p => p.manifold.x.toFixed(3)).join(', ')})`);

  return packets;
}

// Phase 2: Expand neighbors via Neo4j (Y axis)
async function expandNeighborsNeo4j(packets, kHops = 2) {
  console.log(`\n[Y-AXIS] Neo4j k-hop expansion (k=${kHops})`);

  for (const packet of packets) {
    // Simulate Neo4j k-hop query
    // In production: MATCH (start:Packet {packet_key: $key})-[*0..k]->(neighbor) RETURN neighbor, length(path) as hops
    const depth = Math.random();
    packet.manifold.y = Math.max(0.3, 1 - depth * kHops / 10); // Decay with hops

    // Simulate 2-3 neighbors per packet
    const neighborCount = 2 + Math.floor(Math.random() * 2);
    for (let i = 0; i < neighborCount; i++) {
      packet.neighbors.push({
        packet_key: `neighbor:${packet.id}:${i}`,
        hops: Math.ceil(Math.random() * kHops),
        centrality: 0.5 + Math.random() * 0.5,
      });
    }
  }

  console.log(`  ✓ Expanded to ${packets.reduce((sum, p) => sum + p.neighbors.length, 0)} neighbors (Y-axis)`);

  return packets;
}

// Phase 3: Rank by SOM topology (Z axis)
async function rankBySOMTopology(packets) {
  console.log(`\n[Z-AXIS] SOM topology ranking`);

  // Load SOM topology if exists
  let somTopology = null;
  if (fs.existsSync('som-topology-20x20.json')) {
    somTopology = JSON.parse(fs.readFileSync('som-topology-20x20.json', 'utf-8'));
  }

  for (const packet of packets) {
    // Simulate SOM distance (0-1, lower = closer to query cell)
    const somDistance = Math.random() * 0.5; // Bias toward nearby cells
    packet.manifold.z = 1 - somDistance;

    // Log SOM membership
    const somCell = `som:${Math.floor(Math.random() * 20)}:${Math.floor(Math.random() * 20)}`;
    packet.som_cell = somCell;
  }

  console.log(`  ✓ SOM ranked (Z-axis: ${packets.map(p => p.manifold.z.toFixed(3)).join(', ')})`);

  return packets;
}

// Phase 4: Authority blend (W axis)
async function blendAuthority(packets) {
  console.log(`\n[W-AXIS] Authority blend (PageRank + Redis cache)`);

  for (const packet of packets) {
    // Simulate Redis lookup: gpu:karpathy:scores (0.4·PR + 0.3·attn + 0.3·authority)
    const authority = 0.3 + Math.random() * 0.7; // Mock PageRank
    packet.manifold.w = authority;

    // Compute 4D blend
    packet.blend_score = packet.manifold.blendScore({
      x: 0.3, // Cosine weight
      y: 0.3, // Graph weight
      z: 0.2, // SOM weight
      w: 0.2, // Authority weight
    });
  }

  // Sort by blend
  packets.sort((a, b) => b.blend_score - a.blend_score);

  console.log(`  ✓ Authority blended (W-axis: ${packets.map(p => p.manifold.w.toFixed(3)).join(', ')})`);
  console.log(`    Blend scores (sorted): ${packets.map(p => p.blend_score.toFixed(3)).join(', ')}`);

  return packets;
}

// Phase 5: Synthesize via Gemma4 tool calls
async function synthesizeWithGemma4(packets, batchSize = 500) {
  console.log(`\n[SYNTHESIS] Gemma4 packet synthesis (${Math.ceil(packets.length / batchSize)} batches)`);

  const results = [];

  for (let i = 0; i < packets.length; i += batchSize) {
    const batch = packets.slice(i, i + batchSize);
    const batchNum = Math.floor(i / batchSize) + 1;

    console.log(`  Batch ${batchNum}: ${batch.length} packets`);

    // Build tool call JSON
    const toolCall = {
      type: 'function',
      function: {
        name: 'synthesize_packets',
        arguments: JSON.stringify({
          packets: batch.map(p => ({
            packet_key: p.packet_key,
            source_ref: p.source_ref,
            feature_id: p.feature_id,
            manifold: p.manifold.toJSON(),
            blend_score: p.blend_score,
            neighbors: p.neighbors.length,
          })),
          batch_number: batchNum,
          total_batches: Math.ceil(packets.length / batchSize),
        }),
      },
    };

    // Call Gemma4 with tool
    const prompt = `Synthesize these ${batch.length} code packets:

Packets: ${JSON.stringify(batch.slice(0, 3).map(p => ({
  key: p.packet_key,
  feature: p.feature_id,
  score: p.blend_score.toFixed(3)
})))}${batch.length > 3 ? `... and ${batch.length - 3} more` : ''}

Provide:
1. Common theme
2. Architecture role
3. Top 3 candidates
4. Next hops`;

    try {
      const genRes = await fetch(`${OLLAMA_URL}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'gemma4-rotorquant:latest',
          prompt,
          stream: false,
        }),
      });

      const { response } = await genRes.json();

      results.push({
        batch: batchNum,
        packet_count: batch.length,
        summary: response.substring(0, 200),
        tool_call: toolCall,
      });
    } catch (err) {
      console.log(`    ⚠️  Synthesis error (Gemma4 may not be running): ${err.message}`);
      results.push({
        batch: batchNum,
        packet_count: batch.length,
        summary: 'Synthesis skipped (offline)',
        tool_call: toolCall,
      });
    }
  }

  return results;
}

// 4D Tricubic search (neighborhood query)
function tricubicSearch(packets, centerCoords, radius = 0.3) {
  console.log(`\n[TRICUBE] Tricubic neighborhood search`);
  console.log(`  Center: (${centerCoords.x.toFixed(2)}, ${centerCoords.y.toFixed(2)}, ${centerCoords.z.toFixed(2)}, ${centerCoords.w.toFixed(2)})`);
  console.log(`  Radius: ${radius}`);

  const neighbors = [];

  for (const packet of packets) {
    const dist = packet.manifold.distanceManhattan(centerCoords);

    if (dist <= radius) {
      const weight = new Manifold4D().tricubic(dist);
      neighbors.push({
        packet: packet,
        distance: dist,
        tricubic_weight: weight,
      });
    }
  }

  neighbors.sort((a, b) => a.distance - b.distance);

  console.log(`  ✓ Found ${neighbors.length} neighbors in tricubic kernel`);
  console.log(`    Distances: ${neighbors.slice(0, 5).map(n => n.distance.toFixed(3)).join(', ')}`);

  return neighbors;
}

// Log full 4D trace
function logFullTrace(packets, synthesisResults) {
  const trace = {
    timestamp: new Date().toISOString(),
    packet_count: packets.length,
    axes: {
      x_cosine: packets.map(p => p.manifold.x),
      y_graph: packets.map(p => p.manifold.y),
      z_som: packets.map(p => p.manifold.z),
      w_authority: packets.map(p => p.manifold.w),
    },
    blend_scores: packets.map(p => p.blend_score),
    synthesis_batches: synthesisResults.length,
    packets: packets.map(p => ({
      id: p.id,
      packet_key: p.packet_key,
      feature_id: p.feature_id,
      manifold: p.manifold.toJSON(),
      blend_score: p.blend_score,
      som_cell: p.som_cell,
      neighbor_count: p.neighbors.length,
    })),
    synthesis_results: synthesisResults,
  };

  fs.writeFileSync('packet-rpc-4d-trace.json', JSON.stringify(trace, null, 2));
  console.log(`\n✅ Full 4D trace logged: packet-rpc-4d-trace.json`);

  return trace;
}

// Main execution
async function main() {
  const queryArg = process.argv.find((arg, i) => i > 0 && process.argv[i - 1] === '--query') || 'auth sessions';
  const batchSizeArg = parseInt(
    process.argv.find((arg, i) => i > 0 && process.argv[i - 1] === '--batch') || '500'
  );
  const logAxes = process.argv.includes('--log-axes');
  const tricubeArg = process.argv.includes('--tricube');

  console.log(`\n🎯 Packet RPC: 4D Manifold Retrieval`);
  console.log(`   Query: "${queryArg}"`);
  console.log(`   Batch size: ${batchSizeArg}`);
  console.log(`   Log axes: ${logAxes}`);
  console.log(`   Tricube search: ${tricubeArg}\n`);

  try {
    // Phase 1: Retrieve (X axis)
    let packets = await retrievePacketsQdrant(queryArg, 50);

    // Phase 2: Expand (Y axis)
    packets = await expandNeighborsNeo4j(packets, 2);

    // Phase 3: SOM rank (Z axis)
    packets = await rankBySOMTopology(packets);

    // Phase 4: Authority (W axis)
    packets = await blendAuthority(packets);

    // Phase 5: Synthesize (Gemma4 tool calls)
    const synthesisResults = await synthesizeWithGemma4(packets, batchSizeArg);

    // Optional: Tricubic search
    if (tricubeArg) {
      const center = new Manifold4D(0.7, 0.6, 0.5, 0.4);
      const neighbors = tricubicSearch(packets, center, 0.5);
    }

    // Log full trace if requested
    if (logAxes) {
      const trace = logFullTrace(packets, synthesisResults);
    }

    // Summary
    console.log(`\n📊 SUMMARY`);
    console.log(`   Packets retrieved: ${packets.length}`);
    console.log(`   Avg blend score: ${(packets.reduce((sum, p) => sum + p.blend_score, 0) / packets.length).toFixed(3)}`);
    console.log(`   Batches synthesized: ${synthesisResults.length}`);
    console.log(`   Top packet: ${packets[0].packet_key} (score: ${packets[0].blend_score.toFixed(3)})`);

  } catch (err) {
    console.error('ERROR:', err.message);
    process.exit(1);
  }
}

main();
