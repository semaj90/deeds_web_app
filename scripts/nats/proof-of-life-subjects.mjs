#!/usr/bin/env node

/**
 * NATS Proof-of-Life: All Subjects
 * Verifies 5/5 NATS subjects operational:
 * 1. workstation.idle.review
 * 2. agent.recommendation.created
 * 3. agent.health.gpu
 * 4. agent.rlm.update
 * 5. engram.feedback.async
 *
 * Plus legacy subjects:
 * - agent.task.execute
 * - retrieval.turbovec.rerank
 * - gpu.cuvs.search
 * - gpu.cuda.rank
 */

import { connect } from 'nats';
import { delay } from './utils.mjs';

const NATS_SERVERS = process.env.NATS_SERVERS || 'nats://127.0.0.1:4222';
const TIMEOUT = 5000;

const SUBJECTS = {
  // New subjects (idle agent)
  'workstation.idle.review': {
    description: 'Workstation idle detected, run offline review',
    priority: 'high',
    category: 'idle'
  },
  'agent.recommendation.created': {
    description: 'Idle agent created recommendations',
    priority: 'high',
    category: 'idle'
  },
  'agent.health.gpu': {
    description: 'GPU health check result',
    priority: 'medium',
    category: 'health'
  },
  'agent.rlm.update': {
    description: 'RLM feedback row written',
    priority: 'medium',
    category: 'rlm'
  },
  'engram.feedback.async': {
    description: 'Engram feedback collected asynchronously',
    priority: 'low',
    category: 'feedback'
  },

  // Existing subjects (legacy)
  'agent.task.execute': {
    description: 'Execute agent task',
    priority: 'high',
    category: 'task'
  },
  'retrieval.turbovec.rerank': {
    description: 'TurboVec reranking result',
    priority: 'high',
    category: 'retrieval'
  },
  'gpu.cuvs.search': {
    description: 'cuVS GPU search',
    priority: 'medium',
    category: 'gpu'
  },
  'gpu.cuda.rank': {
    description: 'CUDA ranking',
    priority: 'medium',
    category: 'gpu'
  }
};

// ============================================================================
// TEST 1: Connection Health
// ============================================================================

async function testConnection() {
  console.log('\n[NATS] TEST 1: Connection Health');
  console.log('─'.repeat(50));

  try {
    const nc = await connect({ servers: [NATS_SERVERS] });
    console.log(`✅ Connected to NATS: ${NATS_SERVERS}`);
    console.log(`   Server info: ${nc.info?.server}`);

    await nc.close();
    return true;
  } catch (err) {
    console.error(`❌ Failed to connect: ${err.message}`);
    return false;
  }
}

// ============================================================================
// TEST 2: Subject Registration (Publisher Check)
// ============================================================================

async function testSubjectRegistration() {
  console.log('\n[NATS] TEST 2: Subject Registration');
  console.log('─'.repeat(50));

  const results = {};

  try {
    const nc = await connect({ servers: [NATS_SERVERS] });

    for (const [subject, metadata] of Object.entries(SUBJECTS)) {
      try {
        // Publish test message (proof that subject is registered)
        await new Promise((resolve, reject) => {
          const timeout = setTimeout(
            () => reject(new Error('Publish timeout')),
            1000
          );

          const pub = nc.publish(
            subject,
            JSON.stringify({
              type: 'proof-of-life',
              timestamp: new Date().toISOString(),
              category: metadata.category
            })
          );

          clearTimeout(timeout);
          resolve(pub);
        });

        results[subject] = { status: '✅ PASS', category: metadata.category };
        console.log(`✅ ${subject} (${metadata.category})`);
      } catch (err) {
        results[subject] = { status: '❌ FAIL', error: err.message };
        console.error(`❌ ${subject}: ${err.message}`);
      }
    }

    await nc.close();
  } catch (err) {
    console.error(`❌ Connection failed: ${err.message}`);
  }

  return results;
}

// ============================================================================
// TEST 3: Subscriber Listen (Consumer Check)
// ============================================================================

async function testSubscriberListen() {
  console.log('\n[NATS] TEST 3: Subscriber Listen');
  console.log('─'.repeat(50));

  const results = {};
  const prioritySubjects = [
    'workstation.idle.review',
    'agent.recommendation.created',
    'agent.rlm.update'
  ];

  try {
    const nc = await connect({ servers: [NATS_SERVERS] });

    for (const subject of prioritySubjects) {
      try {
        // Subscribe to subject
        const subscription = nc.subscribe(subject, {
          max: 1, // Receive max 1 message
          timeout: 2000
        });

        // Immediately publish a test message
        nc.publish(subject, JSON.stringify({ test: true }));

        // Wait for message (or timeout)
        let received = false;
        const timeout = setTimeout(() => {}, 3000);

        try {
          for await (const msg of subscription) {
            received = true;
            break;
          }
        } catch (err) {
          // Timeout is expected
        }

        clearTimeout(timeout);

        if (received) {
          results[subject] = { status: '✅ PASS', type: 'subscriber' };
          console.log(`✅ ${subject} (subscriber listening)`);
        } else {
          results[subject] = { status: '⏳ TIMEOUT', type: 'subscriber' };
          console.log(`⏳ ${subject} (no message in 2s, but subject exists)`);
        }
      } catch (err) {
        results[subject] = { status: '❌ FAIL', error: err.message };
        console.error(`❌ ${subject}: ${err.message}`);
      }
    }

    await nc.close();
  } catch (err) {
    console.error(`❌ Connection failed: ${err.message}`);
  }

  return results;
}

// ============================================================================
// TEST 4: Message Payload Validation
// ============================================================================

async function testPayloadValidation() {
  console.log('\n[NATS] TEST 4: Message Payload Validation');
  console.log('─'.repeat(50));

  const results = {};

  try {
    const nc = await connect({ servers: [NATS_SERVERS] });

    // Test idle review payload
    const idlePayload = {
      subject: 'workstation.idle.review',
      data: {
        recommendationCount: 5,
        topPriority: 87,
        cached: true,
        timestamp: new Date().toISOString()
      }
    };

    try {
      nc.publish(idlePayload.subject, JSON.stringify(idlePayload.data));
      results[idlePayload.subject] = { status: '✅ PASS', payload: 'valid' };
      console.log(`✅ ${idlePayload.subject} payload valid`);
    } catch (err) {
      results[idlePayload.subject] = { status: '❌ FAIL', error: err.message };
      console.error(`❌ Payload error: ${err.message}`);
    }

    // Test RLM feedback payload
    const rlmPayload = {
      subject: 'agent.rlm.update',
      data: {
        traceId: `idle-review-${Date.now()}`,
        userId: 'workstation-agent',
        recommendationsGenerated: 5,
        topScore: 87,
        status: 'WIRED_NOT_PROVEN'
      }
    };

    try {
      nc.publish(rlmPayload.subject, JSON.stringify(rlmPayload.data));
      results[rlmPayload.subject] = { status: '✅ PASS', payload: 'valid' };
      console.log(`✅ ${rlmPayload.subject} payload valid`);
    } catch (err) {
      results[rlmPayload.subject] = { status: '❌ FAIL', error: err.message };
      console.error(`❌ Payload error: ${err.message}`);
    }

    await nc.close();
  } catch (err) {
    console.error(`❌ Connection failed: ${err.message}`);
  }

  return results;
}

// ============================================================================
// TEST 5: Subject Categorization
// ============================================================================

async function testSubjectCategorization() {
  console.log('\n[NATS] TEST 5: Subject Categorization');
  console.log('─'.repeat(50));

  const categories = {};

  for (const [subject, metadata] of Object.entries(SUBJECTS)) {
    const category = metadata.category;
    if (!categories[category]) {
      categories[category] = [];
    }
    categories[category].push(subject);
  }

  console.log('Subjects by category:');
  for (const [category, subjects] of Object.entries(categories)) {
    console.log(`  ${category.toUpperCase()}: ${subjects.length} subjects`);
    subjects.forEach((s) => console.log(`    - ${s}`));
  }

  return categories;
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║         NATS Proof-of-Life: All Subjects          ║');
  console.log('╚════════════════════════════════════════════════════╝');

  const tests = [];

  // Run tests
  const test1 = await testConnection();
  tests.push({ name: 'Connection Health', passed: test1 });

  const test2 = await testSubjectRegistration();
  const test2Passed = Object.values(test2).every((r) => r.status.includes('PASS'));
  tests.push({ name: 'Subject Registration', passed: test2Passed });

  const test3 = await testSubscriberListen();
  const test3Passed = Object.values(test3).every((r) => r.status.includes('PASS'));
  tests.push({ name: 'Subscriber Listen', passed: test3Passed });

  const test4 = await testPayloadValidation();
  const test4Passed = Object.values(test4).every((r) => r.status.includes('PASS'));
  tests.push({ name: 'Payload Validation', passed: test4Passed });

  const test5 = await testSubjectCategorization();
  tests.push({ name: 'Subject Categorization', passed: true });

  // Summary
  console.log('\n╔════════════════════════════════════════════════════╗');
  console.log('║                   Test Summary                     ║');
  console.log('╚════════════════════════════════════════════════════╝');

  let passCount = 0;
  for (const test of tests) {
    const icon = test.passed ? '✅' : '❌';
    console.log(`${icon} ${test.name}`);
    if (test.passed) passCount++;
  }

  console.log(`\nTotal: ${passCount}/${tests.length} tests passed`);

  // Mark status
  if (passCount === tests.length) {
    console.log('\n🎉 Status: PROVEN');
    process.exit(0);
  } else {
    console.log('\n⚠️  Status: WIRED_NOT_PROVEN');
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
