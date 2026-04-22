import { assembleAceContext } from '../src/lib/server/ace/codeintel-datastore.js';
import { callGemma4WithAceContext } from '../src/lib/server/ace/gemma4-codeintel.ts';
import { closeGitHubMcp } from '../src/lib/server/research/github-mcp.ts';

async function main() {
  console.log('🚀 Starting Phase 77 Verification...');

  try {
    const query = 'How do I implement a custom Svelte 5 rune for hypergraph state management?';
    
    console.log('1. Assembling ACE Context (including Lane 3 Research)...');
    const context = await assembleAceContext(query, {
      includeResearch: true,
      limit: 3
    });

    console.log(`   - Clusters: ${context.clusterContext.length}`);
    console.log(`   - Chunks: ${context.chunkContext.length}`);
    console.log(`   - Research Chunks: ${context.researchContext.length}`);

    if (context.researchContext.length > 0) {
      console.log('   - Top Research Source:', context.researchContext[0].source);
      console.log('   - Top Research Title:', context.researchContext[0].title);
    }

    console.log('\n2. Calling Gemma 4 with Research-Aware Context...');
    const result = await callGemma4WithAceContext(context, query, {
      lane: 'interactive-agent',
      taskType: 'streaming-chat',
      useTools: true // Enable tool loop to test gRPC + MCP
    });

    if (result.ok) {
      console.log('✅ Response Received:');
      console.log(result.text.slice(0, 500) + '...');
      console.log(`\nLatency: ${result.latencyMs}ms`);
    } else {
      console.error('❌ Agent Call Failed:', result.error);
    }

  } catch (err) {
    console.error('❌ Verification Error:', err);
  } finally {
    await closeGitHubMcp();
    process.exit(0);
  }
}

main();
