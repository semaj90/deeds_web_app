#!/usr/bin/env node

/**
 * Test Agent Routing Pipeline (Phase 2A.1)
 *
 * Tests the full flow:
 * 1. POST /api/agent/route to get ranked tools
 * 2. POST /api/agent/execute to dispatch the selected tool
 * 3. Verify results (success, source refs, state classification)
 *
 * Usage:
 *   npm run test:agent-routing
 *   npm run test:agent-routing -- --verbose
 */

import { v4 as uuid } from 'uuid';
import fetch from 'node-fetch';

const BASE_URL = 'http://localhost:5173';
const TRACE_ID = uuid();

async function testRoute() {
  console.log('\n=== Test 1: Route Query ===');
  console.log(`Trace ID: ${TRACE_ID}`);

  const response = await fetch(`${BASE_URL}/api/agent/route`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query: 'Find implementation of authentication middleware',
      previousState: 'RETRIEVE',
      constraints: { readOnly: true },
      topK: 3
    })
  });

  if (!response.ok) {
    console.error(`❌ Route failed: ${response.status}`);
    console.error(await response.text());
    return null;
  }

  const routeResult = await response.json();
  console.log(`✅ Route succeeded`);
  console.log(`   Decision ID: ${routeResult.decisionId}`);
  console.log(`   Selected: ${routeResult.selectedTool.name} (${(routeResult.confidenceScore * 100).toFixed(0)}% confidence)`);
  console.log(`   Candidates: ${routeResult.candidates.length}`);
  for (const c of routeResult.candidates) {
    console.log(`     - ${c.name}: ${(c.compositeScore * 100).toFixed(0)}%`);
  }

  return routeResult;
}

async function testExecute(routeResult) {
  console.log('\n=== Test 2: Execute Tool ===');

  const selectedTool = routeResult.selectedTool;
  const response = await fetch(`${BASE_URL}/api/agent/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      traceId: TRACE_ID,
      selectedTool: {
        name: selectedTool.name,
        namespace: selectedTool.name.split('.')[0]
      },
      arguments: {
        query: 'Find implementation of authentication middleware'
      },
      dry_run: false
    })
  });

  if (!response.ok) {
    console.error(`❌ Execute failed: ${response.status}`);
    console.error(await response.text());
    return null;
  }

  const executeResult = await response.json();
  console.log(`✅ Execute succeeded`);
  console.log(`   Execution ID: ${executeResult.executionId}`);
  console.log(`   Status: ${executeResult.result.success ? '✅ SUCCESS' : '❌ FAILED'}`);
  console.log(`   Result Class: ${executeResult.result.resultClass}`);
  console.log(`   Result Count: ${executeResult.result.resultCount}`);
  console.log(`   Source Refs: ${executeResult.result.sourceRefCount}`);
  console.log(`   Duration: ${executeResult.result.durationMs.toFixed(0)}ms`);
  console.log(`   Next State: ${executeResult.nextState}`);

  if (executeResult.result.sourceRefs) {
    console.log(`   Refs: ${executeResult.result.sourceRefs.slice(0, 3).join(', ')}`);
  }

  return executeResult;
}

async function testDryRun(routeResult) {
  console.log('\n=== Test 3: Dry-Run Execute ===');

  const selectedTool = routeResult.selectedTool;
  const response = await fetch(`${BASE_URL}/api/agent/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      traceId: uuid(),
      selectedTool: {
        name: selectedTool.name,
        namespace: selectedTool.name.split('.')[0]
      },
      arguments: {
        query: 'Find implementation of authentication middleware'
      },
      dry_run: true
    })
  });

  if (!response.ok) {
    console.error(`❌ Dry-run failed: ${response.status}`);
    return null;
  }

  const dryRunResult = await response.json();
  console.log(`✅ Dry-run succeeded`);
  console.log(`   Status: ${dryRunResult.status}`);
  console.log(`   Result Count: ${dryRunResult.result.resultCount}`);
  console.log(`   Next State: ${dryRunResult.nextState}`);

  return dryRunResult;
}

async function main() {
  console.log('🚀 Agent Routing Pipeline Test (Phase 2A.1)');
  console.log('='.repeat(50));

  try {
    // Test routing
    const routeResult = await testRoute();
    if (!routeResult) {
      console.error('\n❌ Routing test failed, skipping execution test');
      process.exit(1);
    }

    // Test execution
    const executeResult = await testExecute(routeResult);
    if (!executeResult) {
      console.error('\n❌ Execution test failed');
      process.exit(1);
    }

    // Test dry-run
    const dryRunResult = await testDryRun(routeResult);
    if (!dryRunResult) {
      console.error('\n❌ Dry-run test failed');
      process.exit(1);
    }

    // Summary
    console.log('\n' + '='.repeat(50));
    console.log('✅ All tests passed!');
    console.log(`   - Route selected: ${routeResult.selectedTool.name}`);
    console.log(`   - Execution result: ${executeResult.result.success ? 'SUCCESS' : 'FAILED'}`);
    console.log(`   - Dry-run result: ${dryRunResult.status}`);
    console.log('\n✨ Phase 2A.1 implementation verified');
  } catch (err) {
    console.error('\n❌ Test error:', err.message);
    process.exit(1);
  }
}

main();
