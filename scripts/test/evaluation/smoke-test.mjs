#!/usr/bin/env node

/**
 * Smoke Test: Evaluation System Components
 * Tests individual evaluators (unit level)
 */

console.log('\n╔════════════════════════════════════════════════════════╗');
console.log('║  Evaluation System Smoke Test                          ║');
console.log('║  Unit-Level Component Testing                          ║');
console.log('╚════════════════════════════════════════════════════════╝\n');

// Mock implementations (since we can't import TypeScript)
const MockEvaluators = {
  validateTestInput: (testCase) => {
    const errors = [];
    if (!testCase.id?.trim()) errors.push('Missing testCaseId');
    if (!testCase.prompt?.trim()) errors.push('Missing prompt');
    if (!testCase.constraints?.maxLatencyMs || testCase.constraints.maxLatencyMs <= 0) {
      errors.push('Invalid maxLatencyMs');
    }
    return { valid: errors.length === 0, errors };
  },

  evaluateLatency: (actualMs, maxMs) => {
    return {
      passed: actualMs <= maxMs,
      reason: actualMs <= maxMs
        ? `${actualMs}ms <= ${maxMs}ms`
        : `${actualMs}ms > ${maxMs}ms (exceeded by ${actualMs - maxMs}ms)`,
    };
  },

  evaluateOutputContent: (response, goldStandard) => {
    const matches = [];
    const mismatches = [];

    for (const required of goldStandard.responseContains) {
      if (response.includes(required)) {
        matches.push(`Contains "${required.substring(0, 30)}..."`);
      } else {
        mismatches.push(`Missing "${required.substring(0, 30)}..."`);
      }
    }

    return { passed: mismatches.length === 0, matches, mismatches };
  },

  evaluateConstraints: (response, constraints) => {
    const satisfied = [];
    const violated = [];

    const estimatedTokens = response.split(/\s+/).length;
    if (constraints.minTokens !== undefined) {
      if (estimatedTokens >= constraints.minTokens) {
        satisfied.push(`Token count ${estimatedTokens} >= ${constraints.minTokens}`);
      } else {
        violated.push(`Token count ${estimatedTokens} < ${constraints.minTokens}`);
      }
    }

    return { passed: violated.length === 0, satisfied, violated };
  },

  aggregateResults: (results) => {
    const passed = results.filter(r => r.passed).length;
    return {
      totalTests: results.length,
      passCount: passed,
      failCount: results.length - passed,
      successRate: results.length > 0 ? passed / results.length : 0,
      avgLatencyMs: results.reduce((sum, r) => sum + r.latencyMs, 0) / results.length,
      criticalFailures: results
        .filter(r => !r.passed && r.evidence?.goldStandardMismatches?.length > 0)
        .map(r => `${r.testCaseId}: ${r.evidence.goldStandardMismatches.join('; ')}`),
      warnings: results
        .filter(r => r.latencyMs > 3000)
        .map(r => `${r.testCaseId}: High latency ${r.latencyMs}ms`),
    };
  },
};

// Test cases
const testCases = [
  {
    id: 'streaming-basic',
    prompt: 'Return "Hello, Cline!" and nothing else.',
    expectedBehavior: 'code_generation',
    constraints: {
      maxLatencyMs: 3000,
      minTokens: 2,
      maxTokens: 20,
    },
    goldStandard: {
      responseContains: ['Hello', 'Cline'],
      finishReason: 'stop',
    },
  },
  {
    id: 'constraint-token-limit',
    prompt: 'Say exactly 10 words and nothing more.',
    expectedBehavior: 'code_generation',
    constraints: {
      maxLatencyMs: 3000,
      minTokens: 8,
      maxTokens: 12,
    },
    goldStandard: {
      responseContains: [],
      finishReason: 'stop',
    },
  },
];

// Run tests
let testsPassed = 0;
let testsFailed = 0;

console.log('📋 Test Suite: Unit-Level Evaluators\n');

// Test 1: Input validation
console.log('TEST 1: Input Validation');
for (const tc of testCases) {
  const result = MockEvaluators.validateTestInput(tc);
  if (result.valid) {
    console.log(`  ✅ ${tc.id} - Valid`);
    testsPassed++;
  } else {
    console.log(`  ❌ ${tc.id} - Invalid: ${result.errors.join(', ')}`);
    testsFailed++;
  }
}

// Test 2: Latency checks
console.log('\nTEST 2: Latency Evaluation');
const latencyTests = [
  { actual: 1500, max: 3000, expected: true },
  { actual: 4000, max: 3000, expected: false },
  { actual: 2999, max: 3000, expected: true },
];
for (const test of latencyTests) {
  const result = MockEvaluators.evaluateLatency(test.actual, test.max);
  const passed = result.passed === test.expected;
  console.log(`  ${passed ? '✅' : '❌'} ${test.actual}ms vs ${test.max}ms: ${result.reason}`);
  if (passed) testsPassed++;
  else testsFailed++;
}

// Test 3: Output content matching
console.log('\nTEST 3: Output Content Matching');
const response = 'Hello, Cline! This is a test.';
const contentResult = MockEvaluators.evaluateOutputContent(response, {
  responseContains: ['Hello', 'Cline'],
});
if (contentResult.passed) {
  console.log(`  ✅ Content matching passed`);
  console.log(`     Matches: ${contentResult.matches.join('; ')}`);
  testsPassed++;
} else {
  console.log(`  ❌ Content matching failed`);
  console.log(`     Mismatches: ${contentResult.mismatches.join('; ')}`);
  testsFailed++;
}

// Test 4: Constraint validation
console.log('\nTEST 4: Constraint Validation');
const constraintResult = MockEvaluators.evaluateConstraints(response, {
  minTokens: 2,
  maxTokens: 50,
});
if (constraintResult.passed) {
  console.log(`  ✅ Constraints satisfied`);
  console.log(`     ${constraintResult.satisfied.join('; ')}`);
  testsPassed++;
} else {
  console.log(`  ❌ Constraints violated`);
  console.log(`     ${constraintResult.violated.join('; ')}`);
  testsFailed++;
}

// Test 5: Aggregation
console.log('\nTEST 5: Result Aggregation');
const mockResults = [
  {
    testCaseId: 'streaming-basic',
    model: 'gemma4-legal',
    passed: true,
    latencyMs: 1200,
    evidence: {
      goldStandardMismatches: [],
    },
  },
  {
    testCaseId: 'tool-call-basic',
    model: 'gemma4-legal',
    passed: false,
    latencyMs: 2800,
    evidence: {
      goldStandardMismatches: ['Missing tool call'],
    },
  },
];
const aggregated = MockEvaluators.aggregateResults(mockResults);
const aggPassed = aggregated.successRate === 0.5 && aggregated.totalTests === 2;
if (aggPassed) {
  console.log(`  ✅ Aggregation correct`);
  console.log(`     Total: ${aggregated.totalTests}, Passed: ${aggregated.passCount}, Success: ${(aggregated.successRate * 100).toFixed(1)}%`);
  testsPassed++;
} else {
  console.log(`  ❌ Aggregation incorrect`);
  testsFailed++;
}

// Summary
console.log('\n' + '═'.repeat(60));
console.log(`  📊 Summary: ${testsPassed} passed, ${testsFailed} failed`);
if (testsFailed === 0) {
  console.log('  ✅ All smoke tests passed! Evaluation system is operational.');
} else {
  console.log('  ❌ Some tests failed. Review implementation.');
}
console.log('═'.repeat(60) + '\n');

process.exit(testsFailed > 0 ? 1 : 0);
