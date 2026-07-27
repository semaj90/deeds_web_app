#!/usr/bin/env node

/**
 * scripts/smoke-hermes-mastra-mcp.mjs
 *
 * Comprehensive smoke test for Hermes orchestrator with MCP backend.
 * Tests the full pipeline: Hermes planner → MCP tools → results synthesis.
 *
 * Prerequisites:
 * - Dev server running (http://localhost:5173)
 * - MCP server running (:8788 or configured TRACE_MCP_URL)
 * - Gemma4 llama-server running (:8090 or configured LLAMA_SERVER_URL)
 * - DEV_BYPASS_AUTH=true (if not authenticated)
 *
 * Usage:
 *   npm run smoke:hermes:mastra:mcp
 *   DEV_BYPASS_AUTH=true node scripts/smoke-hermes-mastra-mcp.mjs
 */

const DEV_URL = process.env.PUBLIC_APP_URL || process.env.SVELTEKIT_URL || 'http://localhost:5173';
const HERMES_ENDPOINT = `${DEV_URL}/api/ai/hermes-run`;
const HERMES_HEALTH = `${DEV_URL}/api/ai/hermes-run/health`;
const TIMEOUT_MS = 30_000;

const tests = [
  {
    name: 'Health Check',
    query: null,
    intent: null,
    expectedFields: ['status', 'mastraEnabled', 'gemma4Reachable', 'orchestrator'],
    skipBody: true,
  },
  {
    name: 'Rank Intent',
    query: 'rank files by authentication relevance',
    intent: 'rank',
    expectedFields: ['decision', 'executionPath', 'synthesis'],
    expectedTools: ['karpathy.attention_rank_files'],
  },
  {
    name: 'Search Intent',
    query: 'search for topology and language info',
    intent: 'search',
    expectedFields: ['decision', 'executionPath', 'synthesis'],
    expectedTools: ['topology.language_distribution', 'karpathy.som_topology_stats'],
  },
  {
    name: 'Plan Intent',
    query: 'find playbook examples',
    intent: 'plan',
    expectedFields: ['decision', 'executionPath', 'synthesis'],
    expectedTools: ['research.playbook_lookup_by_language'],
  },
  {
    name: 'Analyze Intent',
    query: 'analyze the codebase',
    intent: 'analyze',
    expectedFields: ['decision', 'executionPath', 'synthesis'],
    expectedTools: ['karpathy.attention_rank_files', 'topology.language_distribution'],
  },
  {
    name: 'Auto Intent (Fallback)',
    query: 'what handles requests',
    intent: 'auto',
    expectedFields: ['decision', 'executionPath', 'synthesis'],
  },
];

async function post(url, body, headers = {}) {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    return res;
  } finally {
    clearTimeout(tid);
  }
}

async function get(url, headers = {}) {
  const ctrl = new AbortController();
  const tid = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers,
      signal: ctrl.signal,
    });
    return res;
  } finally {
    clearTimeout(tid);
  }
}

async function runTest(test, index) {
  console.log(`\n[Test ${index + 1}/${tests.length}] ${test.name}`);
  console.log('─'.repeat(60));

  try {
    const url = test.skipBody ? HERMES_HEALTH : HERMES_ENDPOINT;
    const res = test.skipBody ? await get(url) : await post(url, { query: test.query, intent: test.intent });

    if (res.status === 401) {
      console.log('⚠️  SKIP: 401 Unauthorized');
      console.log('   Run with: DEV_BYPASS_AUTH=true node scripts/smoke-hermes-mastra-mcp.mjs');
      return { passed: false, reason: 'auth-required' };
    }

    if (!res.ok) {
      console.log(`❌ FAIL: HTTP ${res.status}`);
      const text = await res.text();
      console.log(`   Response: ${text.slice(0, 200)}`);
      return { passed: false, reason: `http-${res.status}` };
    }

    const data = await res.json();

    // Check for expected fields
    const missingFields = test.expectedFields.filter(f => !(f in data));
    if (missingFields.length > 0) {
      console.log(`❌ FAIL: Missing fields: ${missingFields.join(', ')}`);
      return { passed: false, reason: 'missing-fields' };
    }

    // Check for expected tools
    if (test.expectedTools && data.decision?.selectedTools) {
      const selectedTools = data.decision.selectedTools || [];
      const expectedToolsFound = test.expectedTools.every(t => selectedTools.includes(t));
      if (!expectedToolsFound) {
        console.log(`❌ FAIL: Expected tools not selected`);
        console.log(`   Expected: ${test.expectedTools.join(', ')}`);
        console.log(`   Got: ${selectedTools.join(', ')}`);
        return { passed: false, reason: 'wrong-tools' };
      }
    }

    // Check execution path
    const executionPath = data.executionPath || 'unknown';
    if (!['mastra', 'gemma4-fallback', 'gemma4-primary'].includes(executionPath)) {
      console.log(`⚠️  WARN: Unknown execution path: ${executionPath}`);
    }

    console.log(`✅ PASS`);
    console.log(`   Execution: ${executionPath}`);
    if (data.decision?.selectedTools) {
      console.log(`   Tools: ${data.decision.selectedTools.join(', ')}`);
    }
    console.log(`   Timing: ${data.timing?.totalMs}ms`);

    return { passed: true, reason: 'ok' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.log(`❌ FAIL: ${msg}`);
    return { passed: false, reason: msg };
  }
}

async function main() {
  console.log('╔═══════════════════════════════════════════════════════════╗');
  console.log('║  Hermes Mastra + MCP Comprehensive Smoke Test             ║');
  console.log('╚═══════════════════════════════════════════════════════════╝');
  console.log(`\nEndpoint: ${HERMES_ENDPOINT}`);
  console.log(`MCP Server: ${process.env.TRACE_MCP_URL || 'http://127.0.0.1:8788'}`);
  console.log(`Gemma4: ${process.env.LLAMA_SERVER_URL || 'http://127.0.0.1:8090/v1'}`);
  console.log(`\nRunning ${tests.length} tests...\n`);

  const results = [];
  for (let i = 0; i < tests.length; i++) {
    const result = await runTest(tests[i], i);
    results.push(result);
  }

  const passed = results.filter(r => r.passed).length;
  const failed = results.filter(r => !r.passed).length;

  console.log('\n' + '═'.repeat(60));
  console.log(`\nResults: ${passed} passed, ${failed} failed`);
  console.log(`Success rate: ${(passed / results.length * 100).toFixed(1)}%`);

  if (failed === 0) {
    console.log('\n✅ All tests PASSED');
    process.exit(0);
  } else {
    console.log(`\n❌ ${failed} test(s) FAILED`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
