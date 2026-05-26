#!/usr/bin/env node

/**
 * Test ollamaCachedChat() with gemma4-rotorquant:latest-fast
 *
 * Expected results:
 * - Run 1: ~3s (cold, direct Ollama)
 * - Run 2: ~5ms (hot, L1 Redis hit)
 * - Run 3: ~5ms (hot, L1 Redis hit)
 */

const query = 'What is hearsay evidence in California criminal law?';

async function test() {
  console.log('Testing ollamaCachedChat with gemma4-rotorquant:latest-fast\n');

  // Call via API endpoint that uses ollamaCachedChat
  async function makeRequest() {
    const start = Date.now();
    const response = await fetch('http://localhost:5173/api/test/ollama-cached', {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({
        query,
        model: 'gemma4-rotorquant:latest-fast',
        temperature: 0.3,
        maxTokens: 200
      })
    }).then(r => r.json());
    const elapsed = Date.now() - start;
    return { response, elapsed };
  }

  console.log('Run 1 (Cold - L1 miss, direct Ollama)...');
  const run1 = await makeRequest();
  console.log(`✓ ${run1.elapsed}ms`);
  if (run1.response.error) {
    console.error(`❌ Error: ${run1.response.error}`);
    return;
  }
  console.log(`Response: ${run1.response.content?.slice(0, 100)}...`);

  console.log('\nRun 2 (Hot - L1 Redis hit expected)...');
  const run2 = await makeRequest();
  console.log(`✓ ${run2.elapsed}ms`);

  console.log('\nRun 3 (Hot - L1 Redis hit expected)...');
  const run3 = await makeRequest();
  console.log(`✓ ${run3.elapsed}ms`);

  const speedup = Math.round(run1.elapsed / Math.min(run2.elapsed, run3.elapsed));

  console.log(`\n📊 Results:`);
  console.log(`  Run 1 (Cold): ${(run1.elapsed/1000).toFixed(1)}s`);
  console.log(`  Run 2 (L1):   ${run2.elapsed}ms`);
  console.log(`  Run 3 (L1):   ${run3.elapsed}ms`);
  console.log(`  Speedup:      ${speedup}×`);

  if (run2.elapsed < 100 && run3.elapsed < 100) {
    console.log(`\n✅ L1 Redis cache working! (both runs < 100ms)`);
  } else {
    console.log(`\n⚠️  Cache may not be hitting (runs 2/3 should be < 100ms)`);
  }
}

test().catch(console.error);
