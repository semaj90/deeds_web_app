/** DOC-25 isolated proof: apply a fixture proposal, compile it, and test its behavior. */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const reportPath = path.resolve(root, 'docs/reports/parent-atlas/doc-25-compiler-test-replay-receipt-v1.json');
const proposalPath = path.resolve(root, 'docs/reports/parent-atlas/doc-24-patch-proposal-fixture-v1.json');
const compilerPath = path.resolve(root, 'sveltekit-frontend/node_modules/typescript/bin/tsc');
const digest = (value) => `sha256:${createHash('sha256').update(value).digest('hex')}`;
const checks = [];
let tempDir;
let patchedSourceDigest = null;
let baseSourceRevision = null;

function run(name, executable, args, cwd) {
  const result = spawnSync(executable, args, { cwd, encoding: 'utf8', windowsHide: true });
  const passed = !result.error && result.status === 0;
  checks.push({
    name,
    argv: [executable, ...args],
    status: passed ? 'PASS' : 'FAIL',
    exitCode: result.status ?? 1,
    stdoutChecksum: digest(result.stdout ?? ''),
    stderrChecksum: digest(result.stderr ?? ''),
    ...(result.error ? { detail: result.error.message.slice(0, 300) } : {}),
  });
  return passed;
}

const gitHeadResult = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', windowsHide: true });
const gitStatusResult = spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8', windowsHide: true });
const repositoryRevision = gitHeadResult.status === 0 ? gitHeadResult.stdout.trim() : null;
const worktreeDirty = gitStatusResult.status === 0 ? gitStatusResult.stdout.trim().length > 0 : null;

try {
  const proposalReceipt = JSON.parse(await fs.readFile(proposalPath, 'utf8'));
  const proposal = proposalReceipt.proposal;
  baseSourceRevision = proposal?.baseSourceRevision ?? null;
  const baseSource = Buffer.from('export const value = "oldValue";\n', 'utf8');
  const hunk = proposal?.hunks?.length === 1 ? proposal.hunks[0] : null;
  const proposalEnvelopeValid = proposalReceipt.status === 'DOC_24_PATCH_PROPOSAL_FIXTURE_PROVEN' &&
    proposal?.schema === 'atlas.patch-proposal.v1' && proposal.sourceRef === 'src/example.ts' &&
    proposal.baseSourceRevision === digest(baseSource) && hunk &&
    Number.isSafeInteger(hunk.startByte) && Number.isSafeInteger(hunk.endByte) &&
    hunk.startByte >= 0 && hunk.endByte >= hunk.startByte && hunk.endByte <= baseSource.length &&
    baseSource.subarray(hunk.startByte, hunk.endByte).toString('utf8') === hunk.before &&
    proposal.mutationAuthorized === false && proposal.canonicalAuthority === false;
  checks.push({ name: 'proposal-and-base-revision-admission', status: proposalEnvelopeValid ? 'PASS' : 'FAIL', exitCode: proposalEnvelopeValid ? 0 : 1 });

  let patchedSource = null;
  if (proposalEnvelopeValid) {
    patchedSource = Buffer.concat([
      baseSource.subarray(0, hunk.startByte),
      Buffer.from(hunk.after, 'utf8'),
      baseSource.subarray(hunk.endByte),
    ]);
    patchedSourceDigest = digest(patchedSource);
    checks.push({ name: 'proposal-patch-digest', status: proposal.patchDigest === patchedSourceDigest ? 'PASS' : 'FAIL', exitCode: proposal.patchDigest === patchedSourceDigest ? 0 : 1 });
  }

  if (patchedSource && await fs.access(compilerPath).then(() => true, () => false)) {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'atlas-doc25-replay-'));
    await fs.mkdir(path.join(tempDir, 'src'), { recursive: true });
    await fs.mkdir(path.join(tempDir, 'test'), { recursive: true });
    await fs.writeFile(path.join(tempDir, 'src/example.ts'), patchedSource);
    await fs.writeFile(path.join(tempDir, 'test/example.test.cjs'), [
      "const test = require('node:test');",
      "const assert = require('node:assert/strict');",
      "const { value } = require('../dist/example.js');",
      "test('isolated proposed patch has the expected behavior', () => assert.equal(value, 'newValue'));",
      '',
    ].join('\n'));

    run('typescript-compile-and-typecheck', process.execPath, [
      compilerPath, '--strict', '--noEmitOnError', '--target', 'ES2022', '--module', 'commonjs',
      '--outDir', 'dist', 'src/example.ts',
    ], tempDir);
    const compilePassed = checks.at(-1)?.status === 'PASS';
    if (compilePassed) run('compiled-output-behavior-test', process.execPath, ['--test', 'test/example.test.cjs'], tempDir);
    else checks.push({ name: 'compiled-output-behavior-test', status: 'NOT_RUN', exitCode: null });
  } else {
    checks.push({ name: 'typescript-compile-and-typecheck', status: 'NOT_RUN', exitCode: null, detail: 'proposal rejected or TypeScript compiler unavailable' });
    checks.push({ name: 'compiled-output-behavior-test', status: 'NOT_RUN', exitCode: null });
  }

  const openspecCommand = process.env.ComSpec ?? 'cmd.exe';
  run('versioned-doc-openspec-validation', openspecCommand, [
    '/d', '/s', '/c', 'npx openspec validate parent-atlas-versioned-doc-intelligence --type change --strict --json --no-interactive',
  ], root);
} catch (error) {
  checks.push({ name: 'replay-harness', status: 'FAIL', exitCode: 1, detail: String(error?.stack ?? error).slice(0, 500) });
} finally {
  if (tempDir) await fs.rm(tempDir, { recursive: true, force: true });
}

const receiptInputs = {
  proposalReceiptChecksum: digest(await fs.readFile(proposalPath)),
  baseSourceRevision,
  patchedSourceChecksum: patchedSourceDigest,
  checks,
};
const validationChecksum = digest(Buffer.from(JSON.stringify(receiptInputs), 'utf8'));
const passed = checks.length >= 5 && checks.every((check) => check.status === 'PASS');
const report = {
  schema: 'atlas.doc-25-compiler-test-replay-receipt.v1',
  gate: 'DOC-25',
  status: passed ? 'DOC_25_LIVE_ISOLATED_PATCH_COMPILER_TEST_REPLAY_PROVEN' : 'DOC_25_LIVE_ISOLATED_PATCH_COMPILER_TEST_REPLAY_FAILED',
  proofMode: 'SYNTHETIC_FIXTURE_ONLY',
  repositoryRevision,
  worktreeDirty,
  proposalRef: 'docs/reports/parent-atlas/doc-24-patch-proposal-fixture-v1.json',
  proposalReceiptChecksum: receiptInputs.proposalReceiptChecksum,
  sourceRef: 'src/example.ts',
  baseSourceRevision,
  patchedSourceChecksum: patchedSourceDigest,
  isolatedWorkspace: { created: Boolean(tempDir), cleanedAfterRun: true, persistentSourceModified: false },
  validationChecks: checks,
  validationChecksum,
  patchApplied: false,
  isolatedFixturePatchApplied: patchedSourceDigest !== null,
  mutationAuthorized: false,
  canonicalAuthority: false,
  writesPerformed: false,
  ephemeralWritesPerformed: Boolean(tempDir),
  persistentWritesPerformed: false,
  nextGate: 'DOC_23_LIVE_AST_GREP_EXECUTION_AND_DIFF_VALIDATION',
};
const reportTempPath = `${reportPath}.${process.pid}.tmp`;
try {
  await fs.writeFile(reportTempPath, `${JSON.stringify(report, null, 2)}\n`, { encoding: 'utf8', flag: 'wx' });
  await fs.rename(reportTempPath, reportPath);
} catch (error) {
  await fs.rm(reportTempPath, { force: true });
  throw error;
}
console.log(JSON.stringify({ reportPath, status: report.status, checks, persistentWritesPerformed: false }, null, 2));
if (!passed) process.exitCode = 1;
