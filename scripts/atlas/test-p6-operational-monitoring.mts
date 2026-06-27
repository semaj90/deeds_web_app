/**
 * Test P6 Operational Monitoring
 * Verify 24h metrics collection and reporting
 */

import { getOperationalMetrics, type OperationalSnapshot } from '../../packages/atlas-core/src/telemetry/operational-metrics.js';

interface TestResult {
  name: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

console.log('╔════════════════════════════════════════════════════════╗');
console.log('║ P6 Operational Monitoring — Test Suite               ║');
console.log('╚════════════════════════════════════════════════════════╝\n');

// Test 1: Metrics singleton initialization
console.log('Test 1: Metrics singleton initialization');
try {
  const metrics1 = getOperationalMetrics();
  const metrics2 = getOperationalMetrics();

  if (metrics1 === metrics2) {
    console.log('✅ Metrics singleton initialized and deduplicated');
    results.push({ name: 'Metrics singleton', passed: true, details: 'Singleton pattern works' });
  } else {
    console.log('❌ Singleton pattern failed');
    results.push({ name: 'Metrics singleton', passed: false, details: 'Not a singleton' });
  }
} catch (err: any) {
  console.log(`❌ Initialization failed: ${err.message}`);
  results.push({ name: 'Metrics singleton', passed: false, details: err.message });
}

// Test 2: Node execution recording
console.log('\nTest 2: Node execution recording');
try {
  const metrics = getOperationalMetrics();
  metrics.reset();

  metrics.recordNodeExecution('load_trace_state', 45);
  metrics.recordNodeExecution('packet_registry_lookup', 67);
  metrics.recordNodeExecution('load_trace_state', 52);

  const node1 = metrics.getNodeMetrics('load_trace_state');
  const node2 = metrics.getNodeMetrics('packet_registry_lookup');

  if (node1 && node1.execution_count === 2 && node2 && node2.execution_count === 1) {
    console.log('✅ Node executions recorded correctly');
    results.push({ name: 'Node execution recording', passed: true, details: '2 + 1 executions' });
  } else {
    console.log('❌ Execution count mismatch');
    results.push({ name: 'Node execution recording', passed: false, details: 'Count error' });
  }
} catch (err: any) {
  console.log(`❌ Recording test failed: ${err.message}`);
  results.push({ name: 'Node execution recording', passed: false, details: err.message });
}

// Test 3: Error rate calculation
console.log('\nTest 3: Error rate calculation');
try {
  const metrics = getOperationalMetrics();
  metrics.reset();

  // 8 successful, 2 failed = 20% error rate
  for (let i = 0; i < 8; i++) {
    metrics.recordNodeExecution('test_node', 100);
  }
  for (let i = 0; i < 2; i++) {
    metrics.recordNodeExecution('test_node', 100, 'test error');
  }

  const node = metrics.getNodeMetrics('test_node');
  const expectedErrorRate = 0.2;
  const tolerance = 0.01;

  if (node && Math.abs(node.error_rate - expectedErrorRate) < tolerance) {
    console.log(`✅ Error rate calculated correctly: ${(node.error_rate * 100).toFixed(1)}%`);
    results.push({ name: 'Error rate calculation', passed: true, details: `${(node.error_rate * 100).toFixed(1)}%` });
  } else {
    console.log('❌ Error rate mismatch');
    results.push({ name: 'Error rate calculation', passed: false, details: 'Rate mismatch' });
  }
} catch (err: any) {
  console.log(`❌ Error rate test failed: ${err.message}`);
  results.push({ name: 'Error rate calculation', passed: false, details: err.message });
}

// Test 4: Cache hit/miss tracking
console.log('\nTest 4: Cache hit/miss tracking');
try {
  const metrics = getOperationalMetrics();
  metrics.reset();

  metrics.recordNodeExecution('cache_test', 50);

  // 6 hits, 4 misses = 60% hit rate
  for (let i = 0; i < 6; i++) {
    metrics.recordCacheOperation('cache_test', true);
  }
  for (let i = 0; i < 4; i++) {
    metrics.recordCacheOperation('cache_test', false);
  }

  const node = metrics.getNodeMetrics('cache_test');
  const expectedHitRate = 0.6;
  const tolerance = 0.01;

  if (node && Math.abs(node.cache_hit_rate - expectedHitRate) < tolerance) {
    console.log(`✅ Cache hit rate: ${(node.cache_hit_rate * 100).toFixed(1)}%`);
    results.push({ name: 'Cache tracking', passed: true, details: `${(node.cache_hit_rate * 100).toFixed(1)}%` });
  } else {
    console.log('❌ Cache hit rate mismatch');
    results.push({ name: 'Cache tracking', passed: false, details: 'Rate mismatch' });
  }
} catch (err: any) {
  console.log(`❌ Cache tracking test failed: ${err.message}`);
  results.push({ name: 'Cache tracking', passed: false, details: err.message });
}

// Test 5: Latency statistics
console.log('\nTest 5: Latency statistics');
try {
  const metrics = getOperationalMetrics();
  metrics.reset();

  const latencies = [45, 67, 89, 120, 55];
  latencies.forEach((lat) => {
    metrics.recordNodeExecution('latency_test', lat);
  });

  const node = metrics.getNodeMetrics('latency_test');
  const expectedMin = 45;
  const expectedMax = 120;
  const expectedMean = latencies.reduce((a, b) => a + b, 0) / latencies.length;

  if (
    node &&
    node.latency_stats.min === expectedMin &&
    node.latency_stats.max === expectedMax &&
    Math.abs(node.latency_stats.mean - expectedMean) < 0.1
  ) {
    console.log(`✅ Latency stats: min=${node.latency_stats.min}, max=${node.latency_stats.max}, mean=${node.latency_stats.mean.toFixed(1)}`);
    results.push({ name: 'Latency statistics', passed: true, details: `min/max/mean computed` });
  } else {
    console.log('❌ Latency stats mismatch');
    results.push({ name: 'Latency statistics', passed: false, details: 'Stats error' });
  }
} catch (err: any) {
  console.log(`❌ Latency test failed: ${err.message}`);
  results.push({ name: 'Latency statistics', passed: false, details: err.message });
}

// Test 6: Operational snapshot
console.log('\nTest 6: Operational snapshot');
try {
  const metrics = getOperationalMetrics();
  metrics.reset();

  metrics.recordNodeExecution('snap_node1', 50);
  metrics.recordNodeExecution('snap_node2', 75);
  metrics.recordCacheOperation('snap_node1', true);
  metrics.recordCacheOperation('snap_node1', false);

  const snapshot = metrics.getSnapshot();

  if (
    snapshot.total_queries === 2 &&
    snapshot.cache_hit_rate === 0.5 &&
    snapshot.nodes.size === 2
  ) {
    console.log(`✅ Snapshot: ${snapshot.total_queries} queries, ${(snapshot.cache_hit_rate * 100).toFixed(1)}% cache hit`);
    results.push({ name: 'Operational snapshot', passed: true, details: `2 queries, 50% cache hit` });
  } else {
    console.log('❌ Snapshot structure invalid');
    results.push({ name: 'Operational snapshot', passed: false, details: 'Structure mismatch' });
  }
} catch (err: any) {
  console.log(`❌ Snapshot test failed: ${err.message}`);
  results.push({ name: 'Operational snapshot', passed: false, details: err.message });
}

// Test 7: Multi-node aggregate metrics
console.log('\nTest 7: Multi-node aggregate metrics');
try {
  const metrics = getOperationalMetrics();
  metrics.reset();

  // Node 1: 5 execs, 1 error = 20% error rate
  for (let i = 0; i < 4; i++) {
    metrics.recordNodeExecution('node_a', 50);
  }
  metrics.recordNodeExecution('node_a', 50, 'error');

  // Node 2: 5 execs, 0 errors = 0% error rate
  for (let i = 0; i < 5; i++) {
    metrics.recordNodeExecution('node_b', 75);
  }

  const snapshot = metrics.getSnapshot();
  const expectedErrorRate = 1 / 10; // 1 error out of 10 total

  if (snapshot.total_queries === 10 && Math.abs(snapshot.error_rate - expectedErrorRate) < 0.01) {
    console.log(`✅ Aggregate error rate: ${(snapshot.error_rate * 100).toFixed(1)}%`);
    results.push({ name: 'Aggregate metrics', passed: true, details: `10% overall error rate` });
  } else {
    console.log('❌ Aggregate metrics mismatch');
    results.push({ name: 'Aggregate metrics', passed: false, details: 'Aggregate error' });
  }
} catch (err: any) {
  console.log(`❌ Aggregate test failed: ${err.message}`);
  results.push({ name: 'Aggregate metrics', passed: false, details: err.message });
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
await fs.writeFile('.tmp/p6-operational-monitoring-test-results.json', JSON.stringify(report, null, 2));

console.log(`✓ Report written: .tmp/p6-operational-monitoring-test-results.json\n`);

// Final gate
const gatePass = failed === 0;
console.log(`╔════════════════════════════════════════════════════════╗`);
console.log(`║ ${gatePass ? '✅ P6 GATE PASS' : '❌ P6 GATE FAIL'} — Monitoring validated${gatePass ? '       ' : '       '}║`);
console.log(`╚════════════════════════════════════════════════════════╝\n`);

process.exit(gatePass ? 0 : 1);
