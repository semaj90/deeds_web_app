/**
 * Deterministic Evaluators for Cline vs Code Extension Comparison
 *
 * Evaluates model outputs against fixed test cases + expected behaviors.
 * No fuzziness — each evaluator returns pass/fail + evidence.
 *
 * Architecture:
 * 1. Input validation (schema check)
 * 2. Execution (deterministic logic)
 * 3. Output comparison (against golden set)
 * 4. Evidence collection (why pass/fail)
 * 5. Aggregation (overall score)
 */

import type { ModelIdentifier } from './model-contracts.js';

export interface EvaluationTestCase {
  id: string;
  prompt: string;
  expectedBehavior: 'code_generation' | 'tool_calling' | 'streaming' | 'error_recovery';
  constraints: {
    maxLatencyMs: number;
    requiredToolCalls?: string[];
    bannedPatterns?: string[];
    minTokens?: number;
    maxTokens?: number;
  };
  goldStandard: {
    responseContains: string[];
    responseExcludes?: string[];
    toolCallCount?: number;
    finishReason: 'stop' | 'tool_calls' | 'length';
  };
}

export interface EvaluationResult {
  testCaseId: string;
  model: ModelIdentifier;
  passed: boolean;
  latencyMs: number;
  evidence: {
    inputValid: boolean;
    outputValid: boolean;
    constraintsMetAll: string[];
    constraintsFailed: string[];
    goldStandardMatches: string[];
    goldStandardMismatches: string[];
  };
  rawResponse?: string;
  errorMessage?: string;
}

export interface AggregatedEvaluation {
  model: ModelIdentifier;
  totalTests: number;
  passCount: number;
  failCount: number;
  successRate: number;
  avgLatencyMs: number;
  criticalFailures: string[];
  warnings: string[];
}

/**
 * Core evaluator: input validation
 */
export function validateTestInput(testCase: EvaluationTestCase): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!testCase.id?.trim()) errors.push('Missing testCaseId');
  if (!testCase.prompt?.trim()) errors.push('Missing prompt');
  if (!testCase.expectedBehavior) errors.push('Missing expectedBehavior');
  if (!testCase.constraints?.maxLatencyMs || testCase.constraints.maxLatencyMs <= 0) {
    errors.push('Invalid maxLatencyMs');
  }
  if (!testCase.goldStandard?.responseContains?.length) {
    errors.push('Missing gold standard responseContains');
  }

  return { valid: errors.length === 0, errors };
}

/**
 * Core evaluator: latency check
 */
export function evaluateLatency(actualMs: number, maxMs: number): { passed: boolean; reason: string } {
  if (actualMs <= maxMs) {
    return { passed: true, reason: `${actualMs}ms <= ${maxMs}ms` };
  }
  return { passed: false, reason: `${actualMs}ms > ${maxMs}ms (exceeded by ${actualMs - maxMs}ms)` };
}

/**
 * Core evaluator: output content validation
 */
export function evaluateOutputContent(
  response: string,
  goldStandard: EvaluationTestCase['goldStandard']
): { passed: boolean; matches: string[]; mismatches: string[] } {
  const matches: string[] = [];
  const mismatches: string[] = [];

  // Check required content
  for (const required of goldStandard.responseContains) {
    if (response.includes(required)) {
      matches.push(`Contains "${required.substring(0, 50)}..."`);
    } else {
      mismatches.push(`Missing "${required.substring(0, 50)}..."`);
    }
  }

  // Check banned content
  if (goldStandard.responseExcludes) {
    for (const banned of goldStandard.responseExcludes) {
      if (!response.includes(banned)) {
        matches.push(`Correctly excludes "${banned.substring(0, 50)}..."`);
      } else {
        mismatches.push(`Contains banned pattern "${banned.substring(0, 50)}..."`);
      }
    }
  }

  return { passed: mismatches.length === 0, matches, mismatches };
}

/**
 * Core evaluator: constraint validation
 */
export function evaluateConstraints(
  response: string,
  constraints: EvaluationTestCase['constraints']
): { passed: boolean; satisfied: string[]; violated: string[] } {
  const satisfied: string[] = [];
  const violated: string[] = [];

  // Token count check
  const estimatedTokens = response.split(/\s+/).length;
  if (constraints.minTokens !== undefined) {
    if (estimatedTokens >= constraints.minTokens) {
      satisfied.push(`Token count ${estimatedTokens} >= ${constraints.minTokens}`);
    } else {
      violated.push(`Token count ${estimatedTokens} < ${constraints.minTokens}`);
    }
  }

  if (constraints.maxTokens !== undefined) {
    if (estimatedTokens <= constraints.maxTokens) {
      satisfied.push(`Token count ${estimatedTokens} <= ${constraints.maxTokens}`);
    } else {
      violated.push(`Token count ${estimatedTokens} > ${constraints.maxTokens}`);
    }
  }

  // Banned patterns check
  if (constraints.bannedPatterns) {
    for (const pattern of constraints.bannedPatterns) {
      const regex = new RegExp(pattern, 'i');
      if (!regex.test(response)) {
        satisfied.push(`Does not match banned pattern: ${pattern}`);
      } else {
        violated.push(`Contains banned pattern: ${pattern}`);
      }
    }
  }

  // Tool call requirements
  if (constraints.requiredToolCalls) {
    for (const tool of constraints.requiredToolCalls) {
      if (response.includes(`<tool_call>`) && response.includes(tool)) {
        satisfied.push(`Contains required tool call: ${tool}`);
      } else {
        violated.push(`Missing required tool call: ${tool}`);
      }
    }
  }

  return { passed: violated.length === 0, satisfied, violated };
}

/**
 * Composite evaluator: single test case
 */
export async function evaluateTestCase(
  testCase: EvaluationTestCase,
  model: ModelIdentifier,
  fetchResponse: () => Promise<{ response: string; latencyMs: number }>
): Promise<EvaluationResult> {
  const result: EvaluationResult = {
    testCaseId: testCase.id,
    model,
    passed: false,
    latencyMs: 0,
    evidence: {
      inputValid: false,
      outputValid: false,
      constraintsMetAll: [],
      constraintsFailed: [],
      goldStandardMatches: [],
      goldStandardMismatches: [],
    },
  };

  // Step 1: Validate input
  const inputValidation = validateTestInput(testCase);
  result.evidence.inputValid = inputValidation.valid;

  if (!inputValidation.valid) {
    result.errorMessage = `Input validation failed: ${inputValidation.errors.join('; ')}`;
    return result;
  }

  // Step 2: Execute and measure latency
  try {
    const { response, latencyMs } = await fetchResponse();
    result.rawResponse = response;
    result.latencyMs = latencyMs;

    // Step 3: Validate output structure
    result.evidence.outputValid = response?.length > 0;

    if (!result.evidence.outputValid) {
      result.errorMessage = 'Empty response from model';
      return result;
    }

    // Step 4: Evaluate latency
    const latencyCheck = evaluateLatency(latencyMs, testCase.constraints.maxLatencyMs);
    if (!latencyCheck.passed) {
      result.evidence.constraintsFailed.push(latencyCheck.reason);
    } else {
      result.evidence.constraintsMetAll.push(latencyCheck.reason);
    }

    // Step 5: Evaluate content against gold standard
    const contentCheck = evaluateOutputContent(response, testCase.goldStandard);
    result.evidence.goldStandardMatches = contentCheck.matches;
    result.evidence.goldStandardMismatches = contentCheck.mismatches;

    // Step 6: Evaluate constraints
    const constraintCheck = evaluateConstraints(response, testCase.constraints);
    result.evidence.constraintsMetAll.push(...constraintCheck.satisfied);
    result.evidence.constraintsFailed.push(...constraintCheck.violated);

    // Step 7: Determine overall pass/fail
    result.passed =
      result.evidence.inputValid &&
      result.evidence.outputValid &&
      contentCheck.passed &&
      constraintCheck.passed;

  } catch (err) {
    result.errorMessage = err instanceof Error ? err.message : String(err);
  }

  return result;
}

/**
 * Aggregate multiple evaluation results
 */
export function aggregateResults(results: EvaluationResult[]): AggregatedEvaluation {
  const passed = results.filter(r => r.passed).length;
  const failed = results.length - passed;
  const avgLatency = results.reduce((sum, r) => sum + r.latencyMs, 0) / results.length;

  const criticalFailures = results
    .filter(r => !r.passed && r.evidence.goldStandardMismatches.length > 0)
    .map(r => `${r.testCaseId}: ${r.evidence.goldStandardMismatches.join('; ')}`);

  const warnings = results
    .filter(r => r.latencyMs > 5000)
    .map(r => `${r.testCaseId}: High latency ${r.latencyMs}ms`);

  return {
    model: results[0]?.model || 'unknown',
    totalTests: results.length,
    passCount: passed,
    failCount: failed,
    successRate: results.length > 0 ? passed / results.length : 0,
    avgLatencyMs: avgLatency,
    criticalFailures,
    warnings,
  };
}

/**
 * Format evaluation report for display
 */
export function formatEvaluationReport(evaluation: AggregatedEvaluation): string {
  return `
═══════════════════════════════════════════════════════════════════
  Evaluation Report: ${evaluation.model}
═══════════════════════════════════════════════════════════════════

📊 SUMMARY
  Tests Passed:    ${evaluation.passCount}/${evaluation.totalTests}
  Success Rate:    ${(evaluation.successRate * 100).toFixed(1)}%
  Avg Latency:     ${evaluation.avgLatencyMs.toFixed(0)}ms

${evaluation.criticalFailures.length > 0 ? `
🚨 CRITICAL FAILURES (${evaluation.criticalFailures.length})
${evaluation.criticalFailures.map(f => `  ❌ ${f}`).join('\n')}
` : '  ✅ No critical failures'}

${evaluation.warnings.length > 0 ? `
⚠️  WARNINGS (${evaluation.warnings.length})
${evaluation.warnings.map(w => `  ⚠️  ${w}`).join('\n')}
` : ''}

═══════════════════════════════════════════════════════════════════
`;
}
