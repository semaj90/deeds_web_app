#!/usr/bin/env tsx

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { compileQueryRouterDatasetV1 } from '../../src/lib/server/atlas/neural-routing/query-router-dataset-v1.js';

function arg(name: string): string | null {
  const prefix = `--${name}=`;
  const inline = process.argv.slice(2).find((value) => value.startsWith(prefix));
  if (inline) return inline.slice(prefix.length);
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] ?? null : null;
}

function usage(): never {
  console.error(`Usage:
  npx tsx scripts/atlas/export-query-router-dataset.mts \\
    --input=<revision-qualified-evaluation-records.jsonl> \\
    --output=<query-router-training.jsonl> \\
    [--receipt=<query-router-training.receipt.json>]

Input rows must use atlas.query-router-evaluation-record.v1 and include the
frozen classification_768 vector plus query/label/model/prompt lineage.
This exporter does not call an embedding model and performs no database,
Qdrant, Valkey, model-training, or canonical writes.`);
  process.exit(2);
}

const inputArg = arg('input');
const outputArg = arg('output');
if (!inputArg || !outputArg) usage();

const inputPath = path.resolve(inputArg);
const outputPath = path.resolve(outputArg);
const receiptPath = path.resolve(arg('receipt') ?? `${outputPath}.receipt.json`);

const raw = await readFile(inputPath, 'utf8');
const records: unknown[] = [];
for (const [index, line] of raw.split(/\r?\n/).entries()) {
  if (!line.trim()) continue;
  try {
    records.push(JSON.parse(line));
  } catch (error) {
    throw new Error(`QUERY_ROUTER_DATASET_INVALID_JSON_LINE:${index + 1}:${error instanceof Error ? error.message : String(error)}`);
  }
}

const compiled = compileQueryRouterDatasetV1(records);
await mkdir(path.dirname(outputPath), { recursive: true });
await mkdir(path.dirname(receiptPath), { recursive: true });
await writeFile(outputPath, compiled.jsonl, 'utf8');
await writeFile(receiptPath, JSON.stringify({
  ...compiled.receipt,
  inputPath,
  outputPath,
  receiptPath,
  sourceFileBytes: Buffer.byteLength(raw, 'utf8'),
  exporterRevision: 'export-query-router-dataset.v1',
  embeddingsGenerated: false,
  trainingExecuted: false,
  qdrantWrites: false,
  postgresWrites: false,
  valkeyWrites: false,
}, null, 2) + '\n', 'utf8');

console.log(JSON.stringify({
  status: 'DATASET_EXPORTED_UNTRAINED',
  rowCount: compiled.receipt.rowCount,
  datasetSha256: compiled.receipt.datasetSha256,
  outputPath,
  receiptPath,
  safeNextCommand: `python scripts/atlas/train-query-router-pytorch.py --dataset ${JSON.stringify(outputPath)}`,
}, null, 2));
