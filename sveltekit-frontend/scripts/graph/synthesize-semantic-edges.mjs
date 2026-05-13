/**
 * scripts/graph/synthesize-semantic-edges.mjs
 *
 * Synthesizes more connections in the codebase graph using semantic similarity.
 * Uses Qdrant's 'recommend' API to find conceptually related files and adds
 * SEMANTIC_SIMILARITY edges to bridge gaps in the AST graph.
 */

import fs from 'fs/promises';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { QdrantManager } from '../../src/lib/server/vector/qdrant-manager.js';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const GRAPH_PATH = resolve(__dirname, '../../docs/graph/codebase-graph.json');
const SIMILARITY_THRESHOLD = 0.85;
const MAX_SEMANTIC_EDGES_PER_NODE = 3;

async function synthesizeSemanticEdges() {
  console.log('🚀 [Semantic-Synthesis] Starting relationship expansion...');

  const qdrant = new QdrantManager();
  const graphRaw = await fs.readFile(GRAPH_PATH, 'utf-8');
  const graph = JSON.parse(graphRaw);

  const fileNodes = graph.nodes.filter(n => n.type === 'file');
  console.log(`🔍 Analyzing ${fileNodes.length} file nodes for semantic gaps...`);

  let edgesAdded = 0;

  for (let i = 0; i < fileNodes.length; i++) {
    const node = fileNodes[i];
    const filePath = node.id;

    try {
      // 1. Find the Qdrant point ID for this file
      // Chunks are indexed by path. We take the first chunk for the file.
      const searchRes = await qdrant._denseSearch({
        query: `path:${filePath}`,
        queryEmbedding: new Array(768).fill(0), // Dummy since we use filter
        collection: 'codebase_chunks',
        filters: { path: filePath },
        limit: 1
      });

      if (searchRes.results.length === 0) continue;

      const pointId = searchRes.results[0].id;

      // 2. Use Qdrant's Recommend API to find similar files
      const recommendations = await qdrant.client.recommend('codebase_chunks_768', {
        positive: [pointId],
        limit: MAX_SEMANTIC_EDGES_PER_NODE + 5,
        score_threshold: SIMILARITY_THRESHOLD,
        with_payload: true,
        // Exclude chunks from the same file
        filter: {
          must_not: [
            { key: 'path', match: { value: filePath } }
          ]
        }
      });

      const seenPaths = new Set();
      let addedForNode = 0;

      for (const rec of recommendations) {
        const targetPath = rec.payload.path;
        if (!targetPath || seenPaths.has(targetPath)) continue;

        // Check if an AST edge already exists (IMPORT/EXPORT)
        const existingEdge = graph.edges.find(e => 
          (e.source === filePath && e.target === targetPath) ||
          (e.source === targetPath && e.target === filePath)
        );

        if (existingEdge) continue;

        // Add semantic edge
        graph.edges.push({
          source: filePath,
          target: targetPath,
          type: 'SEMANTIC_SIMILARITY',
          metadata: {
            score: rec.score,
            source: 'qdrant-recommend'
          }
        });

        seenPaths.add(targetPath);
        addedForNode++;
        edgesAdded++;

        if (addedForNode >= MAX_SEMANTIC_EDGES_PER_NODE) break;
      }

      if (i % 50 === 0) {
        process.stdout.write(`\r   Processed ${i} / ${fileNodes.length} nodes... Edges added: ${edgesAdded}`);
      }
    } catch (err) {
      // console.warn(`\n⚠️ Failed to recommend for ${filePath}: ${err.message}`);
    }
  }

  console.log(`\n💾 Saving updated graph with ${edgesAdded} new semantic edges...`);
  await fs.writeFile(GRAPH_PATH, JSON.stringify(graph, null, 2));
  console.log('🎉 Semantic synthesis complete.');
}

synthesizeSemanticEdges().catch(console.error);
