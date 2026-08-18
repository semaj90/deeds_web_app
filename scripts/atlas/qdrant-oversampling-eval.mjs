#!/usr/bin/env node
/**
 * Qdrant oversampling/rescore evaluation scaffold.
 *
 * TODO(TEST-LATER): wire to the existing semantic_768 Qdrant client and golden
 * retrieval corpus. This file deliberately contains NO new retrieval owner.
 * It only enumerates query-time executor settings and emits evaluation jobs.
 */

const configs = [
  { id: 'exact', exact: true, oversampling: 1, rescoreOriginal: true },
  { id: 'q1', exact: false, oversampling: 1, rescoreOriginal: true },
  { id: 'q2', exact: false, oversampling: 2, rescoreOriginal: true },
  { id: 'q3', exact: false, oversampling: 3, rescoreOriginal: true },
  { id: 'q4', exact: false, oversampling: 4, rescoreOriginal: true },
];

const args = new Set(process.argv.slice(2));
const dryRun = !args.has('--run');

const manifest = {
  schema: 'atlas.qdrant-oversampling-eval-plan.v1',
  status: dryRun ? 'PLAN_ONLY' : 'NOT_IMPLEMENTED',
  representation: 'semantic_768',
  logicalLane: 'semantic',
  executor: 'qdrant',
  configs,
  metrics: ['recall_at_k', 'mrr', 'ndcg_at_k', 'exact_promotion_success', 'p50_ms', 'p95_ms'],
  invariants: [
    'exact configuration is the correctness oracle',
    'all configurations contribute at most one semantic vote',
    'cache hit state is not a relevance feature',
  ],
  todo: [
    'TODO(TEST-LATER): import the existing Qdrant semantic SearchRuntime adapter.',
    'TODO(TEST-LATER): replay the same revision-qualified golden queries for every config.',
    'TODO(TEST-LATER): store one receipt per config/query and an aggregate Pareto report.',
    'TODO(TEST-LATER): promote an oversampling prior only after Recall@K/MRR/cost comparison.',
  ],
};

console.log(JSON.stringify(manifest, null, 2));
if (!dryRun) process.exitCode = 2;
