#!/usr/bin/env node
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const repoRoot = resolve(import.meta.dirname, '..', '..');
const packageRoot = resolve(repoRoot, 'packages', 'parent-atlas');
const reportPath = resolve(repoRoot, 'docs', 'reports', 'temporal-document-claim-fabric-v1.json');

const run = (command, args, cwd) => {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], shell: false });
  return {
    command: [command, ...args].join(' '),
    cwd,
    status: result.status,
    ok: result.status === 0,
    stdout_tail: (result.stdout ?? '').slice(-4000),
    stderr_tail: (result.stderr ?? '').slice(-4000),
  };
};

const steps = [
  run(process.platform === 'win32' ? 'node.exe' : 'node', process.platform === 'win32'
    ? [resolve(repoRoot, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', 'tsconfig.json']
    : [resolve(repoRoot, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', 'tsconfig.json'], packageRoot),
];
if (steps[0].ok) {
  steps.push(run(process.platform === 'win32' ? 'node.exe' : 'node', ['--test', './test/temporal-indexing-fabric.test.mjs'], packageRoot));
}

const report = {
  schema: 'atlas.temporal-document-claim-fabric-proof.v1',
  generated_at: new Date().toISOString(),
  read_only: true,
  canonical_authority: false,
  writes_performed: false,
  promotion_authorized: false,
  contracts: [
    'SourceArtifactV1',
    'SourceCoordinateMapV1',
    'DocumentObservationV1',
    'KnowledgeClaimV1',
    'RunManifestV1',
    'TemporalDocumentIndexV1',
  ],
  checks: steps,
  status: steps.length === 2 && steps.every((step) => step.ok)
    ? 'TEMPORAL_DOCUMENT_CLAIM_FABRIC_PROVEN'
    : 'TEMPORAL_DOCUMENT_CLAIM_FABRIC_BLOCKED',
  limitations: [
    'This proves the shared contract and deterministic freshness/checksum behavior only.',
    'No source snapshot was admitted and no canonical claim, graph, vector, cache, or database row was written.',
    'DOC-13 through DOC-26 remain separately gated by their existing live/readback requirements.',
  ],
};

mkdirSync(resolve(repoRoot, 'docs', 'reports'), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ...report, report_path: reportPath }, null, 2));
process.exitCode = report.status.endsWith('PROVEN') ? 0 : 1;
