#!/usr/bin/env node
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { buildProofLedgerEnvelope, writeProofLedger } from './lib/proof-ledger.mjs';
import { loadAtlasEnv } from '../load-atlas-env.mjs';

await loadAtlasEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');
const outPath = path.join(REPO_ROOT, '.tmp', 'atlas-sparse-rrf-ablation.json');

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
});

await writeProofLedger(outPath, report);

console.log(JSON.stringify({
  artifact_id: 'atlas-sparse-rrf-ablation-v1',
  status: 'RUNTIME_PROOF_PENDING',
  output_path: outPath,
  note: 'This stage is intentionally bounded and evaluation-only.',
}, null, 2));
