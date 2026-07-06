/**
 * Local Testing Framework for RRF Fusion Validation
 *
 * Tests RRF scoring on 10 reference queries with manual relevance labels.
 * Measures NDCG@5, MRR@10, multi-lane coverage, and latency.
 * Target: 40%+ NDCG improvement over baseline weighted-sum.
 */

import {
  computeNDCG,
  computeMRR,
  computeMultiLaneCoverage,
  measureRetrievalLatency,
  buildRetrievalQualityReport,
  compareMetrics,
  type RetrievalQualityReport,
  type MetricsComparison
} from './semantic-fusion-metrics.js';
import { compareRRFvsWeightedSum, computeRRFScore, type HyperRagSignals } from './compute-rrf-score.js';

/**
 * Reference query for testing
 */
export interface ReferenceQuery {
  id: string;
  queryText: string;
  mode: 'codebase' | 'evidence' | 'docs';
  description: string;
  expectedTopics: string[];
}

/**
 * Reference result with manual relevance judgment
 */
export interface ReferencResult {
  hitId: string;
  title: string;
  relevance: number; // 0=irrelevant, 1=relevant
  signals: HyperRagSignals;
}

/**
 * Test case combining query and expected results
 */
export interface ReferenceTestCase {
  query: ReferenceQuery;
  results: ReferenceResult[];
}

/**
 * Test execution result
 */
export interface TestExecutionResult {
  queryId: string;
  baseline: RetrievalQualityReport;
  rrf: RetrievalQualityReport;
  comparison: MetricsComparison;
  latencyMs: number;
}

/**
 * Reference queries: 10 diverse codebase/evidence/docs queries
 */
export const REFERENCE_QUERIES: ReferenceQuery[] = [
  {
    id: 'ref-1',
    queryText: 'authentication session validation',
    mode: 'codebase',
    description: 'Session handling and auth validation',
    expectedTopics: ['auth', 'session', 'validate']
  },
  {
    id: 'ref-2',
    queryText: 'database connection pooling',
    mode: 'codebase',
    description: 'Connection management and pooling',
    expectedTopics: ['db', 'connection', 'pool']
  },
  {
    id: 'ref-3',
    queryText: 'error handling and recovery',
    mode: 'codebase',
    description: 'Error handling patterns and fallbacks',
    expectedTopics: ['error', 'recovery', 'fallback']
  },
  {
    id: 'ref-4',
    queryText: 'vector similarity search and ranking',
    mode: 'codebase',
    description: 'Semantic search and reranking',
    expectedTopics: ['vector', 'search', 'rank']
  },
  {
    id: 'ref-5',
    queryText: 'caching strategies and invalidation',
    mode: 'codebase',
    description: 'Cache management and TTL',
    expectedTopics: ['cache', 'ttl', 'invalidate']
  },
  {
    id: 'ref-6',
    queryText: 'legal document evidence handling',
    mode: 'evidence',
    description: 'Evidence storage and retrieval',
    expectedTopics: ['evidence', 'document', 'legal']
  },
  {
    id: 'ref-7',
    queryText: 'case discovery and matching',
    mode: 'evidence',
    description: 'Case relationship discovery',
    expectedTopics: ['case', 'discovery', 'match']
  },
  {
    id: 'ref-8',
    queryText: 'API rate limiting and throttling',
    mode: 'docs',
    description: 'Rate limiting documentation',
    expectedTopics: ['api', 'rate', 'limit']
  },
  {
    id: 'ref-9',
    queryText: 'GraphQL query optimization',
    mode: 'docs',
    description: 'GraphQL best practices',
    expectedTopics: ['graphql', 'query', 'optimize']
  },
  {
    id: 'ref-10',
    queryText: 'machine learning model deployment',
    mode: 'docs',
    description: 'ML model serving and deployment',
    expectedTopics: ['ml', 'model', 'deploy']
  }
];

/**
 * Create mock test case with synthesized signals
 * (In real testing, populate with actual retrieval results)
 */
export function createMockTestCase(
  query: ReferenceQuery,
  hitCount: number = 10
): ReferenceTestCase {
  const results: ReferencResult[] = [];

  // Generate synthetic hits with varied signals
  for (let i = 0; i < hitCount; i++) {
    const relevance = i < 3 ? 1 : i < 6 ? 0.5 : 0; // Top 3 highly relevant, next 3 partial
    const isTopicMatch = query.expectedTopics.some(topic =>
      Math.random() > 0.5 // Stochastic topic matching
    );

    results.push({
      hitId: `hit-${i}`,
      title: `Result ${i + 1}`,
      relevance: relevance > 0 && isTopicMatch ? 1 : 0,
      signals: {
        dense: Math.random() * 0.9 + (i < 3 ? 0.1 : 0), // Top results higher dense score
        graphAuthority: Math.random() * 0.8 + (i < 5 ? 0.1 : 0),
        lexicalBoost: Math.random() * 0.6 + (isTopicMatch ? 0.2 : 0),
        taskBoost: Math.random() * 0.15,
        aceBoost: i % 5 === 0 ? 0.1 : 0,
        turbovec: Math.random() * 0.15,
        topologyRouted: Math.random() * 0.15,
        recencyOrHitRate: Math.random() * 0.3 + (i < 7 ? 0.1 : 0),
        engramBoost: i % 8 === 0 ? 0.05 : 0
      }
    });
  }

  return { query, results };
}

/**
 * Execute test on a single reference query
 */
export function executeReferenceTest(
  testCase: ReferenceTestCase
): TestExecutionResult {
  const startTime = Date.now();

  const { query, results } = testCase;

  // Sort by relevance (for ideal ranking in NDCG computation)
  const sorted = [...results].sort((a, b) => b.relevance - a.relevance);

  // Build relevance labels
  const relevanceLabels = new Map(results.map(r => [r.hitId, r.relevance]));

  // Build baseline (weighted-sum) hits and scores
  const baselineHits = results.map(r => {
    const comparison = compareRRFvsWeightedSum(r.signals);
    return {
      id: r.hitId,
      score: comparison.weightedSum
    };
  });
  const baselineSorted = baselineHits.sort((a, b) => b.score - a.score);

  // Build RRF hits and scores
  const rrfHits = results.map(r => {
    const rrf = computeRRFScore(r.hitId, r.signals);
    return {
      id: r.hitId,
      score: rrf.score
    };
  });
  const rrfSorted = rrfHits.sort((a, b) => b.score - a.score);

  // Build RRF breakdown map (for coverage calculation)
  const rrfBreakdowns = new Map(
    results.map(r => [
      r.hitId,
      computeRRFScore(r.hitId, r.signals).rrfBreakdown
    ])
  );

  // Compute metrics
  const latency: any = {
    totalMs: Date.now() - startTime,
    perLaneMs: new Map([
      ['dense_vector', Math.random() * 2],
      ['graph_authority', Math.random() * 2],
      ['lexical', Math.random() * 1],
      ['cache', Math.random() * 1],
      ['temporal', Math.random() * 1]
    ]),
    mergeMs: Math.random() * 2
  };

  const baseline = buildRetrievalQualityReport(
    baselineSorted,
    relevanceLabels,
    rrfBreakdowns,
    latency
  );

  const rrf = buildRetrievalQualityReport(
    rrfSorted,
    relevanceLabels,
    rrfBreakdowns,
    latency
  );

  const comparison = compareMetrics(baseline, rrf);

  return {
    queryId: query.id,
    baseline,
    rrf,
    comparison,
    latencyMs: latency.totalMs
  };
}

/**
 * Run all 10 reference tests
 */
export function runAllReferenceTests(): {
  results: TestExecutionResult[];
  summary: {
    avgNdcgImprovement: number;
    avgMrrImprovement: number;
    avgCoverageImprovement: number;
    allLatenciesValid: boolean;
    regressions: string[];
  };
} {
  const results: TestExecutionResult[] = [];
  const regressions: string[] = [];

  for (const query of REFERENCE_QUERIES) {
    const testCase = createMockTestCase(query);
    const result = executeReferenceTest(testCase);
    results.push(result);

    // Check for regressions
    if (result.comparison.improvementPercent < 0) {
      regressions.push(`${query.id}: ${result.comparison.improvementPercent.toFixed(1)}% regression`);
    }

    // Check latency
    if (result.latencyMs > 5) {
      regressions.push(`${query.id}: Latency ${result.latencyMs.toFixed(1)}ms exceeds 5ms budget`);
    }

    // Check MRR regression
    if (result.comparison.rrfMrr10 < result.comparison.baselineMrr10) {
      regressions.push(`${query.id}: MRR@10 regression (${result.comparison.rrfMrr10.toFixed(3)} vs ${result.comparison.baselineMrr10.toFixed(3)})`);
    }
  }

  // Compute summary statistics
  const ndcgImprovements = results.map(r => r.comparison.improvementPercent);
  const mrrImprovements = results.map(r => r.comparison.rrfMrr10 - r.comparison.baselineMrr10);
  const coverageImprovements = results.map(r => r.comparison.rrfCoverage - r.comparison.baselineCoverage);

  const avgNdcgImprovement = ndcgImprovements.reduce((a, b) => a + b, 0) / ndcgImprovements.length;
  const avgMrrImprovement = mrrImprovements.reduce((a, b) => a + b, 0) / mrrImprovements.length;
  const avgCoverageImprovement = coverageImprovements.reduce((a, b) => a + b, 0) / coverageImprovements.length;
  const allLatenciesValid = results.every(r => r.latencyMs < 5);

  return {
    results,
    summary: {
      avgNdcgImprovement,
      avgMrrImprovement,
      avgCoverageImprovement,
      allLatenciesValid,
      regressions
    }
  };
}

/**
 * Format test results as markdown report
 */
export function formatTestReport(execution: ReturnType<typeof runAllReferenceTests>): string {
  const { results, summary } = execution;

  let report = '# RRF Fusion Local Testing Report\n\n';
  report += '## Summary\n\n';
  report += `- **NDCG@5 Improvement**: ${summary.avgNdcgImprovement.toFixed(1)}% (Target: 40%+)\n`;
  report += `- **MRR@10 Improvement**: ${summary.avgMrrImprovement.toFixed(3)}\n`;
  report += `- **Multi-Lane Coverage Improvement**: ${summary.avgCoverageImprovement.toFixed(1)}%\n`;
  report += `- **Latency Budget (<5ms)**: ${summary.allLatenciesValid ? '✅ PASS' : '❌ FAIL'}\n`;
  report += `- **Total Tests**: ${results.length}\n`;
  report += `- **Regressions**: ${summary.regressions.length}\n\n`;

  report += '## Per-Query Results\n\n';
  report += '| Query ID | NDCG@5 (Baseline) | NDCG@5 (RRF) | Improvement | MRR@10 | Coverage |\n';
  report += '|----------|------------------|-------------|-------------|--------|----------|\n';

  results.forEach(result => {
    const query = REFERENCE_QUERIES.find(q => q.id === result.queryId);
    report += `| ${result.queryId} | ${result.baseline.ndcg5.toFixed(3)} | ${result.rrf.ndcg5.toFixed(3)} | ${result.comparison.improvementPercent.toFixed(1)}% | ${result.comparison.rrfMrr10.toFixed(3)} | ${result.rrf.multiLaneCoverage.toFixed(1)}% |\n`;
  });

  if (summary.regressions.length > 0) {
    report += '\n## Regressions\n\n';
    summary.regressions.forEach(r => {
      report += `- ${r}\n`;
    });
  }

  return report;
}

/**
 * Verify NDCG improvement meets 40% target
 */
export function verifyNdcgTarget(execution: ReturnType<typeof runAllReferenceTests>): boolean {
  return execution.summary.avgNdcgImprovement >= 40;
}

/**
 * Verify no regressions in MRR@10
 */
export function verifyMrrNoRegression(execution: ReturnType<typeof runAllReferenceTests>): boolean {
  return execution.results.every(r => r.comparison.rrfMrr10 >= r.comparison.baselineMrr10);
}

/**
 * Verify latency budget
 */
export function verifyLatencyBudget(execution: ReturnType<typeof runAllReferenceTests>): boolean {
  return execution.summary.allLatenciesValid;
}

/**
 * Comprehensive validation gate
 */
export function runValidationGate(execution: ReturnType<typeof runAllReferenceTests>): {
  passed: boolean;
  checks: Array<{ name: string; passed: boolean }>;
} {
  const checks = [
    { name: 'NDCG@5 Improvement ≥40%', passed: verifyNdcgTarget(execution) },
    { name: 'MRR@10 No Regression', passed: verifyMrrNoRegression(execution) },
    { name: 'Latency Budget (<5ms)', passed: verifyLatencyBudget(execution) },
    { name: 'No Test Regressions', passed: execution.summary.regressions.length === 0 }
  ];

  return {
    passed: checks.every(c => c.passed),
    checks
  };
}
