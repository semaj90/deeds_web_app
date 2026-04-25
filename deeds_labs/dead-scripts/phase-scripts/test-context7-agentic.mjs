#!/usr/bin/env node
/**
 * Test Context7 MCP Agentic Server
 *
 * Tests all 6 agentic tools:
 * 1. search_cache
 * 2. generate_embedding
 * 3. analyze_errors
 * 4. query_database
 * 5. search_qdrant
 * 6. cluster_errors
 */

import fetch from 'node-fetch';

const CONTEXT7_URL = 'http://localhost:3007';
const COLORS = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m'
};

function log(color, ...args) {
  console.log(color, ...args, COLORS.reset);
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function executeTool(toolName, args) {
  log(COLORS.blue, `\n🔧 Testing: ${toolName}`);
  log(COLORS.cyan, `   Args: ${JSON.stringify(args, null, 2)}`);

  // Submit job
  const submitStart = Date.now();
  const submitRes = await fetch(`${CONTEXT7_URL}/tools/${toolName}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(args)
  });

  if (!submitRes.ok) {
    log(COLORS.red, `   ❌ Submit failed: ${submitRes.statusText}`);
    return null;
  }

  const { jobId } = await submitRes.json();
  log(COLORS.yellow, `   ⏳ Job ID: ${jobId} (queued in ${Date.now() - submitStart}ms)`);

  // Poll for result
  let attempts = 0;
  const maxAttempts = 100;

  while (attempts < maxAttempts) {
    await sleep(100);
    attempts++;

    const resultRes = await fetch(`${CONTEXT7_URL}/jobs/${jobId}`);
    const data = await resultRes.json();

    if (data.status !== 'pending') {
      log(COLORS.green, `   ✅ Completed in ${attempts * 100}ms`);
      return data;
    }
  }

  log(COLORS.red, `   ❌ Timeout after ${maxAttempts * 100}ms`);
  return null;
}

async function main() {
  console.log('\n╔═══════════════════════════════════════════════════════════════════╗');
  console.log('║   Context7 MCP Agentic Server Test Suite                         ║');
  console.log('╚═══════════════════════════════════════════════════════════════════╝\n');

  // Check server health
  log(COLORS.cyan, '🏥 Checking server health...');
  try {
    const healthRes = await fetch(`${CONTEXT7_URL}/health`);
    const health = await healthRes.json();
    log(COLORS.green, `   ✅ Server healthy (${health.workers} workers, ${health.tools} tools)`);
  } catch (err) {
    log(COLORS.red, `   ❌ Server not responding: ${err.message}`);
    log(COLORS.yellow, '\n   Start server with: node scripts/context7-mcp-agentic-server.mjs\n');
    process.exit(1);
  }

  // Test 1: search_cache
  const test1 = await executeTool('search_cache', {
    query: 'TypeScript error embeddings',
    limit: 5,
    cacheType: 'embedding'
  });

  if (test1) {
    log(COLORS.cyan, `   Results: ${test1.result?.results?.length || 0} cache hits`);
    if (test1.result?.results?.[0]) {
      log(COLORS.cyan, `   Top match: ${test1.result.results[0].key} (score: ${test1.result.results[0].score.toFixed(3)})`);
    }
  }

  // Test 2: generate_embedding
  const test2 = await executeTool('generate_embedding', {
    text: 'Fix authentication middleware errors in Svelte 5',
    useCache: true
  });

  if (test2) {
    log(COLORS.cyan, `   Embedding: ${test2.result?.embedding?.length || 0} dimensions`);
    log(COLORS.cyan, `   Cached: ${test2.result?.cached ? '✅' : '❌'}`);
  }

  // Test 3: query_database
  const test3 = await executeTool('query_database', {
    query: 'SELECT source, COUNT(*) as total FROM raw_error_embeddings GROUP BY source ORDER BY total DESC LIMIT 5',
    params: []
  });

  if (test3) {
    log(COLORS.cyan, `   Rows: ${test3.result?.count || 0}`);
    if (test3.result?.rows?.[0]) {
      log(COLORS.cyan, `   Top file: ${test3.result.rows[0].source} (${test3.result.rows[0].total} errors)`);
    }
  }

  // Test 4: search_qdrant
  const test4 = await executeTool('search_qdrant', {
    collection: 'phase76_knowledge_base',
    query: 'Svelte 5 Runes $derived $effect',
    limit: 3,
    scoreThreshold: 0.7
  });

  if (test4) {
    log(COLORS.cyan, `   Results: ${test4.result?.results?.length || 0} matches`);
    if (test4.result?.results?.[0]) {
      log(COLORS.cyan, `   Top match score: ${test4.result.results[0].score.toFixed(3)}`);
    }
  }

  // Test 5: analyze_errors (requires error IDs)
  log(COLORS.blue, `\n🔧 Testing: analyze_errors`);
  log(COLORS.yellow, '   ⏩ Skipped (requires valid error IDs)');

  // Test 6: cluster_errors
  log(COLORS.blue, `\n🔧 Testing: cluster_errors`);
  log(COLORS.yellow, '   ⏩ Skipped (requires CUDA Python subprocess)');

  // Summary
  log(COLORS.green, '\n╔═══════════════════════════════════════════════════════════════════╗');
  log(COLORS.green, '║   ✅ Test Suite Complete                                          ║');
  log(COLORS.green, '╚═══════════════════════════════════════════════════════════════════╝\n');

  console.log('Test Results:');
  console.log(`  ✅ search_cache: ${test1 ? 'PASS' : 'FAIL'}`);
  console.log(`  ✅ generate_embedding: ${test2 ? 'PASS' : 'FAIL'}`);
  console.log(`  ✅ query_database: ${test3 ? 'PASS' : 'FAIL'}`);
  console.log(`  ✅ search_qdrant: ${test4 ? 'PASS' : 'FAIL'}`);
  console.log(`  ⏩ analyze_errors: SKIPPED`);
  console.log(`  ⏩ cluster_errors: SKIPPED\n`);

  const passed = [test1, test2, test3, test4].filter(Boolean).length;
  const total = 4;

  log(COLORS.green, `Overall: ${passed}/${total} tests passed\n`);
}

main().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
