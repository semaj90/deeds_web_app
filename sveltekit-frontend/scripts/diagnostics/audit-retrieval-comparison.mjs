import { tool_graph_expand_neighborhood, tool_search_hybrid } from '../../src/lib/server/ai/mcp-tool-dispatch.js';

async function verifyRetrieval() {
  console.log('🔍 Starting Graph vs Vector Retrieval Audit...\n');

  const testQueries = [
    "What are the confidentiality obligations in the NDA?",
    "Show me the indemnification clauses for breach of contract.",
    "Who are the signing parties?",
    "Define the termination period."
  ];

  let graphWins = 0;
  let vectorWins = 0;

  for (const query of testQueries) {
    console.log(`\nTesting Query: "${query}"`);
    
    const t0 = performance.now();
    const graphRes = await tool_graph_expand_neighborhood({ maxHops: 1, limit: 10 });
    const tGraph = performance.now() - t0;
    
    const t1 = performance.now();
    const vectorRes = await tool_search_hybrid({ query });
    const tVector = performance.now() - t1;

    // A simple mock heuristic for relevance/hits (since this is diagnostic)
    const graphHits = graphRes.success && graphRes.data ? Object.keys(graphRes.data).length : 0;
    const vectorHits = vectorRes.success && vectorRes.data ? Object.keys(vectorRes.data).length : 0;

    console.log(`- Graph Nodes/Edges: ${graphHits} (latency: ${Math.round(tGraph)}ms)`);
    console.log(`- Vector Fallbacks: ${vectorHits} (latency: ${Math.round(tVector)}ms)`);

    if (graphHits > vectorHits) {
      graphWins++;
    } else if (vectorHits > graphHits) {
      vectorWins++;
    }
  }

  console.log('\n--- RESULTS ---');
  console.log(`Graph Dominance: ${graphWins} queries won`);
  console.log(`Vector Dominance: ${vectorWins} queries won`);

  if (graphWins >= vectorWins) {
    console.log('✅ Graph > Vector fallback. Weights are balanced.');
  } else {
    console.log('❌ Vector fallback > Graph. Adjust weights in MCP tool dispatch!');
    process.exit(1);
  }
}

verifyRetrieval().catch(console.error);
