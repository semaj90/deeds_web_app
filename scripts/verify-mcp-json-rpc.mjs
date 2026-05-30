#!/usr/bin/env node
/**
 * verify-mcp-json-rpc.mjs
 *
 * Verify that TRACE MCP server responds to JSON-RPC 2.0 tools/list and tools/call.
 * Tests the unified pipeline wiring.
 */

const TRACE_MCP_URL = process.env.TRACE_MCP_URL ?? 'http://127.0.0.1:8788';

/**
 * Fetch and display a specific tool's schema
 */
async function showToolSchema(toolName) {
  console.log(`\n📋 Tool Schema: ${toolName}`);
  try {
    const res = await fetch(`${TRACE_MCP_URL}/mcp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 0,
        method: 'tools/list',
        params: {},
      }),
    });

    const text = await res.text();
    const lines = text.split('\n');
    let body = null;

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        try {
          body = JSON.parse(line.slice(6));
          break;
        } catch {
          // skip invalid JSON lines
        }
      }
    }

    if (!body?.result?.tools) {
      console.log('  ❌ Could not fetch tool list');
      return;
    }

    const tool = body.result.tools.find(t => t.name === toolName);
    if (!tool) {
      console.log(`  ❌ Tool '${toolName}' not found`);
      console.log(`\n  Available tools: ${body.result.tools.slice(0, 5).map(t => t.name).join(', ')}...`);
      return;
    }

    console.log(`  Description: ${tool.description}`);
    console.log(`  Input Schema:`);

    if (tool.inputSchema?.properties) {
      const props = tool.inputSchema.properties;
      const required = tool.inputSchema.required || [];

      Object.entries(props).forEach(([key, prop]) => {
        const req = required.includes(key) ? ' [REQUIRED]' : ' [optional]';
        const type = prop.type || 'unknown';
        const desc = prop.description ? ` — ${prop.description}` : '';
        console.log(`    - ${key} (${type})${req}${desc}`);

        if (prop.enum) {
          console.log(`      Allowed values: ${prop.enum.join(', ')}`);
        }
      });
    } else {
      console.log(`    ${JSON.stringify(tool.inputSchema, null, 2)}`);
    }

  } catch (e) {
    console.log(`  ❌ Error fetching tool schema: ${e.message}`);
  }
}

async function testToolsList() {
  console.log('\n🧪 Testing TRACE MCP /mcp JSON-RPC tools/list...');
  try {
    const res = await fetch(`${TRACE_MCP_URL}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 0,
        method: 'tools/list',
        params: {},
      }),
    });

    if (!res.ok) {
      console.log(`❌ HTTP ${res.status} — Server not responding or unreachable`);
      return false;
    }

    // TRACE MCP uses Server-Sent Events (SSE), not plain JSON
    // Response format: event: message\ndata: {json}\n\n
    const text = await res.text();
    const lines = text.split('\n');
    let body = null;

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const dataStr = line.slice(6);
        try {
          body = JSON.parse(dataStr);
          break;
        } catch {
          // skip invalid JSON lines
        }
      }
    }

    if (!body || !body.result || !Array.isArray(body.result.tools)) {
      console.log(`❌ Invalid response shape: ${text.slice(0, 100)}`);
      return false;
    }

    const toolCount = body.result.tools.length;
    console.log(`✅ tools/list returned ${toolCount} tools (JSON-RPC 2.0 SSE)`);

    // Show a sample
    if (toolCount > 0) {
      const sample = body.result.tools.slice(0, 3);
      console.log('   Sample tools:', sample.map((t) => t.name).join(', '));
    }

    return true;
  } catch (e) {
    console.log(`❌ Request failed: ${e.message}`);
    console.log(`   Is the TRACE MCP server running? Try: npm run mcp:trace`);
    return false;
  }
}

async function testToolsCall(toolName, args) {
  console.log(`\n🧪 Testing TRACE MCP /mcp JSON-RPC tools/call (${toolName})...`);
  try {
    const res = await fetch(`${TRACE_MCP_URL}/mcp`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name: toolName, arguments: args },
      }),
    });

    if (!res.ok) {
      console.log(`❌ HTTP ${res.status}`);
      return false;
    }

    // TRACE MCP uses Server-Sent Events (SSE)
    const text = await res.text();
    const lines = text.split('\n');
    let body = null;

    for (const line of lines) {
      if (line.startsWith('data: ')) {
        const dataStr = line.slice(6);
        try {
          body = JSON.parse(dataStr);
          break;
        } catch {
          // skip invalid JSON lines
        }
      }
    }

    // MCP tools/call returns { result: { content: [...] }, ... }
    if (!body) {
      console.log(`❌ No valid JSON data in SSE response`);
      return false;
    }

    if (body.error) {
      // Provide helpful hints for common validation errors
      const errorMsg = JSON.stringify(body.error);
      console.log(`❌ MCP error: ${errorMsg}`);

      // Hints for validation schema errors
      if (errorMsg.includes('validation') || errorMsg.includes('schema') || errorMsg.includes('invalid input')) {
        console.log('\n💡 Validation Error Hint:');
        console.log('   MCP tools require specific input schemas. Check:');
        console.log('   1. Required parameters are provided');
        console.log('   2. Parameter types match the schema (string, number, boolean, array)');
        console.log('   3. Array elements have the correct type');
        console.log('   4. No extra unknown parameters were passed');
        console.log(`\n   To see the tool schema, run:`);
        console.log(`   npm run mcp:trace:tools -- --filter "${toolName}"`);
      }

      return false;
    }

    if (!body.result) {
      console.log(`❌ No result in response`);
      return false;
    }

    console.log(`✅ tools/call succeeded (JSON-RPC 2.0 SSE)`);
    const contentText = body.result.content?.[0]?.text;
    if (contentText) {
      const preview = contentText.length > 100 ? contentText.slice(0, 100) + '...' : contentText;
      console.log(`   Result preview: ${preview}`);
    }

    return true;
  } catch (e) {
    console.log(`❌ Request failed: ${e.message}`);
    return false;
  }
}

async function main() {
  const args = process.argv.slice(2);
  const schemaArg = args.find(a => a.startsWith('--schema='));
  const helpArg = args.includes('--help') || args.includes('-h');

  if (helpArg) {
    console.log('\n📖 MCP JSON-RPC 2.0 Verification Help');
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log('\nUsage: npm run mcp:verify-json-rpc [options]\n');
    console.log('Options:');
    console.log('  --schema=TOOL_NAME    Show the input schema for a specific tool');
    console.log('  --help, -h            Show this help message\n');
    console.log('Examples:');
    console.log('  npm run mcp:verify-json-rpc');
    console.log('  npm run mcp:verify-json-rpc -- --schema=context.build_kv_packet');
    console.log('  npm run mcp:verify-json-rpc -- --schema=trace.kag_search\n');
    return;
  }

  if (schemaArg) {
    const toolName = schemaArg.split('=')[1];
    await showToolSchema(toolName);
    return;
  }

  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('   MCP JSON-RPC 2.0 Unified Pipeline Verification');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(`\n📍 TRACE_MCP_URL: ${TRACE_MCP_URL}`);

  const toolsListOk = await testToolsList();

  if (!toolsListOk) {
    console.log('\n❌ Cannot proceed — TRACE MCP server is not responding.');
    process.exit(1);
  }

  // Try a simple read-only tool
  const callOk = await testToolsCall('context.build_kv_packet', {
    query: 'test',
  });

  console.log('\n═══════════════════════════════════════════════════════════════════');
  if (toolsListOk && callOk) {
    console.log('✅ All tests passed! JSON-RPC 2.0 pipeline is working.');
  } else {
    console.log('⚠️  Some tests failed. Check the TRACE MCP server and try again.');
  }
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('\n💡 Pro tips:');
  console.log('  - Show a tool schema: npm run mcp:verify-json-rpc -- --schema=TOOL_NAME');
  console.log('  - List all available tools: npm run mcp:trace:tools');
  console.log('  - Run tests with: npm run test:mcp');
  console.log('\n');
}

main();
