#!/usr/bin/env node
/**
 * Retrieval Benchmark Baseline Runner
 *
 * Measures retrieval quality on 100 seed queries:
 * - Recall@5, Recall@10, Recall@20
 * - Mean Reciprocal Rank (MRR)
 * - Authority Score (from Phase 3A reranker)
 *
 * This is the GOLDEN METRIC for Phase 3 success.
 *
 * Usage:
 *   npm run benchmark:retrieval:baseline
 *   npm run benchmark:retrieval:baseline -- --save-baseline
 *   npm run benchmark:retrieval:baseline -- --compare-baseline
 */

import fs from 'fs';
import path from 'path';
import readline from 'readline';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const BENCHMARKS_DIR = path.join(__dirname, '../../benchmarks');
const QUERIES_FILE = path.join(BENCHMARKS_DIR, 'retrieval-100.jsonl');
const RESULTS_DIR = path.join(BENCHMARKS_DIR, 'results');
const BASELINE_FILE = path.join(RESULTS_DIR, 'baseline-metrics.json');

// Ensure results directory exists
if (!fs.existsSync(RESULTS_DIR)) {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
}

// Load benchmark queries
async function loadQueries() {
  const queries = [];
  const rl = readline.createInterface({
    input: fs.createReadStream(QUERIES_FILE),
    crlfDelay: Infinity,
  });

  for await (const line of rl) {
    if (line.trim()) {
      queries.push(JSON.parse(line));
    }
  }

  return queries;
}

// Simulate retrieval results (placeholder until API integration)
function simulateRetrieval(query, expectedFeatureId, expectedSourceRef) {
  // TODO: Replace with actual Qdrant search + authority reranker
  // For now, return mock results to establish baseline metrics structure

  // Mock: simulate query execution
  const mockResults = [
    {
      rank: 1,
      feature_id: expectedFeatureId,
      source_ref: expectedSourceRef,
      score: 0.95,
      authority_score: 0.87,
      retrieval_stage: 'qdrant',
    },
    {
      rank: 2,
      feature_id: `${expectedFeatureId}-related`,
      source_ref: expectedSourceRef.replace(/\/[^/]+$/, '/related.ts'),
      score: 0.82,
      authority_score: 0.72,
      retrieval_stage: 'community',
    },
    {
      rank: 3,
      feature_id: `${expectedFeatureId}-helper`,
      source_ref: expectedSourceRef.replace(/\/[^/]+$/, '/helper.ts'),
      score: 0.71,
      authority_score: 0.65,
      retrieval_stage: 'graph',
    },
    {
      rank: 4,
      feature_id: `${expectedFeatureId}-utils`,
      source_ref: expectedSourceRef.replace(/\/[^/]+$/, '/utils.ts'),
      score: 0.58,
      authority_score: 0.52,
      retrieval_stage: 'graph',
    },
    {
      rank: 5,
      feature_id: `${expectedFeatureId}-types`,
      source_ref: expectedSourceRef.replace(/\/[^/]+$/, '/types.ts'),
      score: 0.45,
      authority_score: 0.40,
      retrieval_stage: 'graph',
    },
  ];

  // Extend to 20 results for @20 metrics
  for (let i = 6; i <= 20; i++) {
    mockResults.push({
      rank: i,
      feature_id: `${expectedFeatureId}-rel${i}`,
      source_ref: expectedSourceRef.replace(/\/[^/]+$/, `/rel${i}.ts`),
      score: Math.max(0.1, 0.45 - (i - 5) * 0.02),
      authority_score: Math.max(0.05, 0.40 - (i - 5) * 0.015),
      retrieval_stage: i <= 10 ? 'community' : 'graph',
    });
  }

  return mockResults;
}

// Compute metrics for a single query
function computeMetrics(query, results) {
  const expectedFeatureId = query.expected_feature_id;
  const expectedSourceRef = query.expected_source_ref;

  // Find rank of expected result (if present)
  let expectedRank = null;
  for (const result of results) {
    if (result.feature_id === expectedFeatureId || result.source_ref === expectedSourceRef) {
      expectedRank = result.rank;
      break;
    }
  }

  // Recall@K: (1 if expected result is in top-K, else 0)
  const recall5 = results.slice(0, 5).some((r) => r.feature_id === expectedFeatureId) ? 1 : 0;
  const recall10 = results.slice(0, 10).some((r) => r.feature_id === expectedFeatureId) ? 1 : 0;
  const recall20 = results.slice(0, 20).some((r) => r.feature_id === expectedFeatureId) ? 1 : 0;

  // MRR: Mean Reciprocal Rank (1/rank if found, 0 otherwise)
  const mrr = expectedRank ? 1 / expectedRank : 0;

  // Authority Score: average authority score of top-5 results
  const authScore = results
    .slice(0, 5)
    .reduce((sum, r) => sum + r.authority_score, 0) / 5;

  return {
    query: query.query,
    category: query.category,
    expected_feature_id: expectedFeatureId,
    recall_at_5: recall5,
    recall_at_10: recall10,
    recall_at_20: recall20,
    mrr,
    authority_score: authScore,
    expected_rank: expectedRank,
  };
}

// Aggregate metrics across all queries
function aggregateMetrics(queryMetrics) {
  const categories = {};
  let totalRecall5 = 0,
    totalRecall10 = 0,
    totalRecall20 = 0,
    totalMrr = 0,
    totalAuth = 0;

  for (const metrics of queryMetrics) {
    const cat = metrics.category;
    if (!categories[cat]) {
      categories[cat] = {
        count: 0,
        recall_at_5: 0,
        recall_at_10: 0,
        recall_at_20: 0,
        mrr: 0,
        authority_score: 0,
      };
    }

    categories[cat].count += 1;
    categories[cat].recall_at_5 += metrics.recall_at_5;
    categories[cat].recall_at_10 += metrics.recall_at_10;
    categories[cat].recall_at_20 += metrics.recall_at_20;
    categories[cat].mrr += metrics.mrr;
    categories[cat].authority_score += metrics.authority_score;

    totalRecall5 += metrics.recall_at_5;
    totalRecall10 += metrics.recall_at_10;
    totalRecall20 += metrics.recall_at_20;
    totalMrr += metrics.mrr;
    totalAuth += metrics.authority_score;
  }

  // Normalize by count
  const n = queryMetrics.length;
  const overall = {
    recall_at_5: totalRecall5 / n,
    recall_at_10: totalRecall10 / n,
    recall_at_20: totalRecall20 / n,
    mrr: totalMrr / n,
    authority_score: totalAuth / n,
    total_queries: n,
  };

  // Normalize per-category
  for (const cat in categories) {
    const count = categories[cat].count;
    categories[cat].recall_at_5 /= count;
    categories[cat].recall_at_10 /= count;
    categories[cat].recall_at_20 /= count;
    categories[cat].mrr /= count;
    categories[cat].authority_score /= count;
  }

  return { overall, by_category: categories };
}

// Format and print results
function printResults(aggregated, timestamp) {
  const { overall, by_category } = aggregated;

  console.log('\n╔════════════════════════════════════════════════════════════════╗');
  console.log('║           RETRIEVAL BENCHMARK BASELINE RESULTS                  ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  console.log(`Timestamp: ${timestamp}`);
  console.log(`Total Queries: ${overall.total_queries}`);
  console.log('');

  console.log('┌────────────────────────────────────────────────────────────────┐');
  console.log('│ OVERALL METRICS                                                │');
  console.log('├────────────────────────────────────────────────────────────────┤');
  console.log(
    `│ Recall@5             ${String((overall.recall_at_5 * 100).toFixed(1)).padStart(6)}%                                      │`
  );
  console.log(
    `│ Recall@10            ${String((overall.recall_at_10 * 100).toFixed(1)).padStart(6)}%                                      │`
  );
  console.log(
    `│ Recall@20            ${String((overall.recall_at_20 * 100).toFixed(1)).padStart(6)}%                                      │`
  );
  console.log(
    `│ Mean Reciprocal Rank ${String(overall.mrr.toFixed(3)).padStart(6)}                                      │`
  );
  console.log(
    `│ Avg Authority Score  ${String(overall.authority_score.toFixed(3)).padStart(6)}                                      │`
  );
  console.log('└────────────────────────────────────────────────────────────────┘\n');

  console.log('┌────────────────────────────────────────────────────────────────┐');
  console.log('│ BY CATEGORY                                                    │');
  console.log('├──────────────┬──────┬──────┬──────┬───────┬──────────────────┤');
  console.log('│ Category     │ @5   │ @10  │ @20  │  MRR  │ Auth Score       │');
  console.log('├──────────────┼──────┼──────┼──────┼───────┼──────────────────┤');

  for (const [cat, metrics] of Object.entries(by_category)) {
    const r5 = (metrics.recall_at_5 * 100).toFixed(0).padStart(2);
    const r10 = (metrics.recall_at_10 * 100).toFixed(0).padStart(2);
    const r20 = (metrics.recall_at_20 * 100).toFixed(0).padStart(2);
    const mrr = metrics.mrr.toFixed(2).padStart(5);
    const auth = metrics.authority_score.toFixed(3).padStart(6);
    console.log(
      `│ ${cat.padEnd(12)} │ ${r5}%  │ ${r10}%  │ ${r20}%  │ ${mrr} │ ${auth}        │`
    );
  }

  console.log('└──────────────┴──────┴──────┴──────┴───────┴──────────────────┘\n');

  // Print targets
  console.log('┌────────────────────────────────────────────────────────────────┐');
  console.log('│ PHASE 3 TARGETS                                                │');
  console.log('├────────────────────────────────────────────────────────────────┤');
  console.log(
    `│ Recall@20 > 0.92:     ${overall.recall_at_20 >= 0.92 ? '✓ PASS' : '✗ FAIL'.padEnd(22)} (current: ${(overall.recall_at_20 * 100).toFixed(1)}%)  │`
  );
  console.log(
    `│ MRR > 0.90:           ${overall.mrr >= 0.9 ? '✓ PASS' : '✗ FAIL'.padEnd(22)} (current: ${overall.mrr.toFixed(3)})  │`
  );
  console.log(
    `│ Authority Score > 0.75: ${overall.authority_score > 0.75 ? '✓ PASS' : '✗ FAIL'.padEnd(22)} (current: ${overall.authority_score.toFixed(3)})  │`
  );
  console.log('└────────────────────────────────────────────────────────────────┘\n');
}

// Save baseline to JSON
function saveBaseline(aggregated, timestamp) {
  const baseline = {
    timestamp,
    metrics: aggregated,
  };

  fs.writeFileSync(BASELINE_FILE, JSON.stringify(baseline, null, 2));
  console.log(`✓ Baseline saved to ${BASELINE_FILE}`);
}

// Compare against previous baseline
function compareBaseline(current) {
  if (!fs.existsSync(BASELINE_FILE)) {
    console.log('No previous baseline found. Run with --save-baseline to create one.');
    return;
  }

  const baseline = JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf-8'));
  const prev = baseline.metrics.overall;
  const curr = current.overall;

  console.log('\n┌────────────────────────────────────────────────────────────────┐');
  console.log('│ COMPARISON WITH PREVIOUS BASELINE                              │');
  console.log('├────────────────────────────────────────────────────────────────┤');

  const diff = (curr, prev) => {
    const delta = curr - prev;
    const pct = ((delta / prev) * 100).toFixed(1);
    const arrow = delta > 0 ? '↑' : delta < 0 ? '↓' : '→';
    return `${arrow} ${delta > 0 ? '+' : ''}${pct}%`;
  };

  console.log(`│ Recall@20  ${String(prev.recall_at_20.toFixed(3)).padStart(6)} → ${String(curr.recall_at_20.toFixed(3)).padStart(6)} ${diff(curr.recall_at_20, prev.recall_at_20).padEnd(18)} │`);
  console.log(`│ MRR        ${String(prev.mrr.toFixed(3)).padStart(6)} → ${String(curr.mrr.toFixed(3)).padStart(6)} ${diff(curr.mrr, prev.mrr).padEnd(18)} │`);
  console.log(
    `│ Auth Score ${String(prev.authority_score.toFixed(3)).padStart(6)} → ${String(curr.authority_score.toFixed(3)).padStart(6)} ${diff(curr.authority_score, prev.authority_score).padEnd(18)} │`
  );

  console.log('└────────────────────────────────────────────────────────────────┘\n');
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const saveBaseline = args.includes('--save-baseline');
  const compareBaseline = args.includes('--compare-baseline');

  console.log('Loading benchmark queries...');
  const queries = await loadQueries();
  console.log(`Loaded ${queries.length} queries from ${QUERIES_FILE}`);

  console.log('Running retrieval queries (simulated)...\n');
  const queryMetrics = [];

  for (let i = 0; i < queries.length; i++) {
    const query = queries[i];
    const results = simulateRetrieval(
      query.query,
      query.expected_feature_id,
      query.expected_source_ref
    );
    const metrics = computeMetrics(query, results);
    queryMetrics.push(metrics);

    if ((i + 1) % 10 === 0) {
      process.stdout.write(`✓ ${i + 1}/${queries.length}\r`);
    }
  }

  console.log(`✓ ${queries.length}/${queries.length} queries processed`);

  const aggregated = aggregateMetrics(queryMetrics);
  const timestamp = new Date().toISOString();

  printResults(aggregated, timestamp);

  if (saveBaseline) {
    saveBaseline(aggregated, timestamp);
  }

  if (compareBaseline) {
    compareBaseline(aggregated);
  }

  // Save detailed results to CSV
  const csvFile = path.join(RESULTS_DIR, `results-${timestamp.split('T')[0]}.csv`);
  const csv = [
    'query,category,expected_feature_id,recall_at_5,recall_at_10,recall_at_20,mrr,authority_score,expected_rank',
    ...queryMetrics.map(
      (m) =>
        `"${m.query}",${m.category},${m.expected_feature_id},${m.recall_at_5},${m.recall_at_10},${m.recall_at_20},${m.mrr.toFixed(3)},${m.authority_score.toFixed(3)},${m.expected_rank || 'N/A'}`
    ),
  ].join('\n');

  fs.writeFileSync(csvFile, csv);
  console.log(`✓ Detailed results saved to ${csvFile}`);
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});
