#!/usr/bin/env node
/**
 * L1 Redis Cache Validation Test
 * Tests /api/test/ollama-cached endpoint
 * Expected: Run 1 ~2-3s, Run 2 ~5-50ms (Redis hit)
 */

const BASE_URL = process.env.PUBLIC_APP_URL ?? 'http://localhost:5173';

async function testCache(query, model = 'gemma3:270m') {
  const start = Date.now();

  try {
    const response = await fetch(`${BASE_URL}/api/test/ollama-cached`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        query,
        model,
        temperature: 0.3,
        maxTokens: 50
      })
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`HTTP ${response.status}: ${text.slice(0, 200)}`);
    }

    const data = await response.json();
    const clientMs = Date.now() - start;

    return {
      success: data.success,
      serverMs: data.latencyMs,
      clientMs,
      cached: data.cached,
      content: data.content?.slice(0, 100) + '...',
      error: data.error
    };
  } catch (err) {
    return {
      success: false,
      error: err.message,
      serverMs: 0,
      clientMs: Date.now() - start
    };
  }
}

async function main() {
  console.log('\n╔═══════════════════════════════════════════════════════╗');
  console.log('║       L1 Redis Cache Validation Test                 ║');
  console.log('╚═══════════════════════════════════════════════════════╝\n');

  const query = 'What is hearsay evidence in 5 words?';
  const model = 'gemma3:270m';

  console.log(`Query: "${query}"`);
  console.log(`Model: ${model}\n`);

  // Run 1: Cold (expect ~2-3s)
  console.log('━━━ Run 1: Cold (Direct Ollama) ━━━');
  const run1 = await testCache(query, model);

  if (!run1.success) {
    console.error('❌ FAILED:', run1.error);
    process.exit(1);
  }

  console.log(`✅ Success`);
  console.log(`   Server: ${run1.serverMs}ms`);
  console.log(`   Client: ${run1.clientMs}ms`);
  console.log(`   Cached: ${run1.cached ? 'YES' : 'NO'}`);
  console.log(`   Content: ${run1.content}\n`);

  // Wait 1 second
  await new Promise(r => setTimeout(r, 1000));

  // Run 2: Warm (expect <50ms from Redis)
  console.log('━━━ Run 2: Warm (Redis L1 Hit Expected) ━━━');
  const run2 = await testCache(query, model);

  if (!run2.success) {
    console.error('❌ FAILED:', run2.error);
    process.exit(1);
  }

  console.log(`✅ Success`);
  console.log(`   Server: ${run2.serverMs}ms`);
  console.log(`   Client: ${run2.clientMs}ms`);
  console.log(`   Cached: ${run2.cached ? 'YES ✨' : 'NO'}`);
  console.log(`   Content: ${run2.content}\n`);

  // Wait 1 second
  await new Promise(r => setTimeout(r, 1000));

  // Run 3: Hot (expect <50ms from Redis)
  console.log('━━━ Run 3: Hot (Redis L1 Hit Expected) ━━━');
  const run3 = await testCache(query, model);

  if (!run3.success) {
    console.error('❌ FAILED:', run3.error);
    process.exit(1);
  }

  console.log(`✅ Success`);
  console.log(`   Server: ${run3.serverMs}ms`);
  console.log(`   Client: ${run3.clientMs}ms`);
  console.log(`   Cached: ${run3.cached ? 'YES ✨' : 'NO'}`);
  console.log(`   Content: ${run3.content}\n`);

  // Analysis
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📊 Performance Analysis');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  const speedup2 = Math.round(run1.serverMs / run2.serverMs);
  const speedup3 = Math.round(run1.serverMs / run3.serverMs);

  console.log(`\nRun 1 (Cold):  ${run1.serverMs}ms`);
  console.log(`Run 2 (Warm):  ${run2.serverMs}ms (${speedup2}× faster)`);
  console.log(`Run 3 (Hot):   ${run3.serverMs}ms (${speedup3}× faster)`);

  // Validation
  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('✅ Validation Results');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  const pass1 = run1.serverMs > 1000; // Cold should be slow
  const pass2 = run2.serverMs < 100;  // Warm should be cached
  const pass3 = run3.serverMs < 100;  // Hot should be cached

  console.log(`Cold inference (>1s):     ${pass1 ? '✅ PASS' : '❌ FAIL'} (${run1.serverMs}ms)`);
  console.log(`Warm cache hit (<100ms):  ${pass2 ? '✅ PASS' : '❌ FAIL'} (${run2.serverMs}ms)`);
  console.log(`Hot cache hit (<100ms):   ${pass3 ? '✅ PASS' : '❌ FAIL'} (${run3.serverMs}ms)`);

  const allPass = pass1 && pass2 && pass3;

  if (allPass) {
    console.log('\n🎉 L1 Redis Cache: WORKING! 🚀');
    console.log(`   Speedup: ${speedup2}-${speedup3}× faster on cache hits\n`);
  } else {
    console.log('\n⚠️ Some tests failed - check Redis connection\n');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('\n❌ Fatal Error:', err.message);
  process.exit(1);
});
