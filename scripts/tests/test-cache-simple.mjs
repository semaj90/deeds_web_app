#!/usr/bin/env node

// Simple Redis L1 + Bifrost L2 Cache Test
// Usage: node scripts/tests/test-cache-simple.mjs

console.log('\n=== Redis L1 + Bifrost L2 Cache Test ===\n');

async function testCache() {
  const query = 'What is hearsay evidence in California criminal law?';
  
  console.log('Query:', query);
  console.log('\nRun 1 (Cold - expect ~30s with gemma4-legal)...');
  let start = Date.now();
  
  const run1 = await fetch('http://localhost:5173/api/test/cache-demo', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ query, runs: 1 })
  }).then(r => r.json());
  
  console.log(`✓ ${Date.now() - start}ms`);
  
  console.log('\nRun 2 (Warm - expect <10s if Bifrost L2 hit)...');
  start = Date.now();
  
  const run2 = await fetch('http://localhost:5173/api/test/cache-demo', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ query, runs: 1 })
  }).then(r => r.json());
  
  console.log(`✓ ${Date.now() - start}ms`);
  
  console.log('\nRun 3 (Hot - expect <100ms if Redis L1 hit)...');
  start = Date.now();
  
  const run3 = await fetch('http://localhost:5173/api/test/cache-demo', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({ query, runs: 1 })
  }).then(r => r.json());
  
  const elapsed3 = Date.now() - start;
  console.log(`✓ ${elapsed3}ms`);
  
  console.log('\n=== Results ===');
  console.log(`Run 1: ${run1.results[0].latencyMs}ms (${run1.results[0].expectedTier})`);
  console.log(`Run 2: ${run2.results[0].latencyMs}ms (${run2.results[0].expectedTier})`);
  console.log(`Run 3: ${run3.results[0].latencyMs}ms (${run3.results[0].expectedTier})`);
  
  const speedup = Math.round(run1.results[0].latencyMs / run3.results[0].latencyMs);
  console.log(`\n🚀 Speedup: ${speedup}× (cold → hot)`);
  console.log(`\nCache Stats: ${run3.cacheStats.after.totalKeys} keys, ${run3.cacheStats.after.memoryMB}MB`);
}

testCache().catch(console.error);
