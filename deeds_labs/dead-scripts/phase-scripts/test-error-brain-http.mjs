#!/usr/bin/env node
/**
 * Error-Brain Integration Test (HTTP-based)
 *
 * Tests via HTTP endpoints (doesn't require TypeScript compilation)
 *
 * Prerequisites:
 *   1. Start dev server: npm run dev
 *   2. Set ERROR_BRAIN_ENABLED=true in .env
 *   3. Run this script: node scripts/test-error-brain-http.mjs
 */

const BASE_URL = 'http://localhost:5175';

async function testEndpoint(method, path, body = null, description) {
  try {
    const options = {
      method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (body) options.body = JSON.stringify(body);

    const response = await fetch(`${BASE_URL}${path}`, options);

    if (response.ok) {
      const contentType = response.headers.get('content-type');
      if (contentType?.includes('application/json')) {
        const data = await response.json();
        console.log(`  ✅ ${description}`);
        return { ok: true, data };
      } else if (contentType?.includes('text/event-stream')) {
        console.log(`  ✅ ${description} (event-stream)`);
        return { ok: true, stream: true };
      }
    } else {
      const text = await response.text();
      console.log(`  ⚠️  ${description}: ${response.status} - ${text.substring(0, 100)}`);
      return { ok: false, status: response.status };
    }
  } catch (e) {
    console.log(`  ❌ ${description}: ${e.message}`);
    return { ok: false, error: e.message };
  }
}

console.log('🧪 Error-Brain HTTP Integration Test\n');
console.log('Prerequisites:');
console.log('  1. Dev server running (npm run dev)');
console.log('  2. ERROR_BRAIN_ENABLED=true in .env\n');

// Test 1: Status Endpoint
console.log('Test 1: Status Endpoint');
const statusResult = await testEndpoint('GET', '/api/internal/error-brain/status', null, 'GET /status');
if (statusResult.ok && statusResult.data) {
  console.log(`     Transport: ${statusResult.data.config?.transport || 'unknown'}`);
  console.log(`     Apply Mode: ${statusResult.data.config?.applyMode || 'unknown'}`);
}

// Test 2: List Runs
console.log('\nTest 2: List Runs');
const listResult = await testEndpoint('GET', '/api/internal/error-brain/runs', null, 'GET /runs');
if (listResult.ok && listResult.data) {
  console.log(`     Found: ${Array.isArray(listResult.data) ? listResult.data.length : 0} runs`);
}

// Test 3: Create Run
console.log('\nTest 3: Create Run');
const createResult = await testEndpoint('POST', '/api/internal/error-brain/runs',
  { mode: 'http-integration-test' }, 'POST /runs');

let testRunId = null;
if (createResult.ok && createResult.data) {
  testRunId = createResult.data.runId;
  console.log(`     Run ID: ${testRunId}`);
}

// Test 4: Get Run Details
if (testRunId) {
  console.log('\nTest 4: Get Run Details');
  const detailsResult = await testEndpoint('GET', `/api/internal/error-brain/runs/${testRunId}`,
    null, `GET /runs/${testRunId}`);
  if (detailsResult.ok && detailsResult.data) {
    console.log(`     State: ${detailsResult.data.state}`);
    console.log(`     Files Scanned: ${detailsResult.data.counters?.filesScanned || 0}`);
  }
}

// Test 5: SSE Stream (just verify it's available)
console.log('\nTest 5: SSE Stream Endpoint');
const sseResult = await testEndpoint('GET', '/api/internal/error-brain/stream', null, 'GET /stream');
if (sseResult.ok && sseResult.stream) {
  console.log('     SSE endpoint ready for event streaming');
}

console.log('\n' + '='.repeat(60));
console.log('✅ Integration tests complete!');
console.log('='.repeat(60) + '\n');

console.log('📋 Next Steps:');
console.log('  1. Run batch analyzer with events:');
console.log('     node scripts/batch-merger-fixer-v2.mjs --analyze');
console.log('');
console.log('  2. Watch SSE stream in another terminal:');
console.log('     curl http://localhost:5173/api/internal/error-brain/stream');
console.log('');
console.log('  3. View run reports:');
console.log('     ls reports/runs/');
console.log('');
