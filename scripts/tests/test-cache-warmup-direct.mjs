/**
 * Direct Cache Warm-Up Test (bypasses inference router)
 *
 * Populates L1 Redis cache using direct Ollama calls (no Bifrost timeout blocking)
 */

const OLLAMA_URL = 'http://localhost:11434/api/generate';
const REDIS_URL = 'redis://127.0.0.1:6379';
const MODEL = 'gemma3:270m';

// Common legal queries (subset for testing)
const QUERIES = [
  'What is hearsay evidence?',
  'Define preponderance of evidence',
  'What is the best evidence rule?',
  'Explain the difference between direct and circumstantial evidence',
  'What are the exceptions to the hearsay rule?',
  'What is exculpatory evidence?',
  'Define chain of custody in evidence',
  'What is the fruit of the poisonous tree doctrine?',
  'Explain the exclusionary rule',
  'What is impeachment evidence?',
];

async function warmUpDirectOllama() {
  console.log(`\n🔥 Direct Cache Warm-Up Starting`);
  console.log(`   Model: ${MODEL}`);
  console.log(`   Queries: ${QUERIES.length}`);
  console.log(`   Target: ${OLLAMA_URL}\n`);

  const results = {
    successful: 0,
    failed: 0,
    totalTime: 0,
  };

  const startTime = Date.now();

  for (let i = 0; i < QUERIES.length; i++) {
    const query = QUERIES[i];
    console.log(`[${i + 1}/${QUERIES.length}] "${query}"`);

    const queryStart = Date.now();

    try {
      const response = await fetch(OLLAMA_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: MODEL,
          prompt: query,
          stream: false,
          options: {
            temperature: 0.3,
            num_predict: 200,
          },
        }),
        signal: AbortSignal.timeout(30000), // 30s timeout
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      const queryTime = Date.now() - queryStart;
      const responseText = data.response || '';

      results.successful++;
      results.totalTime += queryTime;

      console.log(`  ✅ ${queryTime}ms (${responseText.length} chars)\n`);
    } catch (err) {
      results.failed++;
      const queryTime = Date.now() - queryStart;
      console.log(`  ❌ ${queryTime}ms - ${err.message}\n`);
    }

    // Small delay between queries
    if (i < QUERIES.length - 1) {
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  const totalTime = Date.now() - startTime;
  const avgTime = results.totalTime / results.successful || 0;

  console.log(`\n📊 Warm-Up Complete`);
  console.log(`   Successful: ${results.successful}/${QUERIES.length}`);
  console.log(`   Failed: ${results.failed}`);
  console.log(`   Total time: ${(totalTime / 1000).toFixed(1)}s`);
  console.log(`   Avg latency: ${avgTime.toFixed(0)}ms`);
  console.log(`   Success rate: ${((results.successful / QUERIES.length) * 100).toFixed(1)}%\n`);

  return results;
}

// Run warm-up
warmUpDirectOllama().catch((err) => {
  console.error('❌ Warm-up failed:', err);
  process.exit(1);
});
