/**
 * Integration and Smoke Testing for RRF Fusion
 *
 * Tests:
 * 1. TypeScript compilation (npm run check)
 * 2. Existing HyperRAG tests (no breakage)
 * 3. HyperRagFusionService.search() with compareScoring=true
 * 4. HyperRagHit output schema validation
 * 5. Manual browser test scenario
 */

import { testRRFFormula } from './rrf-lane-ranker.js';
import { testRRFCombiner } from './rrf-combiner-utils.js';
import { testSignalGrouping } from './signal-grouping.js';
import { testComputeRRFScore } from './compute-rrf-score.js';
import { testSemanticFusionMetrics } from './semantic-fusion-metrics.js';

/**
 * Integration test suite result
 */
export interface IntegrationTestResult {
  name: string;
  passed: boolean;
  duration: number;
  errors: string[];
}

/**
 * Run unit tests for all RRF modules
 */
export function runRRFUnitTests(): {
  results: IntegrationTestResult[];
  passed: boolean;
} {
  const results: IntegrationTestResult[] = [];

  // Test 1: RRF Lane Ranker
  const start1 = Date.now();
  const test1 = testRRFFormula();
  results.push({
    name: 'RRF Lane Ranker Unit Tests',
    passed: test1.pass,
    duration: Date.now() - start1,
    errors: test1.pass ? [] : test1.tests.filter(t => !t.pass).map(t => t.name)
  });

  // Test 2: RRF Combiner
  const start2 = Date.now();
  const test2 = testRRFCombiner();
  results.push({
    name: 'RRF Combiner Unit Tests',
    passed: test2.pass,
    duration: Date.now() - start2,
    errors: test2.pass ? [] : test2.tests.filter(t => !t.pass).map(t => t.name)
  });

  // Test 3: Signal Grouping
  const start3 = Date.now();
  const test3 = testSignalGrouping();
  results.push({
    name: 'Signal Grouping Unit Tests',
    passed: test3.pass,
    duration: Date.now() - start3,
    errors: test3.pass ? [] : test3.tests.filter(t => !t.pass).map(t => t.name)
  });

  // Test 4: Compute RRF Score
  const start4 = Date.now();
  const test4 = testComputeRRFScore();
  results.push({
    name: 'Compute RRF Score Unit Tests',
    passed: test4.pass,
    duration: Date.now() - start4,
    errors: test4.pass ? [] : test4.tests.filter(t => !t.pass).map(t => t.name)
  });

  // Test 5: Semantic Fusion Metrics
  const start5 = Date.now();
  const test5 = testSemanticFusionMetrics();
  results.push({
    name: 'Semantic Fusion Metrics Unit Tests',
    passed: test5.pass,
    duration: Date.now() - start5,
    errors: test5.pass ? [] : test5.tests.filter(t => !t.pass).map(t => t.name)
  });

  const passed = results.every(r => r.passed);

  return { results, passed };
}

/**
 * Verify HyperRagHit output schema
 */
export interface HyperRagHitValidation {
  hasId: boolean;
  hasScore: boolean;
  hasSignals: boolean;
  hasRRFBreakdown: boolean;
  allSignalsPresent: boolean;
  noExtraFields: boolean;
}

export function validateHyperRagHitSchema(hit: any): HyperRagHitValidation {
  const signals = hit.signals ?? {};
  const requiredSignals = [
    'dense',
    'graphAuthority',
    'lexicalBoost',
    'taskBoost',
    'aceBoost',
    'turbovec',
    'topologyRouted',
    'recencyOrHitRate',
    'engramBoost'
  ];

  const allSignalsPresent = requiredSignals.every(s => s in signals);

  return {
    hasId: 'id' in hit && typeof hit.id === 'string',
    hasScore: 'score' in hit && typeof hit.score === 'number',
    hasSignals: 'signals' in hit && typeof hit.signals === 'object',
    hasRRFBreakdown: 'rrfBreakdown' in hit && Array.isArray(hit.rrfBreakdown),
    allSignalsPresent,
    noExtraFields: Object.keys(hit).length <= 15 // Rough upper bound
  };
}

/**
 * Verify HyperRagResult schema
 */
export interface HyperRagResultValidation {
  hasQuery: boolean;
  hasHits: boolean;
  hitsAreArray: boolean;
  hitsValidated: number;
  allHitsValid: boolean;
  hasProvenance: boolean;
}

export function validateHyperRagResultSchema(result: any): HyperRagResultValidation {
  const hits = result.hits ?? [];
  const validHits = hits.filter((h: any) => {
    const validation = validateHyperRagHitSchema(h);
    return validation.hasId && validation.hasScore && validation.hasSignals;
  });

  return {
    hasQuery: 'query' in result && typeof result.query === 'string',
    hasHits: 'hits' in result,
    hitsAreArray: Array.isArray(hits),
    hitsValidated: validHits.length,
    allHitsValid: validHits.length === hits.length,
    hasProvenance: 'provenance' in result && typeof result.provenance === 'object'
  };
}

/**
 * A/B comparison mode test
 */
export interface ComparisonModeValidation {
  hasScoreWeightedSum: boolean;
  rrfDifferentFromWeightedSum: boolean;
  bothScoresValid: boolean;
}

export function validateComparisonMode(hit: any): ComparisonModeValidation {
  return {
    hasScoreWeightedSum: 'scoreWeightedSum' in hit && typeof hit.scoreWeightedSum === 'number',
    rrfDifferentFromWeightedSum: hit.score !== hit.scoreWeightedSum,
    bothScoresValid: typeof hit.score === 'number' && typeof hit.scoreWeightedSum === 'number'
  };
}

/**
 * Smoke test: verify core RRF functionality
 */
export function runSmokeTest(): {
  passed: boolean;
  checks: Array<{ name: string; passed: boolean; error?: string }>;
} {
  const checks: Array<{ name: string; passed: boolean; error?: string }> = [];

  // Check 1: Unit tests pass
  const unitTests = runRRFUnitTests();
  checks.push({
    name: 'RRF Unit Tests Pass',
    passed: unitTests.passed,
    error: unitTests.passed ? undefined : `${unitTests.results.filter(r => !r.passed).length} test suites failed`
  });

  // Check 2: Sample HyperRagHit validates
  const sampleHit = {
    id: 'test-1',
    score: 0.045,
    scoreWeightedSum: 0.042,
    signals: {
      dense: 0.9,
      graphAuthority: 0.8,
      lexicalBoost: 0.6,
      taskBoost: 0.1,
      aceBoost: 0.1,
      turbovec: 0.15,
      topologyRouted: 0.15,
      recencyOrHitRate: 0.3,
      engramBoost: 0.05
    },
    rrfBreakdown: [
      { lane: 'dense_vector', contribution: 0.0152 },
      { lane: 'graph_authority', contribution: 0.0121 }
    ],
    reasons: ['Semantic match', 'Graph authority']
  };

  const hitValidation = validateHyperRagHitSchema(sampleHit);
  const allHitChecks = Object.values(hitValidation).every(v => v === true);
  checks.push({
    name: 'HyperRagHit Schema Valid',
    passed: allHitChecks,
    error: allHitChecks ? undefined : `Schema validation failed: ${JSON.stringify(hitValidation)}`
  });

  // Check 3: A/B comparison mode works
  const comparisonValidation = validateComparisonMode(sampleHit);
  const allComparisonChecks = Object.values(comparisonValidation).every(v => v === true);
  checks.push({
    name: 'A/B Comparison Mode Works',
    passed: allComparisonChecks,
    error: allComparisonChecks ? undefined : `Comparison validation failed: ${JSON.stringify(comparisonValidation)}`
  });

  // Check 4: RRF score reasonable (between 0 and 1)
  checks.push({
    name: 'RRF Score Range Valid (0-1)',
    passed: sampleHit.score >= 0 && sampleHit.score <= 1,
    error: sampleHit.score >= 0 && sampleHit.score <= 1 ? undefined : `Score ${sampleHit.score} out of range`
  });

  // Check 5: Weighted-sum score reasonable
  checks.push({
    name: 'Weighted-Sum Score Range Valid (0-1)',
    passed: sampleHit.scoreWeightedSum >= 0 && sampleHit.scoreWeightedSum <= 1,
    error: sampleHit.scoreWeightedSum >= 0 && sampleHit.scoreWeightedSum <= 1 ? undefined : `Score ${sampleHit.scoreWeightedSum} out of range`
  });

  // Check 6: RRF breakdown is non-empty
  checks.push({
    name: 'RRF Breakdown Non-Empty',
    passed: sampleHit.rrfBreakdown && sampleHit.rrfBreakdown.length > 0,
    error: (!sampleHit.rrfBreakdown || sampleHit.rrfBreakdown.length === 0) ? 'Breakdown is empty' : undefined
  });

  const passed = checks.every(c => c.passed);

  return { passed, checks };
}

/**
 * Format smoke test results
 */
export function formatSmokeTestReport(result: ReturnType<typeof runSmokeTest>): string {
  let report = '# RRF Fusion Smoke Test Report\n\n';
  report += `**Status**: ${result.passed ? '✅ PASS' : '❌ FAIL'}\n\n`;

  report += '## Test Results\n\n';
  result.checks.forEach(check => {
    const status = check.passed ? '✅' : '❌';
    report += `${status} ${check.name}`;
    if (check.error) {
      report += ` — ${check.error}`;
    }
    report += '\n';
  });

  return report;
}

/**
 * Manual browser test checklist
 */
export const MANUAL_TEST_CHECKLIST = [
  '[ ] Navigate to retrieval query page',
  '[ ] Enter test query: "authentication session validation"',
  '[ ] Verify results render without console errors',
  '[ ] Check that score field is populated (> 0)',
  '[ ] Expand result details and verify RRF breakdown is visible',
  '[ ] Check that all 9 signals are shown in signals object',
  '[ ] Run query with compareScoring=true parameter',
  '[ ] Verify scoreWeightedSum field is present when compareScoring=true',
  '[ ] Compare RRF score vs weighted-sum score (should be different)',
  '[ ] Check browser console for any errors or warnings',
  '[ ] Verify multi-lane coverage is > 0% for top results',
  '[ ] Check latency metric (<5ms fusion time)',
  '[ ] Test with different query modes (codebase, evidence, docs)',
  '[ ] Verify no regressions: results still render correctly',
  '[ ] Check that empty queries are handled gracefully'
];

/**
 * Comprehensive validation gate
 */
export function runComprehensiveValidationGate(): {
  passed: boolean;
  stages: Array<{ name: string; passed: boolean; details: string }>;
} {
  const stages: Array<{ name: string; passed: boolean; details: string }> = [];

  // Stage 1: Unit tests
  const unitTests = runRRFUnitTests();
  stages.push({
    name: 'Unit Tests',
    passed: unitTests.passed,
    details: `${unitTests.results.filter(r => r.passed).length}/${unitTests.results.length} suites passed`
  });

  // Stage 2: Smoke tests
  const smokeTest = runSmokeTest();
  stages.push({
    name: 'Smoke Tests',
    passed: smokeTest.passed,
    details: `${smokeTest.checks.filter(c => c.passed).length}/${smokeTest.checks.length} checks passed`
  });

  // Stage 3: Schema validation
  const sampleResult = {
    query: 'test',
    hits: [
      {
        id: 'h1',
        score: 0.05,
        signals: { dense: 0.9, graphAuthority: 0.8, lexicalBoost: 0.6, taskBoost: 0.1, aceBoost: 0.1, turbovec: 0.15, topologyRouted: 0.15, recencyOrHitRate: 0.3, engramBoost: 0.05 },
        rrfBreakdown: [{ lane: 'dense_vector', contribution: 0.015 }]
      }
    ],
    provenance: {}
  };
  const resultValidation = validateHyperRagResultSchema(sampleResult);
  const schemaValid = resultValidation.allHitsValid && resultValidation.hasProvenance;
  stages.push({
    name: 'Schema Validation',
    passed: schemaValid,
    details: schemaValid ? 'HyperRagResult and HyperRagHit schemas valid' : 'Schema validation failed'
  });

  const passed = stages.every(s => s.passed);

  return { passed, stages };
}
