#!/usr/bin/env node
import path from 'node:path';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadAtlasEnv } from '../load-atlas-env.mjs';
import { markSupersededArtifact } from './lib/supersession-registry.mjs';
import { buildProofLedgerEnvelope, writeProofLedger } from './lib/proof-ledger.mjs';

await loadAtlasEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');
const outPath = path.join(REPO_ROOT, '.tmp', 'atlas-sparse-superseded.json');
const rrfPath = path.join(REPO_ROOT, '.tmp', 'atlas-sparse-rrf-ablation.json');

let rrf = null;
if (existsSync(rrfPath)) {
  try {
    rrf = JSON.parse(await readFile(rrfPath, 'utf8'));
  } catch {
    rrf = null;
  }
}

const checks = rrf?.checks ?? {};
const evaluationProven = ['dense_only', 'sparse_only', 'rrf', 'recall_10', 'ndcg_10']
  .every((key) => typeof checks[key] === 'number' || checks[key] === 'PROVEN');

if (!evaluationProven) {
  const blocked = {
    artifact_id: 'atlas-sparse-superseded-v1',
    status: 'BLOCKED_RRF_EVALUATION_PENDING',
    output_path: outPath,
    rrf_report_path: rrfPath,
    registry_mutation: false,
    checks,
  };
  await writeProofLedger(outPath, buildProofLedgerEnvelope({
    runId: randomUUID(),
    artifactId: 'atlas-sparse-superseded-v1',
    corpusRevision: 'unknown',
    representationRevision: 'lexical_v1',
    sourceCount: 0,
    successCount: 0,
    failureCount: 0,
    checks: { evaluation_proven: false, registry_mutation: false },
    notes: ['Supersession requires measured replacement retrieval evidence.'],
  }));
  console.log(JSON.stringify(blocked, null, 2));
  process.exit(0);
}

const registry = await markSupersededArtifact({
  artifact_id: 'phase108e-step6-sparse-bm42-backfill.mjs',
  artifact_state: 'SUPERSEDED',
  superseded_by: 'scripts/atlas/sparse/05-backfill-sparse-bounded.mjs',
  reason: 'Old Step 6 script is unsafe and deprecated.',
  effective_at: new Date().toISOString(),
});

await writeProofLedger(outPath, buildProofLedgerEnvelope({
  runId: randomUUID(),
  artifactId: 'atlas-sparse-superseded-v1',
  corpusRevision: 'unknown',
  representationRevision: 'lexical_v1',
  sourceCount: registry.artifacts.length,
  successCount: 1,
  failureCount: 0,
  checks: { superseded: true },
}));

console.log(JSON.stringify({
  artifact_id: 'atlas-sparse-superseded-v1',
  status: 'RUNTIME_PROVEN',
  output_path: outPath,
  supersession_registry: registry,
}, null, 2));
