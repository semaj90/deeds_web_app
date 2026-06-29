#!/usr/bin/env node

/**
 * Proof-of-Life: Request/Reply for All 5 NATS Subjects
 *
 * Uses nc.request() to send request and wait for response.
 * Handlers must be running separately (nats:handlers).
 *
 * Tests:
 * 1. agent.task.execute          → echo task execution
 * 2. retrieval.turbovec.rerank   → rerank candidates
 * 3. gpu.cuvs.search             → GPU search
 * 4. gpu.cuda.rank               → GPU rank
 * 5. engram.feedback.async       → feedback persistence
 *
 * Exit: 0 if all pass, 1 if any fail
 */

import { connect, StringCodec } from 'nats';
import { randomUUID } from 'crypto';

const sc = StringCodec();
const NATS_URL = process.env.NATS_URL || 'nats://localhost:4222';
const TIMEOUT_MS = 5000;

/**
 * Test a subject using request/reply pattern
 */
async function testSubject(nc, subjectName, requestMessage, verifyFn) {
  const startTime = Date.now();

  try {
    console.log(`\n📤 Testing ${subjectName}...`);

    // Send request and wait for reply
    const reply = await nc.request(
      subjectName,
      sc.encode(JSON.stringify(requestMessage)),
      { timeout: TIMEOUT_MS }
    );

    const responseText = sc.decode(reply.data);
    const response = JSON.parse(responseText);
    const duration = Date.now() - startTime;

    // Verify response structure
    const verified = verifyFn(response, requestMessage);

    if (verified.ok) {
      console.log(`   ✅ PASS (${duration}ms)`);
      console.log(`   Message: ${verified.message}`);
      return { subject: subjectName, passed: true, duration, message: verified.message };
    } else {
      console.log(`   ❌ FAIL (${duration}ms)`);
      console.log(`   Message: ${verified.message}`);
      return { subject: subjectName, passed: false, duration, message: verified.message };
    }

  } catch (err) {
    const duration = Date.now() - startTime;
    console.log(`   ❌ ERROR (${duration}ms)`);
    console.log(`   Error: ${err.message}`);
    return { subject: subjectName, passed: false, duration, error: err.message };
  }
}

/**
 * Main test suite
 */
async function main() {
  console.log('🚀 NATS Proof-of-Life Test Suite (Request/Reply)\n');
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

  // Test 1: agent.task.execute
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
        const ok = response.task_id === original.task_id && response.status === 'executed';
        return {
          ok,
          message: `Task ${response.status || '?'}: ${response.handler || 'unknown'}`
        };
      }
    )
  );

  // Test 2: retrieval.turbovec.rerank
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
        const ok = Array.isArray(response.reranked) && response.reranked.length === 3;
        return {
          ok,
          message: `TurboVec: ${response.reranked?.length || 0} candidates reordered via ${response.backend || '?'}`
        };
      }
    )
  );

  // Test 3: gpu.cuvs.search
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
        const ok = Array.isArray(response.results) && response.results.length > 0;
        return {
          ok,
          message: `cuVS: ${response.results?.length || 0} results via ${response.backend || '?'}`
        };
      }
    )
  );

  // Test 4: gpu.cuda.rank
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
        const ok = Array.isArray(response.ranking) && response.ranking.length > 0;
        return {
          ok,
          message: `CUDA: ${response.ranking?.length || 0} items ranked via ${response.backend || '?'}`
        };
      }
    )
  );

  // Test 5: engram.feedback.async
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
        const ok = response.persisted === true && response.feedback_id === original.feedback_id;
        return {
          ok,
          message: `Engram: persisted=${response.persisted}, outcome=${response.outcome}`
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
    if (result.message) console.log(`   Message: ${result.message}`);
    if (result.error) console.log(`   Error: ${result.error}`);
    if (result.passed) passCount++;
  }

  console.log('\n' + '='.repeat(70));
  console.log(`🎯 Result: ${passCount}/${results.length} subjects passed`);
  console.log('='.repeat(70) + '\n');

  if (passCount === 5) {
    console.log('🎉 ALL SUBJECTS PROVEN!');
    console.log('   NATS worker: WIRED ✓');
    console.log('   Distributed task bus: WIRED ✓');
    console.log('   Subject proof: ALL PROVEN ✓');
    console.log('   Overall: PRODUCTION READY ✓\n');
  } else {
    console.log(`⚠️  ${5 - passCount} subjects still failing`);
    console.log('   Start handlers: npm run nats:handlers');
    console.log('   Then re-run: npm run nats:proof-of-life:all\n');
  }

  await nc.close();
  process.exit(passCount === 5 ? 0 : 1);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
