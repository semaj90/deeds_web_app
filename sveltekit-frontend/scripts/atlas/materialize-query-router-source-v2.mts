#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

import { encodeClassificationInput } from '../../src/lib/server/atlas/embedding/embeddinggemma-task-representation-v1.js';
import { QueryRouterSourceRowV2Schema } from '../../src/lib/server/atlas/classification/query-router-dataset-v2.js';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const repoRoot = resolve(appRoot, '..');

const LabelInputSchema = z.object({
  queryId: z.string().min(1),
  query: z.string().min(1),
  queryRevision: z.string().min(1),
  labelRevision: z.string().min(1),
  embeddingModelRevision: z.string().min(1),
  representationRevision: z.string().min(1),
  ontologyMask32: z.array(z.number().finite()).length(32),
  operationFlags16: z.array(z.number().finite()).length(16),
  runtimeResource16: z.array(z.number().finite()).length(16),
  graphToolStructure16: z.array(z.number().finite()).length(16),
  domainLabel: z.enum(['code','database','retrieval','graph','api','security','documentation','workflow','testing','unknown']),
  operationLabel: z.enum(['find','explain','debug','modify','compare','trace','test','synthesize']),
  retrievalNeeds: z.array(z.number().finite().min(0).max(1)).length(8),
  budgetTargets: z.array(z.number().finite().min(0).max(1)).length(3),
  evidenceRefs: z.array(z.string().min(1)).min(1),
}).strict();

type LabelInput = z.infer<typeof LabelInputSchema>;

function arg(name: string, fallback?: string): string | undefined {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const inputPath = resolve(appRoot, arg('--input', 'data/atlas-ml/query-router-labels-v2.jsonl')!);
const outputPath = resolve(appRoot, arg('--output', 'data/atlas-ml/query-router-source-v2.jsonl')!);
const reportPath = resolve(repoRoot, 'docs/reports/query-router-v2-source-materialization.json');
const endpoint = arg('--endpoint', process.env.EMBEDDING_URL ?? 'http://127.0.0.1:8081/v1/embeddings')!;
const model = arg('--model', process.env.EMBEDDING_MODEL ?? 'embeddinggemma')!;

function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

async function embed768(text: string): Promise<number[]> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ model, input: text, encoding_format: 'float' }),
  });
  if (!response.ok) throw new Error(`EMBEDDING_REQUEST_FAILED status=${response.status} body=${(await response.text()).slice(0, 500)}`);
  const body = await response.json() as Record<string, unknown>;
  const data = Array.isArray(body.data) ? body.data : null;
  const openAi = data && typeof data[0] === 'object' && data[0] !== null
    ? (data[0] as Record<string, unknown>).embedding
    : null;
  const vector = Array.isArray(openAi)
    ? openAi
    : Array.isArray(body.embedding)
      ? body.embedding
      : Array.isArray(body.embeddings) && Array.isArray((body.embeddings as unknown[])[0])
        ? (body.embeddings as unknown[][])[0]
        : null;
  if (!vector) throw new Error('EMBEDDING_RESPONSE_VECTOR_MISSING');
  const values = vector.map(Number);
  if (values.length !== 768) throw new Error(`EMBEDDING_DIMENSION_MISMATCH expected=768 got=${values.length}`);
  if (!values.every(Number.isFinite)) throw new Error('EMBEDDING_NONFINITE_VALUE');
  return values;
}

const raw = await readFile(inputPath, 'utf8');
const labelRows: LabelInput[] = raw.split(/\r?\n/).filter(Boolean).map((line, index) => {
  try { return LabelInputSchema.parse(JSON.parse(line)); }
  catch (error) { throw new Error(`LABEL_ROW_INVALID line=${index + 1}: ${String(error)}`); }
});
if (labelRows.length < 20) throw new Error('QUERY_ROUTER_REAL_CORPUS_REQUIRES_AT_LEAST_20_ROWS');

const outputRows: unknown[] = [];
const embeddingDigests: string[] = [];
for (const row of labelRows) {
  const formatted = encodeClassificationInput(row.query);
  const classification768 = await embed768(formatted.formattedText);
  embeddingDigests.push(sha256(JSON.stringify(classification768)));
  outputRows.push(QueryRouterSourceRowV2Schema.parse({
    queryId: row.queryId,
    query: row.query,
    queryRevision: row.queryRevision,
    labelRevision: row.labelRevision,
    embeddingModelId: 'google/embeddinggemma-300m',
    embeddingModelRevision: row.embeddingModelRevision,
    embeddingPromptRevision: formatted.promptRevision,
    representationRevision: row.representationRevision,
    classification768,
    ontologyMask32: row.ontologyMask32,
    operationFlags16: row.operationFlags16,
    runtimeResource16: row.runtimeResource16,
    graphToolStructure16: row.graphToolStructure16,
    domainLabel: row.domainLabel,
    operationLabel: row.operationLabel,
    retrievalNeeds: row.retrievalNeeds,
    budgetTargets: row.budgetTargets,
    evidenceRefs: row.evidenceRefs,
  }));
}

await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, `${outputRows.map((row) => JSON.stringify(row)).join('\n')}\n`, 'utf8');
const report = {
  schema: 'atlas.query-router-source-materialization-receipt.v2',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_EMBEDDING_INFERENCE_NO_RETRIEVAL_WRITES',
  inputPath,
  outputPath,
  inputChecksum: sha256(raw),
  outputChecksum: sha256(outputRows.map((row) => JSON.stringify(row)).join('\n')),
  rowCount: outputRows.length,
  endpoint,
  model,
  nativeDimension: 768,
  promptMode: 'classification',
  promptRevision: encodeClassificationInput('probe').promptRevision,
  embeddingDigestSetChecksum: sha256(embeddingDigests.join('\n')),
  labelsSynthesized: false,
  canonicalWritesAllowed: false,
  retrievalWritesAllowed: false,
  trainingExecuted: false,
  nextCommand: `npx tsx scripts/atlas/build-query-router-dataset-v2.mts --input=${outputPath}`,
};
await mkdir(dirname(reportPath), { recursive: true });
await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify(report, null, 2));
