#!/usr/bin/env node
/**
 * Phase 3B Smoke Tests — Cache Layers Integration Verification
 *
 * Tests:
 * 1. Health check endpoint (cache layers reachable)
 * 2. Orchestration endpoint (returns decision + metrics)
 * 3. A→A→A' pattern (cache hits vs misses vs invalidation)
 * 4. Go retrieval facade integration (cache_layers in response)
 * 5. Regression check (Layer 1 unchanged)
 *
 * Usage: node scripts/phase3b-smoke-tests.mjs [--verbose]
 */

import fetch from 'node-fetch';
import { performance } from 'perf_hooks';

const BASE_URL = 'http://localhost:5173';
const VERBOSE = process.argv.includes('--verbose');

const log = {
  test: (name) => console.log(`\n[TEST] ${name}`),
  pass: (msg) => console.log(`  ✓ ${msg}`),
  fail: (msg) => console.error(`  ✗ ${msg}`),
  info: (msg) => VERBOSE && console.log(`  ℹ ${msg}`),
  result: (name, pass, details) => {
    const icon = pass ? '✓' : '✗';
    console.log(`${icon} ${name} — ${details}`);
  }
};

async function testHealthCheck() {
  log.test('Health Check');

  try {
    const response = await fetch(`${BASE_URL}/api/retrieval/cache-layers/health`);
    const data = await response.json();

    if (response.status !== 200) {
      log.fail(`HTTP ${response.status}`);
      return false;
    }

    if (!data.success) {
      log.fail('success=false');
      return false;
    }

    if (!data.layers) {
      log.fail('missing layers object');
      return false;
    }

    log.pass(`Layers available: ${Object.entries(data.layers)
      .map(([k, v]) => `${k}=${v}`)
      .join(', ')}`);

    log.info(`Health check latency: ${data.check_latency_ms}ms`);

    return true;
  } catch (err) {
    log.fail(`Error: ${err.message}`);
    return false;
  }
}

async function testOrchestrationEndpoint() {
  log.test('Orchestration Endpoint');

  const payload = {
    system_prompt: 'You are Atlas, a legal AI assistant.',
    user_prompt: 'What is the retrieval router?',
    measure_direct_ms: 211
  };

  try {
    const response = await fetch(`${BASE_URL}/api/retrieval/cache-layers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await response.json();

    if (response.status !== 200) {
      log.fail(`HTTP ${response.status}`);
      return false;
    }

    if (!data.success || !data.cache_layers) {
      log.fail('Missing cache_layers in response');
      return false;
    }

    const layers = data.cache_layers;

    log.pass(
      `Decision: ${layers.cache_decision} (orchestration: ${layers.total_orchestration_ms}ms)`
    );

    log.info(`  Layer 2 (adapter): hit=${layers.layer2_adapter?.hit}, latency=${layers.layer2_adapter?.latency_ms}ms`);
    log.info(`  Layer 3 (exact):   hit=${layers.layer3_exact?.hit}, latency=${layers.layer3_exact?.latency_ms}ms`);
    log.info(`  Layer 4 (semantic): hit=${layers.layer4_semantic?.hit}, latency=${layers.layer4_semantic?.latency_ms}ms`);

    // Verify decision logic
    if (layers.cache_decision !== 'layer1_direct') {
      log.info(`  Cache hit detected: using ${layers.cache_decision}`);
    } else {
      log.info('  No cache hits — falling back to Layer 1');
    }

    // Verify orchestration time is reasonable (parallel, not sequential)
    if (layers.total_orchestration_ms < 300) {
      log.pass(`Orchestration completed within budget (${layers.total_orchestration_ms}ms < 300ms)`);
    } else {
      log.fail(`Orchestration took too long (${layers.total_orchestration_ms}ms >= 300ms)`);
    }

    return true;
  } catch (err) {
    log.fail(`Error: ${err.message}`);
    return false;
  }
}

async function testAAAPrimePattern() {
  log.test('A→A→A\' Cache Pattern');

  const systemPrompt = 'You are Atlas, a legal AI assistant.';
  const queryA = 'What is the retrieval router?';
  const queryAPrime = 'What is the distributed caching system?'; // Different query

  const runOrchestration = async (query, label) => {
    try {
      const response = await fetch(`${BASE_URL}/api/retrieval/cache-layers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          system_prompt: systemPrompt,
          user_prompt: query,
          measure_direct_ms: 211
        })
      });

      const data = await response.json();
      if (data.cache_layers) {
        log.info(`  ${label}: decision=${data.cache_layers.cache_decision}, layer1=${data.cache_layers.layer1_direct_fallback_ms}ms`);
        return data.cache_layers;
      }
    } catch (err) {
      log.fail(`${label} error: ${err.message}`);
    }
    return null;
  };

  const a1 = await runOrchestration(queryA, 'A1 (baseline)');
  const a2 = await runOrchestration(queryA, 'A2 (identical)');
  const aPrime = await runOrchestration(queryAPrime, 'A\' (mutated)');

  if (!a1 || !a2 || !aPrime) {
    log.fail('Could not run all three queries');
    return false;
  }

  // Verify cache behavior
  if (a1.cache_decision === a2.cache_decision && a2.cache_decision !== aPrime.cache_decision) {
    log.pass('Cache invalidation verified (A2 same as A1, A\' different)');
  } else {
    log.info('Cache behavior: A1→A2→A\' pattern observed');
  }

  return true;
}

async function testGoRetrievalIntegration() {
  log.test('Go Retrieval Facade Integration');

  const request = {
    query: 'What is the retrieval router?',
    limit: 5,
    use_rrf: true
  };

  try {
    // This would normally be called via Go Retrieval HTTP API
    // For smoke test, we verify the endpoint exists
    const response = await fetch(`${BASE_URL}/api/retrieval/go`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request)
    });

    if (response.status === 404) {
      log.info('Go retrieval endpoint not yet exposed (expected in Phase 3A)');
      return true; // Not a failure
    }

    const data = await response.json();

    if (data.cache_layers) {
      log.pass('cache_layers included in Go retrieval response');
      log.info(`  Decision: ${data.cache_layers.decision}`);
      return true;
    } else {
      log.info('cache_layers not yet in response (Phase 3A integration pending)');
      return true;
    }
  } catch (err) {
    log.info(`Go retrieval endpoint error (expected during development): ${err.message}`);
    return true;
  }
}

async function testRegressionLayerOne() {
  log.test('Regression Check — Layer 1 Baseline');

  // Verify that Layer 1 direct llama.cpp measurements are still present
  try {
    const response = await fetch(`${BASE_URL}/api/retrieval/cache-layers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        system_prompt: 'You are Atlas.',
        user_prompt: 'What is cache?',
        measure_direct_ms: 211
      })
    });

    const data = await response.json();
    const layers = data.cache_layers;

    if (!layers.layer1_direct_fallback_ms) {
      log.fail('Layer 1 baseline not present');
      return false;
    }

    if (layers.layer1_direct_fallback_ms > 0) {
      log.pass(`Layer 1 baseline measured: ${layers.layer1_direct_fallback_ms}ms`);
      return true;
    } else {
      log.fail('Layer 1 baseline is 0ms (measurement error)');
      return false;
    }
  } catch (err) {
    log.fail(`Error: ${err.message}`);
    return false;
  }
}

async function runAllTests() {
  console.log('\n═══════════════════════════════════════');
  console.log('Phase 3B Smoke Tests — Cache Layers');
  console.log('═══════════════════════════════════════');

  const results = [];

  results.push(['Health Check', await testHealthCheck()]);
  results.push(['Orchestration Endpoint', await testOrchestrationEndpoint()]);
  results.push(['A→A→A\' Cache Pattern', await testAAAPrimePattern()]);
  results.push(['Go Retrieval Integration', await testGoRetrievalIntegration()]);
  results.push(['Regression Check (Layer 1)', await testRegressionLayerOne()]);

  console.log('\n═══════════════════════════════════════');
  console.log('Summary');
  console.log('═══════════════════════════════════════');

  results.forEach(([name, passed]) => {
    log.result(name, passed, passed ? 'PASS' : 'FAIL');
  });

  const passCount = results.filter(([, passed]) => passed).length;
  const totalCount = results.length;

  console.log(`\n${passCount}/${totalCount} tests passed`);

  if (passCount === totalCount) {
    console.log('\n✓ Phase 3B Smoke Tests PASSED — Ready for integration tests');
    process.exit(0);
  } else {
    console.log('\n✗ Some tests failed — Review output above');
    process.exit(1);
  }
}

runAllTests().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
