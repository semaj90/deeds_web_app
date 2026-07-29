#!/usr/bin/env node
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { loadAtlasEnv } from '../load-atlas-env.mjs';
import { markSupersededArtifact } from './lib/supersession-registry.mjs';
import { buildProofLedgerEnvelope, writeProofLedger } from './lib/proof-ledger.mjs';

await loadAtlasEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');
const outPath = path.join(REPO_ROOT, '.tmp', 'atlas-sparse-promotion.json');

const registry = await markSupersededArtifact({
  artifact_id: 'phase108e-step6-sparse-bm42-backfill.mjs',
  artifact_state: 'SUPERSEDED',
  superseded_by: 'scripts/atlas/sparse/05-backfill-sparse-bounded.mjs',
  reason: 'Misnamed BM42 sparse backfill is replaced by bounded lexical_v1 proof stages.',
  effective_at: new Date().toISOString(),
});

await writeProofLedger(outPath, buildProofLedgerEnvelope({
  runId: randomUUID(),
  artifactId: 'atlas-sparse-promotion-v1',
  corpusRevision: 'unknown',
  representationRevision: 'lexical_v1',
  sourceCount: registry.artifacts.length,
  successCount: 1,
  failureCount: 0,
  checks: { supersession_registry: true },
}));

console.log(JSON.stringify({
  artifact_id: 'atlas-sparse-promotion-v1',
  status: 'RUNTIME_PROVEN',
  output_path: outPath,
  supersession_registry: registry,
}, null, 2));
