
import fetch from 'node-fetch';

async function callTool(name, args) {
  console.log(`\n--- Calling ${name} ---`);
  const response = await fetch('http://localhost:8788/mcp', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream'
    },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method: 'tools/call',
      params: {
        name,
        arguments: args
      }
    })
  });
  const text = await response.text();
  const lines = text.split('\n');
  for (const line of lines) {
    if (line.startsWith('data: ')) {
      const json = JSON.parse(line.slice(6));
      if (json.error) {
        console.error('Error:', JSON.stringify(json.error, null, 2));
      } else {
        console.log('Result:', JSON.stringify(json.result, null, 2));
      }
    }
  }
}

async function runTests() {
  try {
    // 1. Test topology.search_som_neighborhood
    await callTool('topology.search_som_neighborhood', {
      query: 'authentication and database connections',
      radius: 1,
      limit: 5
    });

    // 2. Test kb.hybrid_search
    await callTool('kb.hybrid_search', {
      query: 'how is the graph materialized',
      limit: 3
    });
    // 3. Test trace.system_health
    await callTool('trace.system_health', {});
  } catch (err) {
    console.error('Test script failed:', err);
  }
}

runTests();
