#!/usr/bin/env node
/**
 * health-check-mcp-transport.mjs
 *
 * Verify MCP transport at :8788 is healthy and responding.
 * Tests 10 consecutive POST requests to /mcp with tools/list to ensure:
 * 1. HTTP connectivity
 * 2. Streamable transport doesn't drop connections
 * 3. tools/list returns complete tool inventory
 * 4. No SSE-related silent failures
 *
 * Run: node scripts/atlas/health-check-mcp-transport.mjs [--verbose]
 */

import fetch from 'node-fetch';

const MCP_URL = process.env.MCP_URL || 'http://127.0.0.1:8788';
const ENDPOINT = `${MCP_URL}/mcp`;
const VERBOSE = process.argv.includes('--verbose');
const ITERATIONS = 10;

async function healthCheck() {
  console.log(`\n${'═'.repeat(70)}`);
  console.log(`MCP TRANSPORT HEALTH CHECK`);
  console.log(`Endpoint: ${ENDPOINT}`);
  console.log(`Method: POST (Streamable HTTP)`);
  console.log(`Iterations: ${ITERATIONS}`);
  console.log(`${'═'.repeat(70)}\n`);

  const results = {
    total: ITERATIONS,
    passed: 0,
    failed: 0,
    timeout: 0,
    errors: []
  };

  // Attempt 10 consecutive POST requests to /mcp with tools/list
  for (let i = 0; i < ITERATIONS; i++) {
    process.stdout.write(`[${i + 1}/${ITERATIONS}] `);

    try {
      const startTime = Date.now();

      const response = await Promise.race([
        fetch(ENDPOINT, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json, text/event-stream'
          },
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: i,
            method: 'tools/list',
            params: {}
          })
        }),
        new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 10000))
      ]);

      const elapsed = Date.now() - startTime;

      if (!response.ok) {
        console.log(`❌ HTTP ${response.status} (${elapsed}ms)`);
        results.failed++;
        results.errors.push({
          iteration: i + 1,
          error: `HTTP ${response.status}`,
          elapsed
        });
        continue;
      }

      // Try to parse response as JSON
      let data;
      try {
        data = await response.json();
      } catch (parseErr) {
        console.log(`❌ JSON parse error (${elapsed}ms)`);
        results.failed++;
        results.errors.push({
          iteration: i + 1,
          error: 'Invalid JSON response',
          elapsed
        });
        continue;
      }

      // Validate response shape
      if (data.error) {
        console.log(`❌ RPC error: ${data.error.message} (${elapsed}ms)`);
        results.failed++;
        results.errors.push({
          iteration: i + 1,
          error: `RPC: ${data.error.message}`,
          elapsed
        });
        continue;
      }

      if (!data.result || !Array.isArray(data.result.tools)) {
        console.log(`❌ Invalid response shape (${elapsed}ms)`);
        results.failed++;
        results.errors.push({
          iteration: i + 1,
          error: 'Missing tools array in result',
          elapsed
        });
        continue;
      }

      const toolCount = data.result.tools.length;
      console.log(`✅ tools/list returned ${toolCount} tools (${elapsed}ms)`);
      results.passed++;

      if (VERBOSE && i === 0) {
        console.log(`\n   Sample tools:`);
        data.result.tools.slice(0, 5).forEach(t => {
          console.log(`     - ${t.name}: ${t.description || '(no description)'}`);
        });
        console.log(`   ... and ${Math.max(0, toolCount - 5)} more\n`);
      }

    } catch (err) {
      if (err.message === 'timeout') {
        console.log(`⏱️  TIMEOUT (>10s)`);
        results.timeout++;
        results.errors.push({
          iteration: i + 1,
          error: 'Request timeout',
          elapsed: '>10000'
        });
      } else {
        console.log(`❌ ${err.message}`);
        results.failed++;
        results.errors.push({
          iteration: i + 1,
          error: err.message,
          elapsed: '?'
        });
      }
    }

    // Small delay between requests to avoid overwhelming the server
    if (i < ITERATIONS - 1) {
      await new Promise(r => setTimeout(r, 100));
    }
  }

  // Summary
  console.log(`\n${'─'.repeat(70)}`);
  console.log(`HEALTH CHECK SUMMARY`);
  console.log(`${'─'.repeat(70)}`);
  console.log(`Passed:  ${results.passed}/${ITERATIONS}`);
  console.log(`Failed:  ${results.failed}/${ITERATIONS}`);
  console.log(`Timeout: ${results.timeout}/${ITERATIONS}`);

  if (results.errors.length > 0 && VERBOSE) {
    console.log(`\nError Details:`);
    results.errors.forEach(e => {
      console.log(`  [${e.iteration}] ${e.error} (${e.elapsed}ms)`);
    });
  }

  console.log(`${'═'.repeat(70)}\n`);

  if (results.passed === ITERATIONS) {
    console.log('✅ G38_MCP_TRANSPORT: PASS');
    console.log('   MCP endpoint is healthy and responsive');
    return { pass: true, gate: 'G38', status: 'PASS', results };
  } else if (results.passed >= 8) {
    console.log('⚠️  G38_MCP_TRANSPORT: PARTIAL (8+/10 passed)');
    console.log('   MCP endpoint is flaky — investigate transport or connection pooling');
    return { pass: false, gate: 'G38', status: 'PARTIAL', results };
  } else {
    console.log('❌ G38_MCP_TRANSPORT: FAIL');
    console.log('   MCP endpoint is down or not responding');
    console.log('   Check: (1) :8788 is running, (2) Streamable HTTP transport wired, (3) No SSE session issues');
    return { pass: false, gate: 'G38', status: 'FAIL', results };
  }
}

await healthCheck();
