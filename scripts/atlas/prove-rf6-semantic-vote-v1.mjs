import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const root = resolve(import.meta.dirname, '..', '..');
const searchRuntimePath = resolve(root, 'sveltekit-frontend/src/lib/server/retrieval/search-runtime.ts');
const testPath = resolve(root, 'sveltekit-frontend/src/lib/server/retrieval/__tests__/search-runtime-fusion.test.ts');

function readSource(path, relativePath) {
  if (!existsSync(path)) throw new Error(`MISSING_SOURCE:${relativePath}`);
  const bytes = readFileSync(path);
  return {
    path: relativePath,
    checksum: `sha256:${createHash('sha256').update(bytes).digest('hex')}`,
    text: bytes.toString('utf8'),
  };
}

const searchRuntime = readSource(searchRuntimePath, 'sveltekit-frontend/src/lib/server/retrieval/search-runtime.ts');
const tests = readSource(testPath, 'sveltekit-frontend/src/lib/server/retrieval/__tests__/search-runtime-fusion.test.ts');
const source = {
  searchRuntime: { path: searchRuntime.path, checksum: searchRuntime.checksum },
  tests: { path: tests.path, checksum: tests.checksum },
};
const checks = [
  ['EXECUTOR_PROVENANCE_FIELD', /retrievalExecutor\?: string \| null/.test(searchRuntime.text)],
  ['LANE_EVIDENCE_EXECUTOR_IDS', /executorIds: string\[\]/.test(searchRuntime.text)],
  ['REVISION_QUALIFIED_IDENTITY', /function getRevisionQualifiedFusionIdentityKey/.test(searchRuntime.text)],
  ['REVISION_KEY_USED_FOR_CANONICAL_GROUPING', /canonicalKey = identityStatus === 'canonical' \? getRevisionQualifiedFusionIdentityKey/.test(searchRuntime.text)],
  ['ONE_LANE_CONTRIBUTION', /const contribution = 1 \/ \(60 \+ group\.bestRank\)/.test(searchRuntime.text)],
  ['DENSE_EXECUTOR_REGRESSION', /one vote per revision-qualified dense candidate/.test(tests.text)],
  ['DISTINCT_CHUNK_REGRESSION', /keeps distinct canonical chunks separate/.test(tests.text)],
  ['REVISION_SEPARATION_REGRESSION', /different source revisions/.test(tests.text)],
  ['DETERMINISTIC_TIE_REGRESSION', /deterministic when executor hits tie/.test(tests.text)],
];

const testArgs = [
  'vitest', 'run',
  'src/lib/server/retrieval/__tests__/search-runtime-fusion.test.ts',
  'src/lib/server/retrieval/__tests__/rf6-live-replay-01.test.ts',
  '--reporter=dot',
];
const testRun = spawnSync('npx', testArgs, {
  cwd: resolve(root, 'sveltekit-frontend'),
  encoding: 'utf8',
  shell: true,
  timeout: 120_000,
});
const testPassed = testRun.status === 0;
const failures = checks.filter(([, passed]) => !passed).map(([name]) => name);
if (!testPassed) failures.push('FOCUSED_VITEST');

const report = {
  schema: 'atlas.rf6-semantic-vote-proof.v1',
  generatedAt: new Date().toISOString(),
  status: failures.length === 0 ? 'RF6_SEMANTIC_VOTE_PROVEN' : 'RF6_SEMANTIC_VOTE_FAILED',
  proofKind: 'READ_ONLY_FOCUSED_FUSION_REGRESSION',
  owner: 'SearchRuntime::fuseSearchRuntimeCandidates',
  invariant: 'one semantic vote per revision-qualified candidate per logical dense lane',
  checks: Object.fromEntries(checks.map(([name, passed]) => [name, passed])),
  focusedTest: {
    command: `npx ${testArgs.join(' ')}`,
    exitCode: testRun.status,
    signal: testRun.signal ?? null,
    outputTail: String(testRun.stdout ?? '').slice(-4000),
    errorTail: String(testRun.stderr ?? '').slice(-2000),
  },
  source,
  effects: {
    sourceInspectionReadOnly: true,
    canonicalWrites: false,
    datastoreWrites: 0,
    cacheWrites: 0,
    modelCalls: 0,
  },
  nextGate: 'RF6-SEMANTIC-REPLAY-01',
};

const reportPath = resolve(root, 'docs/reports/rf6-semantic-vote-proof-v1.json');
mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(`${report.status} checks=${checks.length} failed=${failures.length} report=${reportPath}`);
if (failures.length > 0) process.exitCode = 1;
