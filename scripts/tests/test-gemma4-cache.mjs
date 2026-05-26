#!/usr/bin/env node

// Test gemma4-rotorquant:latest-fast with 3-tier cache

const query = 'What is hearsay evidence in California criminal law?';

async function test() {
  console.log('Testing cache with gemma4-rotorquant:latest-fast model...\n');

  console.log('Run 1 (Cold - L3 Ollama)...');
  let start = Date.now();
  const run1 = await fetch('http://localhost:5173/api/test/cache-demo', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ query, runs: 1, model: 'gemma4-rotorquant:latest-fast' })
  }).then(r => r.json());
  const elapsed1 = Date.now() - start;
  console.log(`✓ ${elapsed1}ms - ${run1.error || 'OK'}`);

  if (run1.error) {
    console.error('\n❌ Test failed on Run 1:', run1.error);
    return;
  }

  console.log('\nRun 2 (L2 Bifrost expected)...');
  start = Date.now();
  const run2 = await fetch('http://localhost:5173/api/test/cache-demo', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ query, runs: 1, model: 'gemma4-rotorquant:latest-fast' })
  }).then(r => r.json());
  const elapsed2 = Date.now() - start;
  console.log(`✓ ${elapsed2}ms - ${run2.error || 'OK'}`);

  console.log('\nRun 3 (L1 Redis expected)...');
  start = Date.now();
  const run3 = await fetch('http://localhost:5173/api/test/cache-demo', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ query, runs: 1, model: 'gemma4-rotorquant:latest-fast' })
  }).then(r => r.json());
  const elapsed3 = Date.now() - start;
  console.log(`✓ ${elapsed3}ms - ${run3.error || 'OK'}`);

  if (!run3.error) {
    const speedup = Math.round(run1.results[0].latencyMs / run3.results[0].latencyMs);
    console.log(`\n🚀 Speedup: ${speedup}× (cold → hot)`);
    console.log(`L3 (Ollama): ${run1.results[0].latencyMs}ms`);
    console.log(`L2 (Bifrost): ${run2.results[0].latencyMs}ms`);
    console.log(`L1 (Redis): ${run3.results[0].latencyMs}ms`);

    if (run3.results[0].latencyMs < 100) {
      console.log('\n✅ Cache is working! L1 hit < 100ms');
    } else if (run2.results[0].latencyMs < 5000) {
      console.log('\n✅ L2 cache working, but L1 might need warmup');
    } else {
      console.log('\n⚠️  Cache not hitting - all requests going to L3');
    }
  }
}

test().catch(console.error);
