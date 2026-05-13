/**
 * scripts/build-hypergraph-stream.mjs
 * 
 * Generates an Enhanced JSONB Hypergraph for GraphRAG.
 * Centers on 'Star Graphs' (nodes + direct neighbors) with linked semantic vectors.
 * Optimized for CUDA Graph Stream searches.
 */
import fs from 'fs/promises';
import path from 'path';

async function buildHypergraph() {
  console.log('🚀 [Hypergraph-Builder] Synthesizing Linked Semantic Hypergraph...');

  // Late imports for DB and Types
  const { db } = await import('../src/lib/server/db/client.js');
  const { enhancedGraphMappings } = await import('../src/lib/server/db/schema/graph-mappings.js');





  const startTime = Date.now();
  
  // 1. Fetch all nodes to build an in-memory adjacency map
  console.log('🔍 Fetching all graph nodes...');
  const allNodes = await db.select().from(enhancedGraphMappings);
  const nodeMap = new Map();
  const adjacency = new Map();

  for (const node of allNodes) {
    nodeMap.set(node.id, node);
    if (!adjacency.has(node.id)) adjacency.set(node.id, new Set());
    
    // Add edges
    for (const edge of (node.edges || [])) {
      for (const target of edge.targets) {
        adjacency.get(node.id).add(target);
        // Also ensure target exists in adjacency (even if it's external)
        if (!adjacency.has(target)) adjacency.set(target, new Set());
        // For star graphs, we often want bidirectional edges
        adjacency.get(target).add(node.id);
      }
    }
  }

  console.log(`📊 Loaded ${nodeMap.size} nodes and ${adjacency.size} potential connections.`);

  // 2. Generate Star Graphs (1-hop neighborhoods)
  console.log('✨ Generating Star Graphs for all primary nodes...');
  const hypergraph = [];

  for (const [nodeId, node] of nodeMap) {
    const neighbors = Array.from(adjacency.get(nodeId) || []);
    
    // Build the star graph structure
    const starGraph = {
      centerId: nodeId,
      kind: node.kind,
      label: node.label,
      summary: node.summary,
      scores: node.scores,
      flags: node.flags,
      manifold4: node.manifold4,
      
      // Linked semantic references
      semantic: {
        embedding768: node.vectors?.embedding768,
        encoded64: node.vectors?.encoded64
      },

      // Neighborhood (The "Star")
      neighborhood: neighbors.map(neighborId => {
        const neighbor = nodeMap.get(neighborId);
        return {
          id: neighborId,
          kind: neighbor?.kind || 'external',
          label: neighbor?.label || neighborId,
          relation: 'linked' // In a hypergraph, we could refine this
        };
      }),

      // Metadata for JSONB indexing
      metadata: {
        ...node.metadata,
        hopCount: 1,
        neighborCount: neighbors.length
      }
    };

    hypergraph.push(starGraph);
  }

  // 3. Write to JSONB file for storage/gRPC ingestion
  const outPath = path.resolve('docs/graph/enhanced-hypergraph.json');
  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(hypergraph, null, 2));

  console.log(`✅ Hypergraph Synthesis Complete: ${hypergraph.length} star graphs generated.`);
  console.log(`💾 Saved to: ${outPath}`);
  console.log(`⏱️ Duration: ${((Date.now() - startTime) / 1000).toFixed(2)}s`);
}

buildHypergraph().catch(err => {
  console.error('❌ Hypergraph Build Failed:', err);
  process.exit(1);
});
