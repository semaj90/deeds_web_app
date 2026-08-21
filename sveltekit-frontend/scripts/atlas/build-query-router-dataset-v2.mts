#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import {
  compileQueryRouterDatasetRowV2,
  QueryRouterSourceRowV2Schema,
  QUERY_ROUTER_DATASET_REVISION_V2,
  QUERY_ROUTER_SPLIT_REVISION_V1,
} from '../../src/lib/server/atlas/classification/query-router-dataset-v2.js';
import { RETRIEVAL_ROUTER_TENSOR_REVISION_V2 } from '../../src/lib/server/atlas/classification/retrieval-router-tensor-manifest-v2.js';

function arg(name: string): string | null {
  const prefix = `--${name}=`;
  const hit = process.argv.find((value) => value.startsWith(prefix));
  return hit ? hit.slice(prefix.length) : null;
}

const inputPath = resolve(arg('input') ?? 'data/atlas-ml/query-router-source-v2.jsonl');
const outputPath = resolve(arg('output') ?? 'data/atlas-ml/query-router-dataset-v2.jsonl');
const receiptPath = resolve(arg('receipt') ?? 'docs/reports/query-router-dataset-v2-receipt.json');

const raw = await readFile(inputPath, 'utf8');
const rows = raw.split(/\r?\n/).filter(Boolean).map((line, index) => {
  try {
    return QueryRouterSourceRowV2Schema.parse(JSON.parse(line));
  } catch (error) {
    throw new Error(`QUERY_ROUTER_SOURCE_ROW_INVALID line=${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
  }
});
if (rows.length < 20) throw new Error(`QUERY_ROUTER_DATASET_TOO_SMALL rows=${rows.length}`);

const ids = new Set<string>();
const compiled = rows.map((row) => {
  if (ids.has(row.queryId)) throw new Error(`QUERY_ROUTER_DUPLICATE_QUERY_ID ${row.queryId}`);
  ids.add(row.queryId);
  return compileQueryRouterDatasetRowV2(row);
});
compiled.sort((a, b) => a.queryId.localeCompare(b.queryId));

const splitCounts = { train: 0, validation: 0, test: 0 };
for (const row of compiled) splitCounts[row.split] += 1;
if (!splitCounts.train || !splitCounts.validation || !splitCounts.test) {
  throw new Error(`QUERY_ROUTER_SPLIT_EMPTY ${JSON.stringify(splitCounts)}`);
}

const output = compiled.map((row) => JSON.stringify(row)).join('\n') + '\n';
const datasetChecksum = createHash('sha256').update(output).digest('hex');
const sourceChecksum = createHash('sha256').update(raw).digest('hex');
const revisionSets = {
  queryRevision: [...new Set(compiled.map((row) => row.queryRevision))].sort(),
  labelRevision: [...new Set(compiled.map((row) => row.labelRevision))].sort(),
  embeddingModelRevision: [...new Set(compiled.map((row) => row.embeddingModelRevision))].sort(),
  embeddingPromptRevision: [...new Set(compiled.map((row) => row.embeddingPromptRevision))].sort(),
  representationRevision: [...new Set(compiled.map((row) => row.representationRevision))].sort(),
};

await mkdir(dirname(outputPath), { recursive: true });
await mkdir(dirname(receiptPath), { recursive: true });
await writeFile(outputPath, output, 'utf8');
await writeFile(receiptPath, JSON.stringify({
  schema: 'atlas.query-router-dataset-receipt.v2',
  datasetRevision: QUERY_ROUTER_DATASET_REVISION_V2,
  tensorRevision: RETRIEVAL_ROUTER_TENSOR_REVISION_V2,
  splitRevision: QUERY_ROUTER_SPLIT_REVISION_V1,
  inputPath,
  outputPath,
  sourceChecksum,
  datasetChecksum,
  rowCount: compiled.length,
  splitCounts,
  revisionSets,
  featureWidth: 234,
  representationId: 'classification_mrl_128',
  embeddingSourceRepresentationId: 'classification_768',
  evidenceAuthority: false,
  canonicalWritesAllowed: false,
  retrievalWritesPerformed: false,
}, null, 2) + '\n', 'utf8');

console.log(JSON.stringify({ outputPath, receiptPath, datasetChecksum, rowCount: compiled.length, splitCounts }, null, 2));
