/**
 * Cache Warm-Up via /api/ai/chat-direct endpoint
 *
 * Uses the optimized chat-direct endpoint (gemma3:270m default)
 * This should populate L1 Redis cache properly
 */

const API_URL = 'http://localhost:5173/api/ai/chat-direct';
const MODEL = 'gemma3:270m';

// Common legal queries (10 queries for quick test)
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
  'Define relevance in evidence law',
  'What is the attorney-client privilege?',
  'Explain work product doctrine',
  'What is spoliation of evidence?',
  'What is demonstrative evidence?',
];

async function warmUpViaEndpoint() {
  console.log(`\n🔥 Cache Warm-Up via API Endpoint`);
  console.log(`   Model: ${MODEL}`);
  console.log(`   Queries: ${QUERIES.length}`);
  console.log(`   Endpoint: ${API_URL}\n`);

  const results = {
    successful: 0,
    failed: 0,
    totalTime: 0,
    errors: [],
  };

  const startTime = Date.now();

  for (let i = 0; i < QUERIES.length; i++) {
    const query = QUERIES[i];
    console.log(`[${i + 1}/${QUERIES.length}] "${query.slice(0, 50)}..."`);

    const queryStart = Date.now();

    try {
      const response = await fetch(API_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: query,
          model: MODEL,
          temperature: 0.3,
        }),
        signal: AbortSignal.timeout(30000), // 30s timeout
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errorText}`);
      }

      const data = await response.json();
      const queryTime = Date.now() - queryStart;
      const responseText = data.response || '';

      results.successful++;
      results.totalTime += queryTime;

      console.log(`  ✅ ${queryTime}ms (${responseText.length} chars, backend: ${data.backend})\n`);
    } catch (err) {
      results.failed++;
      results.errors.push({ query, error: err.message });
      const queryTime = Date.now() - queryStart;
      console.log(`  ❌ ${queryTime}ms - ${err.message}\n`);
    }

    // Small delay between queries
    if (i < QUERIES.length - 1) {
      await new Promise((r) => setTimeout(r, 300));
    }
  }

  const totalTime = Date.now() - startTime;
  const avgTime = results.totalTime / results.successful || 0;

  console.log(`\n📊 Warm-Up Complete`);
  console.log(`   Successful: ${results.successful}/${QUERIES.length}`);
  console.log(`   Failed: ${results.failed}`);
  console.log(`   Total time: ${(totalTime / 1000).toFixed(1)}s`);
  console.log(`   Avg latency: ${avgTime.toFixed(0)}ms`);
  console.log(`   Success rate: ${((results.successful / QUERIES.length) * 100).toFixed(1)}%`);

  if (results.errors.length > 0) {
    console.log(`\n❌ Errors:`);
    results.errors.forEach((e, i) => {
      console.log(`   ${i + 1}. "${e.query.slice(0, 40)}..." - ${e.error}`);
    });
  }

  console.log();

  return results;
}

// Run warm-up
warmUpViaEndpoint().catch((err) => {
  console.error('❌ Warm-up failed:', err);
  process.exit(1);
});
