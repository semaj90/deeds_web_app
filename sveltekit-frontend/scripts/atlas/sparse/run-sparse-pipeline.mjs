#!/usr/bin/env node
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadAtlasEnv } from '../load-atlas-env.mjs';
import { buildProofLedgerEnvelope, writeProofLedger } from './lib/proof-ledger.mjs';

await loadAtlasEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');
const APPLY = process.argv.includes('--apply');
const args = process.argv.filter((arg) => arg !== '--apply');
const collectionArg = process.argv.find((arg) => arg.startsWith('--collection=')) ?? '--collection=codebase_chunks_sparse_test_v1';

const stages = [
  '00-discover-existing-sparse.mjs',
  '01-audit-source-corpus.mjs',
  '02-build-lexical-vocabulary.mjs',
  '03-encode-sparse-sample.mjs',
  '04-create-hybrid-shadow-collection.mjs',
  '05-backfill-sparse-bounded.mjs',
  '06-verify-sparse-readback.mjs',
  '07-run-sparse-self-query-proof.mjs',
  '08-run-dense-sparse-rrf-ablation.mjs',
  '09-promote-hybrid-collection.mjs',
  '10-mark-superseded-artifacts.mjs',
];

const stageResults = [];

for (const stage of stages) {
  const stagePath = path.join(__dirname, stage);
  const stageArgs = APPLY && /^(04|05|09|10)-/.test(stage)
    ? [stagePath, '--apply', collectionArg, ...args.filter((arg) => !arg.startsWith('--collection='))]
    : [stagePath, collectionArg, ...args.filter((arg) => !arg.startsWith('--collection='))];

  const result = spawnSync(process.execPath, stageArgs, {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 10,
  });

  const stageResult = {
    stage,
    status: result.status,
    stdout: result.stdout?.trim() ?? '',
    stderr: result.stderr?.trim() ?? '',
  };
  stageResults.push(stageResult);

  if (result.status !== 0) {
    console.log(JSON.stringify({
      artifact_id: 'atlas-sparse-pipeline-v1',
      status: 'RUNTIME_PROOF_FAILED',
      apply: APPLY,
      failed_stage: stage,
      stage_results: stageResults,
    }, null, 2));
    process.exit(result.status ?? 1);
  }
}

const outPath = path.join(REPO_ROOT, '.tmp', 'atlas-sparse-pipeline.json');
await writeProofLedger(outPath, buildProofLedgerEnvelope({
  runId: randomUUID(),
  artifactId: 'atlas-sparse-pipeline-v1',
  corpusRevision: process.argv.find((arg) => arg.startsWith('--corpus-revision='))?.split('=')[1] ?? 'unknown',
  representationRevision: process.argv.find((arg) => arg.startsWith('--representation-revision='))?.split('=')[1] ?? 'lexical_v1',
  sourceCount: stageResults.length,
  successCount: stageResults.length,
  failureCount: 0,
  checks: { apply: APPLY, stages: stageResults.map((item) => item.stage) },
}));

console.log(JSON.stringify({
  artifact_id: 'atlas-sparse-pipeline-v1',
  status: 'RUNTIME_PROVEN',
  apply: APPLY,
  output_path: outPath,
  stages: stageResults.map((item) => ({ stage: item.stage, status: item.status })),
}, null, 2));
