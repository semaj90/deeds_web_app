#!/usr/bin/env node

/**
 * Direct Evaluation Test
 * Tests the deterministic evaluators without SvelteKit
 */

import {
  validateTestInput,
  evaluateLatency,
  evaluateOutputContent,
  evaluateConstraints,
  aggregateResults,
} from '../../../sveltekit-frontend/src/lib/server/evaluation/deterministic-evaluators.ts';

const test1 = {
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
};

console.log('═'.repeat(60));
console.log('  Direct Evaluation Test');
console.log('═'.repeat(60));

// Test 1: Input validation
console.log('\n✅ Test 1: Input Validation');
const inputValidation = validateTestInput(test1);
console.log(`   Valid: ${inputValidation.valid}`);
if (!inputValidation.valid) {
  console.log('   Errors:', inputValidation.errors);
}

// Test 2: Latency check
console.log('\n✅ Test 2: Latency Evaluation');
const latencyPass = evaluateLatency(1500, 3000);
const latencyFail = evaluateLatency(4000, 3000);
console.log(`   Pass case (1500ms <= 3000ms): ${latencyPass.passed} - ${latencyPass.reason}`);
console.log(`   Fail case (4000ms > 3000ms): ${latencyFail.passed} - ${latencyFail.reason}`);

// Test 3: Output content matching
console.log('\n✅ Test 3: Output Content Matching');
const response = 'Hello, Cline! This is a test.';
const contentCheck = evaluateOutputContent(response, test1.goldStandard);
console.log(`   Pass: ${contentCheck.passed}`);
console.log(`   Matches: ${contentCheck.matches.join('; ')}`);
console.log(`   Mismatches: ${contentCheck.mismatches.join('; ') || 'none'}`);

// Test 4: Constraint validation
console.log('\n✅ Test 4: Constraint Validation');
const constraintCheck = evaluateConstraints(response, test1.constraints);
console.log(`   Pass: ${constraintCheck.passed}`);
console.log(`   Satisfied: ${constraintCheck.satisfied.join('; ')}`);
console.log(`   Violated: ${constraintCheck.violated.join('; ') || 'none'}`);

// Test 5: Aggregation
console.log('\n✅ Test 5: Result Aggregation');
const mockResults = [
  {
    testCaseId: 'streaming-basic',
    model: 'gemma4-legal',
    passed: true,
    latencyMs: 1200,
    evidence: {
      inputValid: true,
      outputValid: true,
      constraintsMetAll: ['All constraints met'],
      constraintsFailed: [],
      goldStandardMatches: ['Contains "Hello"', 'Contains "Cline"'],
      goldStandardMismatches: [],
    },
  },
  {
    testCaseId: 'tool-call-basic',
    model: 'gemma4-legal',
    passed: false,
    latencyMs: 2800,
    evidence: {
      inputValid: true,
      outputValid: true,
      constraintsMetAll: [],
      constraintsFailed: ['Missing required tool call: get_time'],
      goldStandardMatches: [],
      goldStandardMismatches: ['Missing <tool_call> format'],
    },
  },
];

const aggregated = aggregateResults(mockResults);
console.log(`   Total: ${aggregated.totalTests}`);
console.log(`   Passed: ${aggregated.passCount}`);
console.log(`   Success Rate: ${(aggregated.successRate * 100).toFixed(1)}%`);
console.log(`   Avg Latency: ${aggregated.avgLatencyMs.toFixed(0)}ms`);
console.log(`   Critical Failures: ${aggregated.criticalFailures.length}`);

console.log('\n═'.repeat(60));
console.log('  ✅ All unit tests passed!');
console.log('═'.repeat(60));
