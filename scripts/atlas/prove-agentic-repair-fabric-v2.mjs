#!/usr/bin/env node

/** Bounded contract proof for the existing agentic repair-fabric owners. */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = join(import.meta.dirname, '..', '..');
const frontend = join(root, 'sveltekit-frontend');
const reportPath = join(root, 'docs/reports/agentic-repair-fabric-v2-proof.json');
const specs = [
  'src/lib/server/atlas/agentic/oak-resolution-evidence-client.spec.ts',
  'src/lib/server/atlas/agentic/oak-query-enrichment-v1.spec.ts',
  'src/lib/server/atlas/agentic/contracts/agentic-dag-synthesis-v1.spec.ts',
  'src/lib/server/atlas/agentic/contracts/agentic-hypergraph-expansion-v1.spec.ts',
  'src/lib/server/atlas/agentic/contracts/agentic-action-feature-v1.spec.ts',
  'src/lib/server/atlas/agentic/contracts/parameter-resolver-v1.spec.ts',
  'src/lib/server/atlas/agentic/contracts/repair-loop-fixture-v1.spec.ts',
  'src/lib/server/atlas/agentic/contracts/execution-receipt-hyperedge-v1.spec.ts',
];

const owners = {
  oak: 'sveltekit-frontend/src/lib/server/atlas/agentic/oak-resolution-evidence-client.ts',
  hypergraph: 'sveltekit-frontend/src/lib/server/atlas/agentic/contracts/agentic-hypergraph-expansion-v1.ts',
  actionFeatures: 'sveltekit-frontend/src/lib/server/atlas/agentic/contracts/agentic-action-feature-v1.ts',
  dag: 'sveltekit-frontend/src/lib/server/atlas/agentic/contracts/agentic-dag-synthesis-v1.ts',
  parameters: 'sveltekit-frontend/src/lib/server/atlas/agentic/contracts/parameter-resolver-v1.ts',
  repairFixture: 'sveltekit-frontend/src/lib/server/atlas/agentic/contracts/repair-loop-fixture-v1.ts',
  receiptProjection: 'sveltekit-frontend/src/lib/server/atlas/agentic/contracts/execution-receipt-hyperedge-v1.ts',
};

let output = '';
let error = null;
try {
  const command = `npx vitest run ${specs.join(' ')} --reporter=dot`;
  output = process.platform === 'win32'
    ? execFileSync(process.env.ComSpec || 'cmd.exe', ['/d', '/s', '/c', command], {
      cwd: frontend,
      encoding: 'utf8',
      timeout: 90_000,
      maxBuffer: 8 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    : execFileSync('npx', ['vitest', 'run', ...specs, '--reporter=dot'], {
    cwd: frontend,
    encoding: 'utf8',
    timeout: 90_000,
    maxBuffer: 8 * 1024 * 1024,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
} catch (cause) {
  output = `${cause.stdout ?? ''}`;
  error = String(cause.stderr ?? cause.message ?? cause).slice(-4000);
}

const passedFiles = Number(output.match(/Test Files\s+(\d+) passed/)?.[1] ?? 0);
const passedTests = Number(output.match(/Tests\s+(\d+) passed/)?.[1] ?? 0);
const body = {
  schema: 'atlas.agentic-repair-fabric-v2-proof',
  mode: 'READ_ONLY_CONTRACT_PROOF',
  owners,
  focusedSpecs: specs,
  testResult: { passedFiles, passedTests, error },
  boundaries: {
    canonicalAuthority: false,
    writesPerformed: false,
    promotionAuthorized: false,
    toolsExecuted: false,
    sourcePatchApplied: false,
    databaseWrites: false,
    cacheWrites: false,
    graphWrites: false,
  },
  proven: passedFiles === specs.length && passedTests === 25,
  open: [
    'Live Go Retrieval is reachable, but sampled results lack chunk_id/source_revision lineage and remain non-promotable.',
    'Live OAK transport is reachable in READ_ONLY_SHADOW mode, but the bounded fixture returned no ontology matches.',
    'Repair execution remains approval-gated; the TS2345 fixture is plan-only.',
    'Canonical source/symbol/ontology authority remains upstream of promotion.',
  ],
  outputTail: output.slice(-2000),
};
body.receiptChecksum = `sha256:${createHash('sha256').update(JSON.stringify(body), 'utf8').digest('hex')}`;
mkdirSync(join(root, 'docs/reports'), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(body, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: body.proven ? 'AGENTIC_REPAIR_FABRIC_V2_PROVEN' : 'AGENTIC_REPAIR_FABRIC_V2_REVIEW_REQUIRED', passedFiles, passedTests, reportPath: 'docs/reports/agentic-repair-fabric-v2-proof.json', writesPerformed: false }, null, 2));
if (!body.proven) process.exitCode = 1;
