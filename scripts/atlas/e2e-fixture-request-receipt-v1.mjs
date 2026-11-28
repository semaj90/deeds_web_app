#!/usr/bin/env node
/**
 * Bounded local fixture receipt for the Parent Atlas retrieval work.
 *
 * Runs only two focused Vitest files. It does not contact services, databases,
 * Qdrant, Neo4j, model endpoints, or write to canonical stores. The receipt
 * records the narrower behavior those fixtures actually exercise; it is not a
 * claim that a complete route-to-synthesis request is wired.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve, relative } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPT_DIR, '../..');
const FRONTEND = resolve(ROOT, 'sveltekit-frontend');
const VITEST = resolve(FRONTEND, 'node_modules/vitest/vitest.mjs');
const inputs = [
  'scripts/atlas/graph-algorithm-ownership-v1.mjs',
  'scripts/atlas/graph-algorithm-ownership-v1.test.mjs',
  'sveltekit-frontend/src/lib/server/atlas/execution/e2e-eg2-nlut-graph-materializer-v1.spec.ts',
  'sveltekit-frontend/src/lib/server/topology/pagerank-schema-audit.ts',
];

function sha256(path) {
  return createHash('sha256').update(readFileSync(resolve(ROOT, path))).digest('hex');
}

function runFocusedVitest(label, cwd, args) {
  const started = Date.now();
  const result = spawnSync(process.execPath, [VITEST, 'run', ...args], {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
    timeout: 180_000,
    maxBuffer: 16 * 1024 * 1024,
  });
  const output = `${result.stdout ?? ''}${result.stderr ?? ''}`;
  return {
    label,
    command: [process.execPath, relative(ROOT, VITEST), 'run', ...args],
    cwd: relative(ROOT, cwd) || '.',
    exitCode: result.status ?? (result.error ? null : 1),
    elapsedMs: Date.now() - started,
    timedOut: result.error?.code === 'ETIMEDOUT',
    error: result.error ? `${result.error.name}: ${result.error.message}` : null,
    outputTail: output.slice(-12000),
  };
}

function uniqueReceiptPath() {
  const dir = resolve(ROOT, '.tmp/review');
  const stamp = new Date().toISOString().replaceAll(':', '').replaceAll('.', '-');
  let candidate = resolve(dir, `parent-atlas-phase-b-c-fixture-${stamp}.json`);
  let suffix = 1;
  while (existsSync(candidate)) {
    candidate = resolve(dir, `parent-atlas-phase-b-c-fixture-${stamp}-${suffix++}.json`);
  }
  return candidate;
}

function main() {
  if (!existsSync(VITEST)) throw new Error(`Vitest entrypoint not found: ${VITEST}`);
  for (const path of inputs) {
    if (!existsSync(resolve(ROOT, path))) throw new Error(`Required fixture input not found: ${path}`);
  }

  const runs = [
    runFocusedVitest(
      'graph algorithm ownership contract',
      ROOT,
      ['--root', 'scripts/atlas', 'graph-algorithm-ownership-v1.test.mjs'],
    ),
    runFocusedVitest(
      'EG2 NLUT graph materializer fixture',
      FRONTEND,
      ['src/lib/server/atlas/execution/e2e-eg2-nlut-graph-materializer-v1.spec.ts'],
    ),
  ];
  const allPassed = runs.every((run) => run.exitCode === 0);
  const body = {
    schema: 'parent-atlas.phase-b-c-fixture-receipt.v1',
    scope: 'FIXTURE_ONLY',
    status: allPassed ? 'PASS' : 'FAIL',
    endToEndPromotionStatus: 'NOT_PROVEN',
    generatedAt: new Date().toISOString(),
    worktreeHead: spawnSync('git', ['rev-parse', 'HEAD'], { cwd: ROOT, encoding: 'utf8' }).stdout?.trim() ?? null,
    canonicalAuthority: false,
    canonicalWrites: false,
    externalServicesContacted: false,
    liveDatabaseRead: false,
    note: 'Focused local tests prove fixture contracts only. The materializer test uses synthetic candidate vectors/lanes and a hand-authored graph fixture; it is not a complete request through Go Retrieval, PG18, Qdrant, live atlas_topology_index/GDS, BitFrost/Headroom, or Gemma 4.',
    stages: [
      { owner: '.okf query/domain routing', status: 'NOT_EXERCISED' },
      { owner: 'EmbeddingGemma 2 inference', status: 'NOT_EXERCISED' },
      { owner: 'Go Retrieval + Qdrant', status: 'NOT_EXERCISED' },
      { owner: 'PG18 identity/grant hydration', status: 'NOT_EXERCISED' },
      { owner: 'SearchRuntime candidate-fusion helper', status: 'EXERCISED_WITH_SYNTHETIC_LANE_RESULTS' },
      { owner: 'Production SearchRuntime.search single-fusion route', status: 'NOT_EXERCISED' },
      { owner: 'Graph / masked Top-K materializer fixture', status: 'EXERCISED_WITH_SYNTHETIC_FIXTURES' },
      { owner: 'BitFrost / Headroom / synthesis', status: 'NOT_EXERCISED' },
    ],
    adversarialChecks: [
      'The existing fixture checks that a foreign LUT category outside the allowed mask is excluded.',
      'The existing fixture checks bounded graph/materializer behavior against its local fixture data.',
    ],
    testRuns: runs,
    inputSha256: Object.fromEntries(inputs.map((path) => [path, `sha256:${sha256(path)}`])),
    reportWrite: { allowedPath: '.tmp/review/', overwrite: false },
  };
  body.receiptSha256 = `sha256:${createHash('sha256').update(JSON.stringify(body)).digest('hex')}`;

  const outPath = uniqueReceiptPath();
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(body, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  console.log(JSON.stringify({ status: body.status, endToEndPromotionStatus: body.endToEndPromotionStatus, runs: runs.map(({ label, exitCode, elapsedMs }) => ({ label, exitCode, elapsedMs })), reportPath: relative(ROOT, outPath), receiptSha256: body.receiptSha256 }, null, 2));
  if (!allPassed) process.exitCode = 1;
}

main();
