#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  compileQueryRouterDatasetRowV2,
  type QueryRouterSourceRowV2,
} from '../../src/lib/server/atlas/classification/query-router-dataset-v2.js';
import { RETRIEVAL_ROUTER_TENSOR_REVISION_V2 } from '../../src/lib/server/atlas/classification/retrieval-router-tensor-manifest-v2.js';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const repoRoot = resolve(appRoot, '..');
const outputJson = resolve(repoRoot, 'docs/reports/query-router-v2-plumbing-proof.json');
const outputMd = resolve(repoRoot, 'docs/reports/query-router-v2-plumbing-proof.md');

const domains = ['code','database','retrieval','graph','api','security','documentation','workflow','testing','unknown'] as const;
const operations = ['find','explain','debug','modify','compare','trace','test','synthesize'] as const;

function unitVector768(seed: number): number[] {
  const values = new Array<number>(768);
  let normSq = 0;
  for (let index = 0; index < values.length; index += 1) {
    const value = Math.sin((seed + 1) * (index + 1) * 0.017) + Math.cos((seed + 3) * (index + 5) * 0.011);
    values[index] = value;
    normSq += value * value;
  }
  const norm = Math.sqrt(normSq);
  return values.map((value) => value / norm);
}

function bits(width: number, seed: number, stride: number): number[] {
  return Array.from({ length: width }, (_, index) => ((index + seed) % stride === 0 ? 1 : 0));
}

function sourceRow(index: number): QueryRouterSourceRowV2 {
  const domain = domains[index % domains.length];
  const operation = operations[index % operations.length];
  const queryId = `synthetic-router-fixture-${String(index).padStart(3, '0')}`;
  return {
    queryId,
    query: `${operation} ${domain} GraphifyStructuralMaterializer qdrant writer fixture ${index}`,
    queryRevision: 'synthetic-query-revision-v1',
    labelRevision: 'synthetic-label-revision-v1',
    embeddingModelId: 'google/embeddinggemma-300m',
    embeddingModelRevision: 'synthetic-no-model-execution',
    embeddingPromptRevision: 'synthetic-classification-prompt-lineage',
    representationRevision: 'synthetic-classification-768-v1',
    classification768: unitVector768(index),
    ontologyMask32: bits(32, index, 5),
    operationFlags16: bits(16, index, 4),
    runtimeResource16: bits(16, index + 1, 3),
    graphToolStructure16: bits(16, index + 2, 6),
    domainLabel: domain,
    operationLabel: operation,
    retrievalNeeds: [
      operation === 'find' ? 0.9 : 0.5,
      domain === 'retrieval' ? 0.8 : 0.4,
      domain === 'documentation' ? 0.8 : 0.2,
      0.8,
      domain === 'code' ? 0.9 : 0.4,
      domain === 'graph' ? 0.9 : 0.3,
      domain === 'code' ? 0.8 : 0.3,
      operation === 'modify' || operation === 'debug' ? 0.8 : 0.2,
    ],
    budgetTargets: [0.5, domain === 'graph' ? 0.5 : 0.2, 0.25],
    evidenceRefs: [`synthetic:${queryId}`],
  };
}

const rows = Array.from({ length: 120 }, (_, index) => compileQueryRouterDatasetRowV2(sourceRow(index)));
const splitCounts = rows.reduce((acc, row) => {
  acc[row.split] += 1;
  return acc;
}, { train: 0, validation: 0, test: 0 });
const widths = [...new Set(rows.map((row) => row.featureTensor234.length))];
const rowDigestsUnique = new Set(rows.map((row) => row.rowDigest)).size === rows.length;
const tensorRevisionPass = rows.every((row) => row.tensorRevision === RETRIEVAL_ROUTER_TENSOR_REVISION_V2);
const splitPass = splitCounts.train > 0 && splitCounts.validation > 0 && splitCounts.test > 0;
const widthPass = widths.length === 1 && widths[0] === 234;
const status = splitPass && widthPass && rowDigestsUnique && tensorRevisionPass
  ? 'SYNTHETIC_PLUMBING_PROVEN'
  : 'SYNTHETIC_PLUMBING_FAILED';

const datasetDigest = createHash('sha256')
  .update(rows.map((row) => JSON.stringify(row)).join('\n'))
  .digest('hex');

const report = {
  schema: 'atlas.query-router-v2-plumbing-proof.v1',
  generatedAt: new Date().toISOString(),
  status,
  evidenceClass: 'SYNTHETIC_PLUMBING_ONLY',
  syntheticRows: rows.length,
  splitCounts,
  featureWidths: widths,
  datasetDigest,
  gates: { splitPass, widthPass, rowDigestsUnique, tensorRevisionPass },
  trainingQualityProven: false,
  retrievalQualityProven: false,
  embeddingModelExecuted: false,
  canonicalOwnerChanged: false,
  retrievalOwnerChanged: false,
  canonicalWritesAllowed: false,
  nextRequirement: 'REVISION_QUALIFIED_LABELED_QUERY_CORPUS_WITH_REAL_CLASSIFICATION_768',
};

mkdirSync(dirname(outputJson), { recursive: true });
writeFileSync(outputJson, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
writeFileSync(outputMd, [
  '# Query Router V2 synthetic plumbing proof',
  '',
  `- status: **${status}**`,
  '- evidence class: SYNTHETIC_PLUMBING_ONLY',
  `- rows: ${rows.length}`,
  `- splits: train=${splitCounts.train}, validation=${splitCounts.validation}, test=${splitCounts.test}`,
  `- tensor width: ${widths.join(', ')}`,
  `- unique row digests: ${rowDigestsUnique}`,
  '- training quality proven: false',
  '- retrieval quality proven: false',
  '- embedding model executed: false',
  '',
  'This proof validates dataset/tensor/split plumbing only. Synthetic labels and vectors are not admissible evidence for model promotion.',
  '',
].join('\n'), 'utf8');

console.log(JSON.stringify({ status, outputJson, outputMd }, null, 2));
if (status !== 'SYNTHETIC_PLUMBING_PROVEN') process.exitCode = 1;
