#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const repoRoot = resolve(appRoot, '..');
function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const reportJson = resolve(repoRoot, arg('--report-json', 'docs/reports/query-router-v2-readiness-audit.json'));
const reportMd = resolve(repoRoot, arg('--report-md', 'docs/reports/query-router-v2-readiness-audit.md'));
const labeledCorpusPath = resolve(appRoot, 'data/atlas-ml/query-router-labels-v2.jsonl');
const materializedSourcePath = resolve(appRoot, 'data/atlas-ml/query-router-source-v2.jsonl');

const requiredFiles = [
  'src/lib/server/atlas/classification/query-router-dataset-v2.ts',
  'src/lib/server/atlas/classification/retrieval-router-tensor-manifest-v2.ts',
  'src/lib/server/atlas/classification/retrieval-executor-policy-v2.ts',
  'src/lib/server/atlas/classification/query-router-v2-integration.spec.ts',
  'scripts/atlas/build-query-router-dataset-v2.mts',
  'scripts/atlas/train-query-router-pytorch-v2.py',
  'scripts/atlas/train-query-router-xgboost-v2.py',
  'scripts/atlas/compare-query-router-v2.py',
];

function sha256(path: string): string | null {
  if (!existsSync(path)) return null;
  return createHash('sha256').update(readFileSync(path)).digest('hex');
}

function probePython(moduleName: string): { available: boolean; version: string | null; error: string | null } {
  try {
    const stdout = execFileSync('python', ['-c', `import ${moduleName} as m; print(getattr(m, '__version__', 'unknown'))`], {
      cwd: appRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 15000,
    }).trim();
    return { available: true, version: stdout || 'unknown', error: null };
  } catch (error) {
    return { available: false, version: null, error: error instanceof Error ? error.message : String(error) };
  }
}

function probeCommand(command: string, args: string[]): { pass: boolean; output: string | null; error: string | null } {
  try {
    const output = execFileSync(command, args, {
      cwd: appRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 20000,
    });
    return { pass: true, output: output.trim().slice(0, 4000), error: null };
  } catch (error) {
    return { pass: false, output: null, error: error instanceof Error ? error.message : String(error) };
  }
}

const files = requiredFiles.map((relativePath) => {
  const path = resolve(appRoot, relativePath);
  return { relativePath, exists: existsSync(path), sha256: sha256(path) };
});

const python = {
  numpy: probePython('numpy'),
  torch: probePython('torch'),
  xgboost: probePython('xgboost'),
};

const entrypoints = {
  pytorchHelp: probeCommand('python', ['scripts/atlas/train-query-router-pytorch-v2.py', '--help']),
  xgboostHelp: probeCommand('python', ['scripts/atlas/train-query-router-xgboost-v2.py', '--help']),
  compareHelp: probeCommand('python', ['scripts/atlas/compare-query-router-v2.py', '--help']),
};

const contractsPresent = files.every((row) => row.exists);
const pythonReady = python.numpy.available && python.torch.available && python.xgboost.available;
const entrypointsReady = Object.values(entrypoints).every((row) => row.pass);
const labeledCorpusPresent = existsSync(labeledCorpusPath);
const materializedSourcePresent = existsSync(materializedSourcePath);
const status = contractsPresent && pythonReady && entrypointsReady && labeledCorpusPresent
  ? 'READY_FOR_FROZEN_CORPUS_EVAL'
  : contractsPresent
    ? !labeledCorpusPresent
      ? 'BLOCKED_MISSING_REVISION_QUALIFIED_CORPUS'
      : 'BLOCKED_RUNTIME_DEPENDENCY'
    : 'BLOCKED_MISSING_CONTRACT';

const report = {
  schema: 'atlas.query-router-v2-readiness-audit.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY_NO_TRAINING_NO_RETRIEVAL_WRITES',
  status,
  contractsPresent,
  pythonReady,
  entrypointsReady,
  labeledCorpus: {
    path: labeledCorpusPath,
    present: labeledCorpusPresent,
    requiredFor: ['ROUTE-04', 'ROUTE-05'],
    qualification: 'revision-qualified non-toy labels with query/label/embedding/representation revisions',
  },
  materializedSource: {
    path: materializedSourcePath,
    present: materializedSourcePresent,
    producedBy: 'materialize-query-router-source-v2.mts',
    requiredBefore: ['ROUTE-04', 'ROUTE-05'],
  },
  files,
  python,
  entrypoints,
  trainingExecuted: false,
  retrievalOwnerChanged: false,
  canonicalWritesAllowed: false,
  nextRequirement: status === 'READY_FOR_FROZEN_CORPUS_EVAL'
    ? 'RUN_FROZEN_CORPUS_EVAL'
    : !labeledCorpusPresent
      ? 'PROVIDE_REVISION_QUALIFIED_LABELED_QUERY_CORPUS'
      : 'SATISFY_REPORTED_BLOCKERS',
};

mkdirSync(dirname(reportJson), { recursive: true });
writeFileSync(reportJson, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
writeFileSync(reportMd, [
  '# Query Router V2 readiness audit',
  '',
  `- status: **${status}**`,
  '- mode: READ_ONLY_NO_TRAINING_NO_RETRIEVAL_WRITES',
  `- contracts present: ${contractsPresent}`,
  `- Python runtime ready: ${pythonReady}`,
  `- trainer/comparator entrypoints ready: ${entrypointsReady}`,
  `- revision-qualified labeled corpus present: ${labeledCorpusPresent}`,
  `- materialized router source present: ${materializedSourcePresent}`,
  '- training executed: false',
  '- retrieval owner changed: false',
  '',
  '## Python',
  ...Object.entries(python).map(([name, value]) => `- ${name}: ${value.available ? `AVAILABLE ${value.version}` : 'UNAVAILABLE'}`),
  '',
  '## Next requirement',
  '',
  report.nextRequirement,
  '',
].join('\n'), 'utf8');

console.log(JSON.stringify({ status, reportJson, reportMd }, null, 2));
if (!contractsPresent) process.exitCode = 1;
