#!/usr/bin/env node
import { createHash, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { Pool } from 'pg';
import { FRONTEND_ROOT, REPO_ROOT, loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
import {
  persistTestExecutionReceipts,
  verifyAndParseVitestExecution,
} from '../../sveltekit-frontend/src/lib/server/atlas/execution/test-receipt-ingest-v1.ts';

const REPORT_DIR = path.join(REPO_ROOT, '.tmp', 'atlas', 'test-execution');

function parseArguments(argv) {
  const tests = [];
  let apply = false;
  for (let index = 0; index < argv.length; index++) {
    const value = argv[index];
    if (value === '--apply') apply = true;
    else if (value === '--dry-run') apply = false;
    else if (value === '--test' && argv[index + 1]) tests.push(argv[++index]);
    else throw new Error(`UNKNOWN_ARGUMENT:${value}`);
  }
  if (tests.length === 0) throw new Error('AT_LEAST_ONE_TEST_FILE_REQUIRED');
  return { apply, tests };
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function resolveTestFiles(tests) {
  return tests.map((test) => {
    if (path.isAbsolute(test) || test.split(/[\\/]/).includes('..') || test.startsWith('-')) {
      throw new Error(`UNSAFE_TEST_PATH:${test}`);
    }
    const resolved = path.resolve(FRONTEND_ROOT, test);
    if (!resolved.startsWith(`${FRONTEND_ROOT}${path.sep}`) || !fs.statSync(resolved).isFile()) {
      throw new Error(`TEST_FILE_NOT_FOUND:${test}`);
    }
    return { path: resolved, sourceRef: path.relative(REPO_ROOT, resolved).replaceAll('\\', '/') };
  });
}

function gitHead() {
  const result = spawnSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' });
  if (result.status !== 0) throw new Error(`GIT_HEAD_UNAVAILABLE:${result.stderr}`);
  return result.stdout.trim();
}

async function persistOutcome(outcome) {
  const env = loadRepoEnv();
  const pool = new Pool({ connectionString: resolveDatabaseUrl(env) });
  try {
    return await persistTestExecutionReceipts(pool, outcome.receipts);
  } finally {
    await pool.end();
  }
}

async function main() {
  const { apply, tests } = parseArguments(process.argv.slice(2));
  const files = resolveTestFiles(tests);
  fs.mkdirSync(REPORT_DIR, { recursive: true });
  const eventId = randomUUID();
  const reportPath = path.join(REPORT_DIR, `${eventId}.vitest.json`);
  const sourceFiles = files.map(({ path: file, sourceRef }) => ({
    sourceRef,
    sha256: sha256(fs.readFileSync(file)),
  })).sort((left, right) => left.sourceRef.localeCompare(right.sourceRef));
  const testFileDigest = sha256(sourceFiles.map(({ sourceRef, sha256: digest }) =>
    `${sourceRef}\0${digest}`).join('\n'));
  const workspaceRevision = `sha256:${sha256(`${gitHead()}\0${testFileDigest}`)}`;
  const sourceRevision = `sha256:${testFileDigest}`;
  const runner = path.join(FRONTEND_ROOT, 'node_modules', 'vitest', 'vitest.mjs');
  const args = [runner, 'run', ...files.map(({ path: file }) => path.relative(FRONTEND_ROOT, file)),
    '--reporter=json', `--outputFile=${reportPath}`];
  const command = `node ${args.map((part) => JSON.stringify(part)).join(' ')}`;
  const execution = spawnSync(process.execPath, args, {
    cwd: FRONTEND_ROOT,
    encoding: 'utf8',
    env: loadRepoEnv(),
    maxBuffer: 64 * 1024 * 1024,
    timeout: 15 * 60 * 1000,
  });
  const exitCode = Number.isInteger(execution.status) ? execution.status : 1;
  if (!fs.existsSync(reportPath)) {
    throw new Error(`VITEST_JSON_REPORT_MISSING:exit=${exitCode}:stderr=${execution.stderr ?? ''}`);
  }
  const rawReport = fs.readFileSync(reportPath, 'utf8');
  const reportDigest = sha256(rawReport);
  const postRunSourceFiles = files.map(({ path: file, sourceRef }) => ({
    sourceRef,
    sha256: sha256(fs.readFileSync(file)),
  })).sort((left, right) => left.sourceRef.localeCompare(right.sourceRef));
  const postRunSourceDigest = sha256(postRunSourceFiles.map(({ sourceRef, sha256: digest }) =>
    `${sourceRef}\0${digest}`).join('\n'));
  const event = {
    toolEventId: eventId,
    command,
    exitCode,
    timedOut: execution.error?.code === 'ETIMEDOUT',
    rawStdout: rawReport,
    stdoutHash: `sha256:${reportDigest}`,
    workspaceRevision,
    sourceRevision: postRunSourceDigest === testFileDigest ? sourceRevision : '',
    producerRevision: `vitest@${JSON.parse(fs.readFileSync(path.join(FRONTEND_ROOT, 'node_modules', 'vitest', 'package.json'), 'utf8')).version}`,
    isSimulated: false,
  };
  const outcome = verifyAndParseVitestExecution(event, workspaceRevision);
  const eventPath = path.join(REPORT_DIR, `${eventId}.event.json`);
  fs.writeFileSync(eventPath, JSON.stringify({
    schema: 'atlas.vitest-execution-event.v1',
    ...event,
    rawStdout: undefined,
    sourceFiles,
    reportPath: path.relative(REPO_ROOT, reportPath).split(path.sep).join('/'),
  }, null, 2) + '\n');
  const summary = {
    schema: 'atlas.test-receipt-ingest-run.v1',
    toolEventId: eventId,
    command,
    exitCode,
    reportPath: path.relative(REPO_ROOT, reportPath).replaceAll('\\', '/'),
    eventPath: path.relative(REPO_ROOT, eventPath).split(path.sep).join('/'),
    reportDigest: `sha256:${reportDigest}`,
    sourceRevision,
    workspaceRevision,
    verificationStatus: 'PENDING_INDEPENDENT_VERIFICATION',
    parserAssessment: outcome.verificationStatus,
    qualified: false,
    isTrainable: false,
    assertions: { total: outcome.totalTests, passed: outcome.passedTests,
      failed: outcome.failedTests, skipped: outcome.skippedTests },
    receiptCount: outcome.receipts.length,
    databaseWrites: false,
  };
  if (apply && outcome.receipts.length > 0) {
    const persisted = await persistOutcome(outcome);
    summary.persistedReceiptCount = persisted.insertedCount;
    summary.databaseWrites = true;
  }
  process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
  if (execution.stderr) process.stderr.write(execution.stderr);
  if (exitCode !== 0) process.exitCode = exitCode;
}

main().catch((error) => {
  process.stderr.write(`${error.stack ?? error}\n`);
  process.exitCode = 1;
});
