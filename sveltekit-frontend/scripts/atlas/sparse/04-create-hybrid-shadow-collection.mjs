#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildProofLedgerEnvelope, writeProofLedger } from './lib/proof-ledger.mjs';
import { assertSparseApplyContext } from './lib/collection-guard.mjs';
import { createCollection, getCollectionInfo } from './lib/qdrant-introspection.mjs';
import { loadAtlasEnv } from '../load-atlas-env.mjs';

await loadAtlasEnv();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../../..');
const APPLY = process.argv.includes('--apply');
const collection = process.argv.find((arg) => arg.startsWith('--collection='))?.split('=')[1] ?? 'codebase_chunks_sparse_test_v1';
const limit = Number(process.argv.find((arg) => arg.startsWith('--limit='))?.split('=')[1] ?? 500);

const plan = assertSparseApplyContext({
  collection,
  apply: APPLY,
  limit,
  corpusRevision: process.argv.find((arg) => arg.startsWith('--corpus-revision='))?.split('=')[1] ?? null,
  representationRevision: process.argv.find((arg) => arg.startsWith('--representation-revision='))?.split('=')[1] ?? 'lexical_v1',
});

const collectionSpec = {
  vectors: {
    content: { size: 768, distance: 'Cosine' },
  },
  sparse_vectors: {
    lexical_v1: {},
  },
};

async function ensureCollection(targetCollection) {
  try {
    const existing = await getCollectionInfo(targetCollection);
    return { created: false, existing };
  } catch {
    const created = await createCollection(targetCollection, collectionSpec);
    return { created: true, existing: created };
  }
}

const result = {
  artifact_id: 'atlas-sparse-shadow-collection-v1',
  status: APPLY ? 'RUNTIME_PROOF_PENDING' : 'RUNTIME_PROVEN',
  apply: APPLY,
  plan,
  qdrant: collectionSpec,
};

if (APPLY) {
  const target = collection;
  const mutation = await ensureCollection(target);
  result.collection = target;
  result.collection_created = mutation.created;
}

await writeProofLedger(path.join(REPO_ROOT, '.tmp', `${result.artifact_id}.json`), buildProofLedgerEnvelope({
  runId: randomUUID(),
  artifactId: result.artifact_id,
  corpusRevision: plan.corpusRevision ?? 'unknown',
  representationRevision: plan.representationRevision ?? 'lexical_v1',
  sourceCount: plan.limit,
  successCount: APPLY ? 1 : 0,
  failureCount: 0,
  checks: { dry_run_only: !APPLY },
}));

console.log(JSON.stringify(result, null, 2));
