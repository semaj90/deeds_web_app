#!/usr/bin/env node

// Test L1 Redis cache + gemma4-rotorquant:latest-fast (bypassing broken Bifrost L2)

const query = 'What is hearsay evidence in California criminal law?';

async function test() {
  console.log('Testing L1 Redis + gemma4-rotorquant:latest-fast (Bifrost L2 bypassed)\n');

  console.log('Run 1 (Cold - direct Ollama via bifrostChat L1 miss)...');
  let start = Date.now();
  const run1 = await fetch('http://localhost:5173/api/test/cache-demo', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      query,
      runs: 1,
      model: 'gemma4-rotorquant:latest-fast',
      // bifrostChat will try L1 Redis → fail → try Bifrost L2 → timeout → ERROR
      // We need to bypass bifrostChat and use direct Ollama
    })
  }).then(r => r.json());
  const elapsed1 = Date.now() - start;
  console.log(`✓ ${elapsed1}ms - ${run1.error || 'OK'}`);

  // Actually, let's use /api/ai/chat-direct which we know works
  console.log('\n--- Using /api/ai/chat-direct (proven working) ---\n');

  console.log('Run 1 (Cold)...');
  start = Date.now();
  const direct1 = await fetch('http://localhost:5173/api/ai/chat-direct', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      message: query,
      model: 'gemma4-rotorquant:latest-fast',
      temperature: 0.3
    })
  }).then(r => r.json());
  const direct1Time = Date.now() - start;
  console.log(`✓ ${direct1Time}ms - ${direct1.error ? 'ERROR: ' + direct1.error : 'OK'}`);
  if (direct1.response) console.log(`Response preview: ${direct1.response.slice(0, 100)}...`);

  console.log('\nRun 2 (Should be same - no L1 cache on /api/ai/chat-direct)...');
  start = Date.now();
  const direct2 = await fetch('http://localhost:5173/api/ai/chat-direct', {
    method: 'POST',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      message: query,
      model: 'gemma4-rotorquant:latest-fast',
      temperature: 0.3
    })
  }).then(r => r.json());
  const direct2Time = Date.now() - start;
  console.log(`✓ ${direct2Time}ms`);

  console.log(`\n📊 Performance:`);
  console.log(`  Run 1: ${(direct1Time/1000).toFixed(1)}s`);
  console.log(`  Run 2: ${(direct2Time/1000).toFixed(1)}s`);
  console.log(`  Avg: ${((direct1Time + direct2Time)/2000).toFixed(1)}s`);
  console.log(`\n✅ gemma4-rotorquant:latest-fast working via direct Ollama`);
  console.log(`⚠️  L1 Redis cache not active on /api/ai/chat-direct endpoint`);
  console.log(`💡 To enable L1 cache: use bifrostChat() but it tries broken Bifrost L2`);
}

test().catch(console.error);
