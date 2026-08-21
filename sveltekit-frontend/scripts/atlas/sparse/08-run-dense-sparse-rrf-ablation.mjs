#!/usr/bin/env node
import path from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { buildProofLedgerEnvelope, writeProofLedger } from './lib/proof-ledger.mjs';
import { loadAtlasEnv } from '../load-atlas-env.mjs';

await loadAtlasEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');
const WORKSPACE_ROOT = path.resolve(__dirname, '../../../..');
const outPath = path.join(REPO_ROOT, '.tmp', 'atlas-sparse-rrf-ablation.json');
const groundTruthPath = path.join(WORKSPACE_ROOT, 'scripts', 'eval', 'data', 'labeled_queries.json');
let groundTruth = null;
if (existsSync(groundTruthPath)) {
  try {
    groundTruth = JSON.parse(readFileSync(groundTruthPath, 'utf8'));
  } catch {
    groundTruth = null;
  }
}

const report = buildProofLedgerEnvelope({
  runId: randomUUID(),
  artifactId: 'atlas-sparse-rrf-ablation-v1',
  corpusRevision: process.argv.find((arg) => arg.startsWith('--corpus-revision='))?.split('=')[1] ?? 'unknown',
  representationRevision: 'lexical_v1',
  sourceCount: 0,
  successCount: 0,
  failureCount: 0,
  checks: {
    dense_only: 'pending',
    sparse_only: 'pending',
    rrf: 'pending',
    recall_10: 'pending',
    ndcg_10: 'pending',
  },
  notes: [
    groundTruth
      ? `Keyword/minimum-document labels available at ${groundTruthPath}; packet-level relevance and executor results remain unmeasured. The file contains ${Array.isArray(groundTruth.queries) ? groundTruth.queries.length : 0} labeled queries and is not interchangeable with the separate 20-query legacy PostgreSQL smoke benchmark.`
      : 'No repository ground-truth query file was discovered.',
  ],
});
report.status = 'RUNTIME_PROOF_PENDING';
report.evaluation_inputs = {
  ground_truth_query_count: Array.isArray(groundTruth?.queries) ? groundTruth.queries.length : 0,
  ground_truth_schema: groundTruth?.description ?? null,
  legacy_postgres_smoke_query_count: 20,
  comparable_packet_level_ground_truth: false,
  quality_metrics_computed: false,
};

await writeProofLedger(outPath, report);

console.log(JSON.stringify({
  artifact_id: 'atlas-sparse-rrf-ablation-v1',
  status: 'RUNTIME_PROOF_PENDING',
  output_path: outPath,
  ground_truth_path: groundTruth ? groundTruthPath : null,
  ground_truth_query_count: Array.isArray(groundTruth?.queries) ? groundTruth.queries.length : 0,
  note: 'This stage is intentionally bounded and evaluation-only.',
}, null, 2));
