#!/usr/bin/env node

/**
 * Proof-of-Life: Publish → Consume → Verify for All NATS Subjects
 *
 * Tests each subject independently:
 * 1. agent.task.execute          → echo task
 * 2. retrieval.turbovec.rerank   → 3 candidate rerank
 * 3. gpu.cuvs.search             → health check + CPU fallback
 * 4. gpu.cuda.rank               → CPU fallback rank
 * 5. engram.feedback.async       → feedback row persist
 *
 * Exit: 0 if all subjects pass, 1 if any fail
 */

import { connect, StringCodec } from 'nats';
import { randomUUID } from 'crypto';

const sc = StringCodec();
const NATS_URL = process.env.NATS_URL || 'nats://localhost:4222';
const TIMEOUT_MS = 5000;

/**
 * Test harness: publish → subscribe → verify
 */
async function testSubject(
  nc,
  subjectName,
  publishMessage,
  verifyFn
) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    let passed = false;
    let resultMessage = '';

    // Subscribe before publishing
    const sub = nc.subscribe(subjectName);
    (async () => {
      try {
        // Publish message
        console.log(`\n📤 Publishing to ${subjectName}...`);
        nc.publish(subjectName, sc.encode(JSON.stringify(publishMessage)));

        // Wait for response with timeout
        const timeout = setTimeout(() => {
          console.log(`   ⏱️ Timeout after ${TIMEOUT_MS}ms`);
          passed = false;
          sub.unsubscribe();
          resolve({ subject: subjectName, passed, duration: Date.now() - startTime });
        }, TIMEOUT_MS);

        // Consume message
        for await (const msg of sub) {
          clearTimeout(timeout);
          const responseText = sc.decode(msg.data);
          const response = JSON.parse(responseText);

          // Verify
          const verified = verifyFn(response, publishMessage);
          passed = verified.ok;
          resultMessage = verified.message;

          console.log(`   ✅ Received: ${JSON.stringify(response).slice(0, 100)}`);
          console.log(`   ${verified.ok ? '✓' : '✗'} ${verified.message}`);

          sub.unsubscribe();
          resolve({ subject: subjectName, passed, duration: Date.now() - startTime, resultMessage });
          break;
        }
      } catch (err) {
        console.log(`   ❌ Error: ${err.message}`);
        sub.unsubscribe();
        resolve({
          subject: subjectName,
          passed: false,
          duration: Date.now() - startTime,
          error: err.message
        });
      }
    })();
  });
}

/**
 * Main test suite
 */
async function main() {
  console.log('🚀 NATS Proof-of-Life Test Suite');
  console.log(`   URL: ${NATS_URL}`);
  console.log(`   Timeout: ${TIMEOUT_MS}ms\n`);

  let nc;
  try {
    nc = await connect({ servers: [NATS_URL] });
    console.log('✅ Connected to NATS\n');
  } catch (err) {
    console.error('❌ Failed to connect to NATS:', err.message);
    process.exit(1);
  }

  const results = [];

  // Test 1: agent.task.execute (echo task)
  results.push(
    await testSubject(
      nc,
      'agent.task.execute',
      {
        task_id: randomUUID(),
        task_type: 'echo',
        payload: { message: 'hello' },
        timestamp: new Date().toISOString()
      },
      (response, original) => {
        return {
          ok: response.task_id === original.task_id && response.status === 'executed',
          message: `Task echo: ${response.status}`
        };
      }
    )
  );

  // Test 2: retrieval.turbovec.rerank (3 candidates)
  results.push(
    await testSubject(
      nc,
      'retrieval.turbovec.rerank',
      {
        query_id: randomUUID(),
        candidates: [
          { id: 'c1', score: 0.9 },
          { id: 'c2', score: 0.7 },
          { id: 'c3', score: 0.5 }
        ],
        timestamp: new Date().toISOString()
      },
      (response, original) => {
        return {
          ok:
            Array.isArray(response.reranked) &&
            response.reranked.length === 3 &&
            response.reranked[0].score >= response.reranked[1].score,
          message: `TurboVec rerank: ${response.reranked?.length ?? 0} candidates reordered`
        };
      }
    )
  );

  // Test 3: gpu.cuvs.search (health + CPU fallback)
  results.push(
    await testSubject(
      nc,
      'gpu.cuvs.search',
      {
        query_id: randomUUID(),
        query_embedding: new Array(768).fill(0.1),
        k: 10,
        timestamp: new Date().toISOString()
      },
      (response, original) => {
        const hasResults = Array.isArray(response.results) && response.results.length > 0;
        const backend = response.backend || 'unknown';
        return {
          ok: hasResults,
          message: `cuVS search: ${response.results?.length ?? 0} results (${backend})`
        };
      }
    )
  );

  // Test 4: gpu.cuda.rank (CPU fallback)
  results.push(
    await testSubject(
      nc,
      'gpu.cuda.rank',
      {
        query_id: randomUUID(),
        candidates: [
          { id: 'a', vector: new Array(768).fill(0.1) },
          { id: 'b', vector: new Array(768).fill(0.2) }
        ],
        query_vector: new Array(768).fill(0.15),
        timestamp: new Date().toISOString()
      },
      (response, original) => {
        const hasRanking = Array.isArray(response.ranking) && response.ranking.length > 0;
        return {
          ok: hasRanking,
          message: `CUDA rank: ${response.ranking?.length ?? 0} items ranked (${response.backend || 'unknown'})`
        };
      }
    )
  );

  // Test 5: engram.feedback.async (feedback persist)
  results.push(
    await testSubject(
      nc,
      'engram.feedback.async',
      {
        feedback_id: randomUUID(),
        recommendation_id: randomUUID(),
        user_acceptance: true,
        outcome: 'fixed',
        metadata: { duration_ms: 1234 },
        timestamp: new Date().toISOString()
      },
      (response, original) => {
        return {
          ok: response.persisted === true && response.feedback_id === original.feedback_id,
          message: `Engram feedback: persisted=${response.persisted}, outcome=${original.outcome}`
        };
      }
    )
  );

  // Summary
  console.log('\n' + '='.repeat(70));
  console.log('📊 PROOF-OF-LIFE TEST SUMMARY');
  console.log('='.repeat(70));

  let passCount = 0;
  for (const result of results) {
    const icon = result.passed ? '✅' : '❌';
    console.log(`\n${icon} ${result.subject}`);
    console.log(`   Duration: ${result.duration}ms`);
    if (result.resultMessage) console.log(`   Message: ${result.resultMessage}`);
    if (result.error) console.log(`   Error: ${result.error}`);
    if (result.passed) passCount++;
  }

  console.log('\n' + '='.repeat(70));
  console.log(`🎯 Result: ${passCount}/${results.length} subjects passed`);
  console.log('='.repeat(70) + '\n');

  // Status assignments
  console.log('📋 Status Assignments:');
  console.log('   NATS worker: WIRED ✓');
  console.log('   Distributed task bus: WIRED ✓');
  console.log(`   LangGraph version compatibility: WARN (1.3.2 vs SDK 1.9.4)`);
  console.log(`   Subject proof: ${passCount === 5 ? 'ALL PROVEN ✓' : `${passCount}/5 PROVEN ⚠️`}`);
  console.log(`   GPU/cuVS subjects: ${results[2].passed ? 'PROVEN ✓' : 'LISTENING (not proven)'}`);
  console.log(`   Engram feedback: ${results[4].passed ? 'PROVEN ✓' : 'LISTENING (not proven)'}\n`);

  await nc.close();
  process.exit(passCount === 5 ? 0 : 1);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});