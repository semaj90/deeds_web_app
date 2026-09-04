#!/usr/bin/env node

/** Read-only proof of the staged ParameterArtifactV1 boundary. */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const reportPath = path.resolve(root, 'docs/reports/dag-parameter-materialization-v1.json');
const atlas = await import(pathToFileURL(path.resolve(root, 'packages/parent-atlas/dist/index.js')).href);

const inputs = [
  {
    actionId: 'plan:proof:lexical',
    actionKind: 'FETCH_POSTGRES',
    schemaRef: 'input:lexical-search',
    schemaRevision: 'operator:lexical:v1',
    boundArguments: { query: 'source revision', limit: 5 },
  },
  {
    actionId: 'plan:proof:semantic',
    actionKind: 'FETCH_QDRANT',
    schemaRef: 'input:semantic-search',
    schemaRevision: 'operator:semantic:v1',
    boundArguments: { representationId: 'semantic_768', topK: 5 },
  },
];

const first = inputs.map((input) => atlas.buildParameterArtifactV1(input));
const second = inputs.map((input) => atlas.buildParameterArtifactV1({ ...input, boundArguments: { ...input.boundArguments } }));
const deterministic = JSON.stringify(first) === JSON.stringify(second);
const distinctActions = new Set(first.map((artifact) => artifact.artifactId)).size === first.length;

const report = {
  schema: 'atlas.dag-parameter-materialization.v1',
  mode: 'READ_ONLY_PROOF',
  artifactCount: first.length,
  deterministicReplay: deterministic,
  distinctOperatorArtifacts: distinctActions,
  artifacts: first.map(({ boundArguments, ...artifact }) => artifact),
  canonicalAuthority: false,
  writesPerformed: false,
  status: deterministic && distinctActions ? 'PROVEN_BOUNDED' : 'FAILED',
  runtimeExecutorLoading: 'OPEN',
};

await fs.mkdir(path.dirname(reportPath), { recursive: true });
await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: report.status, output: 'docs/reports/dag-parameter-materialization-v1.json', writesPerformed: false }, null, 2));
if (report.status !== 'PROVEN_BOUNDED') process.exitCode = 1;
