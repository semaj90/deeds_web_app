import { Client as McpClient } from '@modelcontextprotocol/sdk/client/index.js';
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js';
import * as dotenv from 'dotenv';
dotenv.config();

const url = new URL(process.env.TRACE_MCP_URL || 'http://localhost:8788/sse');

async function runSmokeTest() {
  console.log(`Connecting to TRACE MCP server at ${url.href}...`);
  const transport = new StreamableHTTPClientTransport(url);
  const client = new McpClient({
    name: 'smoke-test-v2',
    version: '1.0.0'
  }, {
    capabilities: {}
  });

  await client.connect(transport);
  console.log('Connected.');

  console.log('\n--- 1. Testing hypergraph.semantic_path_synthesis ---');
  const hyperArgs = {
    startKey: 'file:src/hooks.server.ts',
    endKey: 'file:src/lib/server/db/client.ts',
    maxHops: 3
  };
  
  let hyperResult = {};
  try {
    const res = await client.callTool({ name: 'hypergraph.semantic_path_synthesis', arguments: hyperArgs });
    console.log(`Hyper-synthesis result: ${res.content[0].text.substring(0, 150)}...`);
    hyperResult = JSON.parse(res.content[0].text);
  } catch (err) {
    console.warn('Hyper-synthesis tool call failed:', err.message);
  }

  console.log('\n--- 2. Testing hypergraph.materialize_pathway (Dry Run) ---');
  try {
    const matArgs = {
      startKey: hyperArgs.startKey,
      endKey: hyperArgs.endKey,
      pathResult: hyperResult,
      dryRun: true,
      confirmMaterialize: false
    };
    
    const matRes = await client.callTool({ name: 'hypergraph.materialize_pathway', arguments: matArgs });
    console.log(`Hyper-materialization Dry Run Output:\n${matRes.content[0].text}`);
  } catch (err) {
    console.error('Hyper-materialize tool call failed:', err.message);
  }

  console.log('\n--- 3. Testing graph.search_pathway_cards ---');
  try {
    const searchRes = await client.callTool({ name: 'graph.search_pathway_cards', arguments: { query: 'pathway' } });
    console.log(`Pathway search result: ${searchRes.content[0].text}`);
  } catch (err) {
    console.error('Pathway search failed:', err.message);
  }

  console.log('\n--- 4. Testing kb.search_notecards ---');
  try {
    const kbRes = await client.callTool({ name: 'kb.search_notecards', arguments: { query: 'auth', limit: 2 } });
    console.log(`KB search result: ${kbRes.content[0].text}`);
  } catch (err) {
    console.error('KB search failed:', err.message);
  }

  console.log('\n--- 5. Testing kb.explain_context_pack ---');
  try {
    const cards = [
      { type: 'pathway_card', content: 'Auth to DB' },
      { type: 'identity_spine', content: 'Hooks code' }
    ];
    const expRes = await client.callTool({ name: 'kb.explain_context_pack', arguments: { cards } });
    console.log(`Context pack explanation:\n${expRes.content[0].text}`);
  } catch (err) {
    console.error('Explain context pack failed:', err.message);
  }

  console.log('\nClosing connection...');
  await transport.close();
  console.log('Smoke test v2 completed.');
}

runSmokeTest().catch(err => {
  console.error('Smoke test fatal error:', err);
  process.exit(1);
});
