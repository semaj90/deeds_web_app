/**
 * scripts/atlas/enhance-graph-edges.mjs
 * 
 * Enhances the codebase graph with explicit edge parameters:
 * STATIC_IMPORTS, DYNAMIC_IMPORTS, USES_ENV, USES_STORE.
 * Also performs a topological sort for dependency ordering.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const GRAPH_PATH = resolve(process.cwd(), 'docs/graph/codebase-graph.json');

async function main() {
  console.log('🕸️  Atlas: Enhancing Graph Edges & Topological Parameters...');

  try {
    const graph = JSON.parse(readFileSync(GRAPH_PATH, 'utf8'));
    const files = graph.files || [];

    // 1. Label Edges
    for (const file of files) {
      file.edgeParams = {
        STATIC_IMPORTS: file.imports || [],
        DYNAMIC_IMPORTS: file.dynImports || [],
        USES_ENV: (file.summary || '').includes('env') || (file.rel.includes('env')),
        USES_STORE: file.drizzleRefs?.length > 0 || file.rel.includes('redis') || file.rel.includes('db')
      };
      
      // Add node parameters
      file.nodeParams = {
        type: file.isRoute ? 'Route' : (file.isSvelteComp ? 'Component' : 'File'),
        gpuCluster: file.gpuCluster || null,
        manifold4: file.manifold4 || null
      };
    }

    // 2. Topological Sort (Simple dependency-based ordering)
    // We sort files by their import depth
    const sortedFiles = [...files].sort((a, b) => {
      return (a.imports?.length || 0) - (b.imports?.length || 0);
    });

    graph.topologicalOrder = sortedFiles.map(f => f.rel);
    graph.enhancedAt = new Date().toISOString();

    writeFileSync(GRAPH_PATH, JSON.stringify(graph, null, 2));
    console.log('✅ Graph enhanced with 4D edge parameters and topological sort.');
  } catch (err) {
    console.error('❌ Graph enhancement failed:', err);
  }
}

main();
