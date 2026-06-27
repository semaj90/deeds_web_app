/**
 * Test P5 LangGraph Telemetry
 * Verify telemetry collection across all 8 LangGraph nodes
 */

import { TelemetryCollector, getTelemetryCollector, clearTelemetryCollector, type TelemetryCheckpoint } from '../../packages/atlas-core/src/telemetry/acp-mcp-telemetry.js';

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

console.log('╔════════════════════════════════════════════════════════╗');
console.log('║ P5 LangGraph Telemetry — Test Suite                  ║');
console.log('╚════════════════════════════════════════════════════════╝\n');

// Test 1: TelemetryCollector initialization
console.log('Test 1: TelemetryCollector initialization');
try {
  const telemetry = new TelemetryCollector('trace:abc123');
  if (telemetry) {
    console.log('✅ TelemetryCollector initialized');
    results.push({ name: 'Telemetry initialization', passed: true, details: 'Collector ready' });
  } else {
    console.log('❌ TelemetryCollector failed');
    results.push({ name: 'Telemetry initialization', passed: false, details: 'Collector is null' });
  }
} catch (err: any) {
  console.log(`❌ Initialization failed: ${err.message}`);
  results.push({ name: 'Telemetry initialization', passed: false, details: err.message });
}

// Test 2: Node timer tracking
console.log('\nTest 2: Node timer tracking');
try {
  const telemetry = new TelemetryCollector('trace:def456');
  const timer = telemetry.startNodeTimer('load_trace_state');
  timer.recordAsyncOp('postgres.query', 45, undefined, 3);
  timer.recordCacheHit();
  timer.recordCacheHit();
  timer.recordCacheMiss();
  timer.stop();

  const summary = telemetry.getSummary();
  const node = summary.nodes[0];

  if (node && node.node_name === 'load_trace_state' && node.async_ops.length === 1 && node.cache_hits === 2 && node.cache_misses === 1) {
    console.log('✅ Node timing and cache counts correct');
    results.push({ name: 'Node timer tracking', passed: true, details: `${node.async_ops.length} ops, ${node.cache_hits} hits, ${node.cache_misses} misses` });
  } else {
    console.log('❌ Node tracking mismatch');
    results.push({ name: 'Node timer tracking', passed: false, details: 'Data mismatch' });
  }
} catch (err: any) {
  console.log(`❌ Node timer test failed: ${err.message}`);
  results.push({ name: 'Node timer tracking', passed: false, details: err.message });
}

// Test 3: Multiple node sequence
console.log('\nTest 3: Multiple node sequence tracking');
try {
  const telemetry = new TelemetryCollector('trace:ghi789');
  const nodes = ['load_trace_state', 'packet_registry_lookup', 'bitfrost_cache_check', 'hybrid_retrieval'];

  for (const nodeName of nodes) {
    const timer = telemetry.startNodeTimer(nodeName);
    timer.recordAsyncOp(`${nodeName}.call`, Math.random() * 100);
    if (Math.random() > 0.5) timer.recordCacheHit();
    else timer.recordCacheMiss();
    timer.stop();
  }

  const summary = telemetry.getSummary();
  const allNodesPresent = nodes.every((n) => summary.nodes.some((sn) => sn.node_name === n));

  if (allNodesPresent && summary.step === nodes.length) {
    console.log(`✅ All ${nodes.length} nodes tracked in sequence`);
    results.push({ name: 'Multiple node sequence', passed: true, details: `${nodes.length} nodes, step ${summary.step}` });
  } else {
    console.log('❌ Node sequence mismatch');
    results.push({ name: 'Multiple node sequence', passed: false, details: 'Sequence error' });
  }
} catch (err: any) {
  console.log(`❌ Sequence test failed: ${err.message}`);
  results.push({ name: 'Multiple node sequence', passed: false, details: err.message });
}

// Test 4: Cache hit rate calculation
console.log('\nTest 4: Cache hit rate calculation');
try {
  const telemetry = new TelemetryCollector('trace:jkl012');
  const timer = telemetry.startNodeTimer('cache_check');

  // Simulate 7 hits, 3 misses = 70% hit rate
  for (let i = 0; i < 7; i++) timer.recordCacheHit();
  for (let i = 0; i < 3; i++) timer.recordCacheMiss();
  timer.stop();

  const summary = telemetry.getSummary();
  const expectedHitRate = 0.7;
  const actualHitRate = summary.cache_summary.hit_rate;
  const tolerance = 0.01;

  if (Math.abs(actualHitRate - expectedHitRate) < tolerance) {
    console.log(`✅ Cache hit rate calculated correctly: ${(actualHitRate * 100).toFixed(1)}%`);
    results.push({ name: 'Cache hit rate', passed: true, details: `${(actualHitRate * 100).toFixed(1)}%` });
  } else {
    console.log(`❌ Cache hit rate mismatch: ${(actualHitRate * 100).toFixed(1)}% vs ${(expectedHitRate * 100).toFixed(1)}%`);
    results.push({ name: 'Cache hit rate', passed: false, details: 'Calculation error' });
  }
} catch (err: any) {
  console.log(`❌ Hit rate test failed: ${err.message}`);
  results.push({ name: 'Cache hit rate', passed: false, details: err.message });
}

// Test 5: Checkpoint emission
console.log('\nTest 5: Checkpoint emission');
try {
  const telemetry = new TelemetryCollector('trace:mno345');
  const timer = telemetry.startNodeTimer('emit_test');
  timer.recordAsyncOp('test.op', 50);
  timer.stop();

  const checkpoint = await telemetry.emitCheckpoint();

  if (checkpoint && checkpoint.trace_id === 'trace:mno345' && checkpoint.async_operations.length === 1) {
    console.log('✅ Checkpoint emitted successfully');
    results.push({ name: 'Checkpoint emission', passed: true, details: '1 async operation captured' });
  } else {
    console.log('❌ Checkpoint structure invalid');
    results.push({ name: 'Checkpoint emission', passed: false, details: 'Structure mismatch' });
  }
} catch (err: any) {
  console.log(`❌ Checkpoint test failed: ${err.message}`);
  results.push({ name: 'Checkpoint emission', passed: false, details: err.message });
}

// Test 6: Global registry
console.log('\nTest 6: Global telemetry registry');
try {
  const trace1 = getTelemetryCollector('trace:registry1');
  const trace2 = getTelemetryCollector('trace:registry2');
  const trace1Again = getTelemetryCollector('trace:registry1');

  if (trace1 === trace1Again && trace1 !== trace2) {
    console.log('✅ Registry correctly deduplicates collectors');
    results.push({ name: 'Global registry', passed: true, details: 'Deduplication works' });
  } else {
    console.log('❌ Registry deduplication failed');
    results.push({ name: 'Global registry', passed: false, details: 'Instance mismatch' });
  }

  clearTelemetryCollector('trace:registry1');
  clearTelemetryCollector('trace:registry2');
} catch (err: any) {
  console.log(`❌ Registry test failed: ${err.message}`);
  results.push({ name: 'Global registry', passed: false, details: err.message });
}

// Test 7: Async operation tracking
console.log('\nTest 7: Async operation tracking');
try {
  const telemetry = new TelemetryCollector('trace:pqr678');
  const timer = telemetry.startNodeTimer('async_ops_test');

  // Simulate 3 async operations with varying latencies
  const latencies = [45, 128, 67];
  latencies.forEach((lat) => {
    timer.recordAsyncOp(`db.query`, lat);
  });
  timer.stop();

  const summary = telemetry.getSummary();
  const ops = summary.nodes[0]?.async_ops || [];

  if (ops.length === 3 && ops.map((o) => o.latency_ms).every((l) => latencies.includes(l))) {
    console.log(`✅ ${ops.length} async operations tracked with correct latencies`);
    results.push({ name: 'Async operation tracking', passed: true, details: `${ops.length} operations` });
  } else {
    console.log('❌ Async operation tracking mismatch');
    results.push({ name: 'Async operation tracking', passed: false, details: 'Latency mismatch' });
  }
} catch (err: any) {
  console.log(`❌ Async ops test failed: ${err.message}`);
  results.push({ name: 'Async operation tracking', passed: false, details: err.message });
}

// Summary
console.log(`\n${'='.repeat(60)}`);
const passed = results.filter((r) => r.passed).length;
const failed = results.filter((r) => !r.passed).length;
console.log(`Tests: ${passed} passed, ${failed} failed out of ${results.length}`);
console.log(`${'='.repeat(60)}\n`);

// Write report
const report = {
  timestamp: new Date().toISOString(),
  total_tests: results.length,
  passed,
  failed,
  pass_rate: `${((passed / results.length) * 100).toFixed(1)}%`,
  results,
};

const fs = await import('node:fs/promises');
await fs.mkdir('.tmp', { recursive: true });
await fs.writeFile('.tmp/p5-langgraph-telemetry-test-results.json', JSON.stringify(report, null, 2));

console.log(`✓ Report written: .tmp/p5-langgraph-telemetry-test-results.json\n`);

// Final gate
const gatePass = failed === 0;
console.log(`╔════════════════════════════════════════════════════════╗`);
console.log(`║ ${gatePass ? '✅ P5 GATE PASS' : '❌ P5 GATE FAIL'} — Telemetry validated${gatePass ? '         ' : '         '}║`);
console.log(`╚════════════════════════════════════════════════════════╝\n`);

process.exit(gatePass ? 0 : 1);
