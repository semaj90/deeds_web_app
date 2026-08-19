#!/usr/bin/env node
import 'dotenv/config';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

import {
  evaluateExternalDocRetrieval,
  externalDocRetrievalFixtureSetSchema,
  externalDocsHybridProjectionReceiptSchema,
  externalDocsHybridProofGateSchema,
} from '../../packages/parent-atlas/dist/index.js';
import { createExternalDocRetrievalPort } from '../../sveltekit-frontend/src/lib/server/atlas/docs/external-doc-retrieval-port.ts';

function arg(name: string): string | null {
  const prefix = `--${name}=`;
  return process.argv.slice(2).find((value) => value.startsWith(prefix))?.slice(prefix.length) ?? null;
}

async function readJson(path: string): Promise<any> {
  return JSON.parse(await readFile(resolve(path), 'utf8'));
}

async function main() {
  const fixturePath = arg('fixture');
  const projectionPath = arg('projection');
  const capabilityPath = arg('capability');
  if (!fixturePath || !projectionPath || !capabilityPath) {
    throw new Error('USAGE: --fixture=<json> --projection=<json> --capability=<probe-json> [--out=<json>] [--k=10] [--prefetch-k=50]');
  }

  const fixture = externalDocRetrievalFixtureSetSchema.parse(await readJson(fixturePath));
  const projection = externalDocsHybridProjectionReceiptSchema.parse(await readJson(projectionPath));
  const capabilityRaw = await readJson(capabilityPath);
  const capability = externalDocsHybridProofGateSchema.parse(capabilityRaw.proof_gate ?? capabilityRaw);
  const k = Number(arg('k') ?? 10);
  const prefetchK = Number(arg('prefetch-k') ?? Math.max(50, k * 5));
  const out = resolve(arg('out') ?? 'docs/reports/parent-atlas/external-doc-retrieval-proof-latest.json');

  const bundle = await evaluateExternalDocRetrieval({
    port: createExternalDocRetrievalPort(),
    evaluationId: `external-doc-retrieval:${projection.projection_revision}:${fixture.fixture_revision}`,
    fixture,
    capabilityGate: capability,
    projectionReceipt: projection,
    receiptRevision: 'external-doc-retrieval-proof-v1',
    producerRevision: 'prove-external-doc-retrieval-v1',
    k,
    prefetchK,
  });

  await mkdir(dirname(out), { recursive: true });
  await writeFile(out, `${JSON.stringify(bundle, null, 2)}\n`, 'utf8');
  process.stdout.write(`${JSON.stringify({
    evaluation_id: bundle.evaluation_id,
    dense_recall_at_k: bundle.dense_receipt.mean_recall_at_k,
    bm25_recall_at_k: bundle.bm25_receipt.mean_recall_at_k,
    hybrid_recall_at_k: bundle.hybrid_receipt.mean_recall_at_k,
    dense_mrr: bundle.dense_receipt.mean_reciprocal_rank,
    bm25_mrr: bundle.bm25_receipt.mean_reciprocal_rank,
    hybrid_mrr: bundle.hybrid_receipt.mean_reciprocal_rank,
    cutover_status: bundle.cutover_gate.status,
    blockers: bundle.cutover_gate.blockers,
    output: out,
  }, null, 2)}\n`);

  // A blocked cutover is an evaluation result, not a runner crash.
  if (bundle.cutover_gate.status === 'BLOCKED') process.exitCode = 2;
}

main().catch((error) => {
  console.error('[external-doc-retrieval-proof]', error);
  process.exitCode = 1;
});
