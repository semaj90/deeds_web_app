/**
 * scripts/graph/build-community-graph.mjs
 *
 * Operationalizes the GraphRAG-style community detection and summarization loop.
 * Detects structural communities in the codebase graph (clusters merged via dense
 * import edges) and generates thematic summaries via Ollama/TurboQuant.
 */

import 'dotenv/config';
import { buildCommunityGraph } from '../../src/lib/server/graph/community-graph.js';

async function runCommunityBuild() {
  console.log('🚀 [GraphRAG] Starting community detection and summarization loop...');
  
  try {
    const result = await buildCommunityGraph({
      force: process.argv.includes('--force'),
      edgeWeightThreshold: 3,
      onProgress: (msg) => console.log(`   [PROGRESS] ${msg}`)
    });

    console.log('\n🎉 Community detection complete!');
    console.log(`   - Communities:    ${result.communities}`);
    console.log(`   - Total Clusters: ${result.totalClusters}`);
    console.log(`   - Total Members:  ${result.totalMembers}`);
    console.log(`   - Turbo Hits:     ${result.turboHits}`);
    console.log(`   - Turbo Misses:   ${result.turboMisses}`);
    console.log(`   - Avg LLM Time:   ${result.avgLlmMs}ms`);
    console.log(`   - Total Duration: ${Math.round(result.durationMs / 1000)}s`);

  } catch (err) {
    console.error('\n❌ Community detection failed:', err);
    process.exit(1);
  }
}

runCommunityBuild();
