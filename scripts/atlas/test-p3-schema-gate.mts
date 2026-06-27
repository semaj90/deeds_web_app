/**
 * Test P3 Schema Enforcement Gate
 * Verify that placeholder terms are blocked before Gemma4 write
 */

import { validateAceSchema } from '../../sveltekit-frontend/src/lib/server/ai/ace-schema-validator.js';

interface TestCase {
  name: string;
  input: { text: string; packet?: { source_ref?: string; feature_id?: string; packet_key?: string } };
  expectedValid: boolean;
  description: string;
}

const testCases: TestCase[] = [
  {
    name: 'valid_packet_write',
    input: {
      text: 'INSERT INTO nes_chrom_packets (source_ref, feature_id, packet_key) VALUES ($1, $2, $3)',
      packet: {
        source_ref: 'src/lib/server/auth.ts',
        feature_id: 'auth.sessions',
        packet_key: 'ace:packet:auth:001'
      }
    },
    expectedValid: true,
    description: 'Valid packet write with complete identity'
  },

  {
    name: 'blocked_unknown_table',
    input: {
      text: 'INSERT INTO unknown_table (col) VALUES ($1)',
      packet: {
        source_ref: 'src/auth.ts',
        feature_id: 'auth',
        packet_key: 'key:1'
      }
    },
    expectedValid: false,
    description: 'Placeholder term: unknown_table'
  },

  {
    name: 'blocked_todo_schema',
    input: {
      text: 'UPDATE TODO_SCHEMA SET col = $1',
      packet: {
        source_ref: 'src/auth.ts',
        feature_id: 'auth',
        packet_key: 'key:1'
      }
    },
    expectedValid: false,
    description: 'Placeholder term: TODO_SCHEMA'
  },

  {
    name: 'blocked_fake_function',
    input: {
      text: 'SELECT fake_auth_check() FROM nes_chrom_packets',
      packet: {
        source_ref: 'src/auth.ts',
        feature_id: 'auth',
        packet_key: 'key:1'
      }
    },
    expectedValid: false,
    description: 'Placeholder pattern: fake_'
  },

  {
    name: 'blocked_question_marks',
    input: {
      text: 'SELECT ?? FROM users WHERE id = ?',
      packet: {
        source_ref: 'src/auth.ts',
        feature_id: 'auth',
        packet_key: 'key:1'
      }
    },
    expectedValid: false,
    description: 'Placeholder pattern: ??'
  },

  {
    name: 'missing_source_ref',
    input: {
      text: 'INSERT INTO nes_chrom_packets (feature_id, packet_key) VALUES ($1, $2)',
      packet: {
        source_ref: '',
        feature_id: 'auth',
        packet_key: 'key:1'
      }
    },
    expectedValid: false,
    description: 'Missing identity: source_ref'
  },

  {
    name: 'missing_feature_id',
    input: {
      text: 'INSERT INTO nes_chrom_packets (source_ref, packet_key) VALUES ($1, $2)',
      packet: {
        source_ref: 'src/auth.ts',
        feature_id: null,
        packet_key: 'key:1'
      }
    },
    expectedValid: false,
    description: 'Missing identity: feature_id'
  },

  {
    name: 'unsafe_redis_only',
    input: {
      text: 'redis.set(key, value) // skip postgres',
      packet: {
        source_ref: 'src/auth.ts',
        feature_id: 'auth',
        packet_key: 'key:1'
      }
    },
    expectedValid: false,
    description: 'Unsafe pattern: Redis write without Postgres'
  }
];

async function runTests() {
  console.log('╔════════════════════════════════════════════════════════╗');
  console.log('║ P3 Schema Enforcement Gate — Test Suite               ║');
  console.log('╚════════════════════════════════════════════════════════╝\n');

  let passed = 0;
  let failed = 0;
  const results = [];

  for (const testCase of testCases) {
    const result = validateAceSchema(testCase.input);
    const testPassed = result.valid === testCase.expectedValid;

    if (testPassed) {
      passed++;
      console.log(`✅ ${testCase.name}`);
    } else {
      failed++;
      console.log(`❌ ${testCase.name}`);
      console.log(`   Expected valid=${testCase.expectedValid}, got valid=${result.valid}`);
      if (result.blockedTerms.length > 0) console.log(`   Blocked: ${result.blockedTerms.join(', ')}`);
      if (result.missingIdentity.length > 0) console.log(`   Missing: ${result.missingIdentity.join(', ')}`);
      if (result.schemaViolations.length > 0) console.log(`   SchemaViolations: ${result.schemaViolations.join(', ')}`);
      if (result.unsafeOperations.length > 0) console.log(`   Unsafe: ${result.unsafeOperations.join(', ')}`);
    }

    results.push({
      name: testCase.name,
      description: testCase.description,
      expectedValid: testCase.expectedValid,
      actualValid: result.valid,
      passed: testPassed,
      blockedTerms: result.blockedTerms,
      missingIdentity: result.missingIdentity,
      schemaViolations: result.schemaViolations,
      unsafeOperations: result.unsafeOperations
    });
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Tests: ${passed} passed, ${failed} failed out of ${testCases.length}`);
  console.log(`${'='.repeat(60)}\n`);

  // Write report
  const report = {
    timestamp: new Date().toISOString(),
    total_tests: testCases.length,
    passed,
    failed,
    pass_rate: ((passed / testCases.length) * 100).toFixed(1) + '%',
    results
  };

  const fs = await import('node:fs/promises');
  await fs.mkdir('.tmp', { recursive: true });
  await fs.writeFile('.tmp/p3-schema-gate-test-results.json', JSON.stringify(report, null, 2));

  console.log(`✓ Report written: .tmp/p3-schema-gate-test-results.json\n`);

  // Summary
  const gatePass = failed === 0;
  console.log(`╔════════════════════════════════════════════════════════╗`);
  console.log(`║ ${gatePass ? '✅ P3 GATE PASS' : '❌ P3 GATE FAIL'} — All placeholder terms blocked   ${gatePass ? '     ' : ''}║`);
  console.log(`╚════════════════════════════════════════════════════════╝\n`);

  process.exit(gatePass ? 0 : 1);
}

runTests().catch(console.error);
